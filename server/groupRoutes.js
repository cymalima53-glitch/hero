const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const GROUPS_FILE = path.join(__dirname, '../data/groups.json');
const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
const GROUP_ASSIGNMENTS_FILE = path.join(__dirname, '../data/group_assignments.json');
const ASSIGNMENTS_FILE = path.join(__dirname, '../data/assignments.json');

module.exports = function (app, requireAuth) {

    // === HELPERS ===
    async function loadData(filePath, key) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data)[key] || [];
        } catch (e) {
            return [];
        }
    }

    async function saveData(filePath, key, data) {
        await fs.writeFile(filePath, JSON.stringify({ [key]: data }, null, 2));
    }

    // === ROUTES ===

    // GET /api/groups - List groups for teacher
    app.get('/api/groups', requireAuth, async (req, res) => {
        try {
            const groups = await loadData(GROUPS_FILE, 'groups');
            const myGroups = groups.filter(g => g.teacherId === req.teacherId);
            res.json({ groups: myGroups });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to load groups' });
        }
    });

    // POST /api/groups - Create a group
    app.post('/api/groups', requireAuth, async (req, res) => {
        try {
            const { name } = req.body;
            if (!name) return res.status(400).json({ error: 'Group name required' });

            const groups = await loadData(GROUPS_FILE, 'groups');

            const newGroup = {
                id: 'grp_' + crypto.randomUUID(),
                teacherId: req.teacherId,
                name: name.trim(),
                createdAt: new Date().toISOString()
            };

            groups.push(newGroup);
            await saveData(GROUPS_FILE, 'groups', groups);

            res.json({ success: true, group: newGroup });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to create group' });
        }
    });

    // PUT /api/groups/:id - Update group name
    app.put('/api/groups/:id', requireAuth, async (req, res) => {
        try {
            const { name } = req.body;
            const groupId = req.params.id;

            if (!name) return res.status(400).json({ error: 'Name required' });

            const groups = await loadData(GROUPS_FILE, 'groups');
            const groupIndex = groups.findIndex(g => g.id === groupId);

            if (groupIndex === -1) return res.status(404).json({ error: 'Group not found' });
            if (groups[groupIndex].teacherId !== req.teacherId) return res.status(403).json({ error: 'Unauthorized' });

            groups[groupIndex].name = name.trim();
            await saveData(GROUPS_FILE, 'groups', groups);

            res.json({ success: true, group: groups[groupIndex] });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to update group' });
        }
    });

    // DELETE /api/groups/:id - Delete group (and unset student groupIds, but keep assignments)
    app.delete('/api/groups/:id', requireAuth, async (req, res) => {
        try {
            const groupId = req.params.id;
            let groups = await loadData(GROUPS_FILE, 'groups');

            const group = groups.find(g => g.id === groupId);
            if (!group) return res.status(404).json({ error: 'Group not found' });
            if (group.teacherId !== req.teacherId) return res.status(403).json({ error: 'Unauthorized' });

            // 1. Remove group
            groups = groups.filter(g => g.id !== groupId);
            await saveData(GROUPS_FILE, 'groups', groups);

            // 2. Unlink students
            const students = await loadData(STUDENTS_FILE, 'students');
            let studentsChanged = false;
            students.forEach(s => {
                if (s.groupId === groupId) {
                    delete s.groupId;
                    studentsChanged = true;
                }
            });
            if (studentsChanged) await saveData(STUDENTS_FILE, 'students', students);

            // 3. Remove Group Assignments (Optional: we can keep historical record or delete)
            // Let's delete future group assignments so they don't apply if group ID is somehow reused (unlikely)
            let groupAssignments = await loadData(GROUP_ASSIGNMENTS_FILE, 'groupAssignments');
            groupAssignments = groupAssignments.filter(ga => ga.groupId !== groupId);
            await saveData(GROUP_ASSIGNMENTS_FILE, 'groupAssignments', groupAssignments);

            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete group' });
        }
    });

    // POST /api/groups/:id/assign - Assign Game to Whole Group (Current + Future)
    app.post('/api/groups/:id/assign', requireAuth, async (req, res) => {
        try {
            const groupId = req.params.id;
            const { gameId, settings } = req.body;

            if (!gameId) return res.status(400).json({ error: 'Game ID required' });

            // 1. Verify Group Ownership
            const groups = await loadData(GROUPS_FILE, 'groups');
            const group = groups.find(g => g.id === groupId);
            if (!group) return res.status(404).json({ error: 'Group not found' });
            if (group.teacherId !== req.teacherId) return res.status(403).json({ error: 'Unauthorized' });

            // 2. Save Group Assignment (for FUTURE students)
            const groupAssignments = await loadData(GROUP_ASSIGNMENTS_FILE, 'groupAssignments');
            const newGroupAssign = {
                id: 'ga_' + crypto.randomUUID(),
                teacherId: req.teacherId,
                groupId: groupId,
                gameId: gameId,
                settings: settings || {},
                createdAt: new Date().toISOString()
            };
            groupAssignments.push(newGroupAssign);
            await saveData(GROUP_ASSIGNMENTS_FILE, 'groupAssignments', groupAssignments);

            // 3. Assign to CURRENT students in group
            const students = await loadData(STUDENTS_FILE, 'students');
            const groupStudentIds = students
                .filter(s => s.groupId === groupId && s.teacherId === req.teacherId)
                .map(s => s.id);

            if (groupStudentIds.length > 0) {
                const assignments = await loadData(ASSIGNMENTS_FILE, 'assignments');
                const newAssignments = [];

                groupStudentIds.forEach(sId => {
                    // Check if already assigned this exact thing recently?
                    // For now, simplicity: just assign. Duplicates allowed if teacher clicks twice.
                    const newAssign = {
                        id: 'as_' + crypto.randomUUID(),
                        teacherId: req.teacherId,
                        studentId: sId,
                        gameId: gameId,
                        settings: settings || {},
                        status: 'pending',
                        score: 0,
                        createdAt: new Date().toISOString(),
                        fromGroupAssignmentId: newGroupAssign.id // Traceability
                    };
                    assignments.push(newAssign);
                    newAssignments.push(newAssign);
                });

                await saveData(ASSIGNMENTS_FILE, 'assignments', assignments);
                res.json({ success: true, count: newAssignments.length, groupAssignmentId: newGroupAssign.id });
            } else {
                res.json({ success: true, count: 0, message: 'Group has no students yet, but assignment is saved for future members.' });
            }

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to assign to group' });
        }
    });

    // ANALYTICS: Get Group Progress & Stats
    app.get('/api/groups/:id/analytics', requireAuth, async (req, res) => {
        try {
            const groupId = req.params.id;

            // 1. Data Loading
            const studentsData = await fs.readFile(STUDENTS_FILE, 'utf8').catch(() => '{"students":[]}');
            const assignmentsData = await fs.readFile(ASSIGNMENTS_FILE, 'utf8').catch(() => '{"assignments":[]}');

            const allStudents = JSON.parse(studentsData).students || [];
            const allAssignments = JSON.parse(assignmentsData).assignments || [];

            // 2. Filter for this Group
            const groupStudents = allStudents.filter(s => s.groupId === groupId && s.teacherId === req.teacherId);
            const studentIds = groupStudents.map(s => s.id);

            if (studentIds.length === 0) {
                return res.json({
                    studentCount: 0,
                    completionRate: 0,
                    avgScore: 0,
                    assignmentsCount: 0,
                    gamePerformance: {}
                });
            }

            // 3. Get Assignments for these students
            const groupAssignments = allAssignments.filter(a => studentIds.includes(a.studentId));

            // 4. Calculate Stats
            let totalCompleted = 0;
            let totalScore = 0;
            let scoreCount = 0;
            const gameStats = {}; // { gameId: { totalScore: 0, count: 0, name: '' } }

            groupAssignments.forEach(a => {
                if (a.status === 'completed') {
                    totalCompleted++;
                    if (typeof a.score === 'number') {
                        totalScore += a.score;
                        scoreCount++;

                        // Per Game Stats
                        if (!gameStats[a.gameId]) gameStats[a.gameId] = { totalScore: 0, count: 0 };
                        gameStats[a.gameId].totalScore += a.score;
                        gameStats[a.gameId].count++;
                    }
                }
            });

            const completionRate = groupAssignments.length > 0
                ? Math.round((totalCompleted / groupAssignments.length) * 100)
                : 0;

            const avgScore = scoreCount > 0
                ? Math.round(totalScore / scoreCount)
                : 0;

            // Format Game Performance for Chart
            const gamePerformance = {};
            Object.keys(gameStats).forEach(gid => {
                gamePerformance[gid] = Math.round(gameStats[gid].totalScore / gameStats[gid].count);
            });

            res.json({
                studentCount: groupStudents.length,
                assignmentsCount: groupAssignments.length,
                completedCount: totalCompleted,
                completionRate,
                avgScore,
                gamePerformance
            });

        } catch (e) {
            console.error("Group Analytics Error:", e);
            res.status(500).json({ error: "Failed to calculate analytics" });
        }
    });


    // POST /api/groups/:id/reset - Reset Progress for Group
    app.post('/api/groups/:id/reset', requireAuth, async (req, res) => {
        try {
            const groupId = req.params.id;

            // 1. Verify Group Ownership
            console.log(`[API] Reset requested for Group ID: ${groupId} by Teacher: ${req.teacherId}`);
            const groups = await loadData(GROUPS_FILE, 'groups');
            const group = groups.find(g => g.id === groupId);
            if (!group) return res.status(404).json({ error: 'Group not found' });
            if (group.teacherId !== req.teacherId) return res.status(403).json({ error: 'Unauthorized' });

            // 2. Identify Students in Group
            const students = await loadData(STUDENTS_FILE, 'students');
            const groupStudentIds = students
                .filter(s => s.groupId === groupId && s.teacherId === req.teacherId)
                .map(s => s.id);

            if (groupStudentIds.length === 0) {
                return res.json({ success: true, count: 0, message: 'Group has no students.' });
            }

            // 3. Update Assignments
            const assignments = await loadData(ASSIGNMENTS_FILE, 'assignments');
            let updatedCount = 0;

            assignments.forEach(a => {
                if (groupStudentIds.includes(a.studentId)) {
                    // Reset Status & Scores
                    a.status = 'pending';
                    a.score = 0;
                    a.accuracy = undefined;
                    a.mistakes = undefined;
                    a.duration = undefined;
                    // Keep 'createdAt' to maintain order/history of assignment
                    // Keep 'settings', 'gameId', 'id'
                    updatedCount++;
                }
            });

            await saveData(ASSIGNMENTS_FILE, 'assignments', assignments);

            // 4. DELETE SESSIONS (Crucial for Dashboard Stats)
            const SESSIONS_DIR = path.join(__dirname, '../data/sessions');
            try {
                const files = await fs.readdir(SESSIONS_DIR);
                let deletedSessions = 0;
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(SESSIONS_DIR, file);
                        try {
                            const content = await fs.readFile(filePath, 'utf8');
                            const sess = JSON.parse(content);
                            if (groupStudentIds.includes(sess.studentId)) {
                                await fs.unlink(filePath);
                                deletedSessions++;
                            }
                        } catch (e) {
                            console.error(`Error processing session ${file} during group reset:`, e);
                        }
                    }
                }
                console.log(`[GROUP RESET] Deleted ${deletedSessions} sessions for Group ${groupId}`);
            } catch (err) {
                console.error("Error clearing sessions:", err);
            }

            console.log(`[GROUP RESET] Reset ${updatedCount} assignments for Group ${groupId}`);
            res.json({ success: true, count: updatedCount });

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to reset group progress' });
        }
    });

};
