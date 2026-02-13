const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
const GROUP_ASSIGNMENTS_FILE = path.join(__dirname, '../data/group_assignments.json');
const ASSIGNMENTS_FILE = path.join(__dirname, '../data/assignments.json');

module.exports = function (app, requireAuth) {
    // Removed Stripe subscription middleware for FREE deployment

    // HELPER: Read Students
    async function getStudents() {
        try {
            const data = await fs.readFile(STUDENTS_FILE, 'utf8');
            return JSON.parse(data).students || [];
        } catch (e) {
            return [];
        }
    }

    // HELPER: Write Students
    async function saveStudents(students) {
        await fs.writeFile(STUDENTS_FILE, JSON.stringify({ students }, null, 2));
    }

    // HELPER: Auto-assign group games to student
    async function autoAssignGroupGames(studentId, groupId, teacherId) {
        try {
            // 1. Get Group Assignments
            const gaData = await fs.readFile(GROUP_ASSIGNMENTS_FILE, 'utf8').catch(() => '{"groupAssignments":[]}');
            const groupAssignments = JSON.parse(gaData).groupAssignments || [];

            // Filter for this group
            const relevantGA = groupAssignments.filter(ga => ga.groupId === groupId);
            if (relevantGA.length === 0) return;

            // 2. Get Existing Assignments
            const aData = await fs.readFile(ASSIGNMENTS_FILE, 'utf8').catch(() => '{"assignments":[]}');
            const assignments = JSON.parse(aData).assignments || [];

            const newAssignments = [];
            relevantGA.forEach(ga => {
                // Check if already assigned (optional, but good practice)
                const exists = assignments.find(a => a.studentId === studentId && a.gameId === ga.gameId && a.fromGroupAssignmentId === ga.id);
                if (exists) return;

                const newAssign = {
                    id: 'as_' + crypto.randomUUID(),
                    teacherId: teacherId,
                    studentId: studentId,
                    gameId: ga.gameId,
                    settings: ga.settings || {},
                    status: 'pending',
                    score: 0,
                    createdAt: new Date().toISOString(),
                    fromGroupAssignmentId: ga.id
                };
                assignments.push(newAssign);
                newAssignments.push(newAssign);
            });

            if (newAssignments.length > 0) {
                await fs.writeFile(ASSIGNMENTS_FILE, JSON.stringify({ assignments }, null, 2));
                console.log(`[AutoAssign] Assigned ${newAssignments.length} games to student ${studentId} (Group ${groupId})`);
            }
        } catch (e) {
            console.error("Auto-assign failed:", e);
        }
    }

    // GET STUDENTS (For logged-in Teacher)
    app.get('/api/students', requireAuth, async (req, res) => {
        try {
            const students = await getStudents();
            // Filter: Only show students belonging to this teacher
            // ISOLATION SECURITY CRITICAL
            const myStudents = students.filter(s => s.teacherId === req.teacherId);
            // Don't send password hashes
            const safeStudents = myStudents.map(({ passwordHash, ...rest }) => rest);
            res.json({ students: safeStudents });
        } catch (err) {
            res.status(500).json({ error: 'Failed to load students' });
        }
    });

    // CREATE STUDENT
    app.post('/api/students', requireAuth, async (req, res) => {
        try {
            const { name, username, password, parentEmail, groupId } = req.body;

            if (!name || !username || !password) {
                return res.status(400).json({ error: 'Name, username, and password required' });
            }

            const students = await getStudents();

            // Check username uniqueness (Global)
            if (students.find(s => s.username === username.trim())) {
                return res.status(400).json({ error: 'Username already taken' });
            }

            // Hash password
            const hash = await bcrypt.hash(password, 10);

            const newStudent = {
                id: 's_' + crypto.randomUUID(),
                teacherId: req.teacherId, // Link to creator
                name: name.trim(),
                username: username.trim(),
                passwordHash: hash,
                parentEmail: (parentEmail || '').trim(),
                groupId: groupId || null,
                createdAt: new Date().toISOString()
            };

            students.push(newStudent);
            await saveStudents(students);

            // Trigger Auto-Assignment if Group ID provided
            if (groupId) {
                autoAssignGroupGames(newStudent.id, groupId, req.teacherId);
            }

            // Return without hash
            const { passwordHash, ...safeStudent } = newStudent;
            res.json({ success: true, student: safeStudent });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to create student' });
        }
    });

    // DELETE STUDENT
    app.delete('/api/students/:id', requireAuth, async (req, res) => {
        try {
            const studentId = req.params.id;
            let students = await getStudents();

            // Check ownership
            const student = students.find(s => s.id === studentId);
            if (!student) return res.status(404).json({ error: 'Student not found' });

            // ISOLATION SECURITY CRITICAL
            if (student.teacherId !== req.teacherId) return res.status(403).json({ error: 'Unauthorized' });

            students = students.filter(s => s.id !== studentId);
            await saveStudents(students);

            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete student' });
        }
    });

    // UPDATE STUDENT (Reset Password or Update Details)
    app.put('/api/students/:id', requireAuth, async (req, res) => {
        try {
            const studentId = req.params.id;
            const { password, name, username, groupId } = req.body; // Allow updating other fields too
            let students = await getStudents();

            const studentIndex = students.findIndex(s => s.id === studentId);
            if (studentIndex === -1) return res.status(404).json({ error: 'Student not found' });

            const student = students[studentIndex];
            if (student.teacherId !== req.teacherId) return res.status(403).json({ error: 'Unauthorized' });

            // Update fields
            if (name) student.name = name.trim();
            if (username) {
                // Check uniqueness if changing
                if (username !== student.username && students.find(s => s.username === username.trim())) {
                    return res.status(400).json({ error: 'Username already taken' });
                }
                student.username = username.trim();
            }
            if (password) {
                student.passwordHash = await bcrypt.hash(password, 10);
            }

            // Handle Group Change
            if (groupId !== undefined) {
                const oldGroupId = student.groupId;
                student.groupId = groupId;

                if (groupId && groupId !== oldGroupId) {
                    autoAssignGroupGames(student.id, groupId, req.teacherId);
                }
            }

            students[studentIndex] = student;
            await saveStudents(students);

            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to update student' });
        }
    });

    // POST /api/students/:id/reset - Reset Progress for Individual Student
    app.post('/api/students/:id/reset', requireAuth, async (req, res) => {
        try {
            const studentId = req.params.id;

            // 1. Verify Student Ownership
            console.log(`[API] Reset requested for Student ID: ${studentId} by Teacher: ${req.teacherId}`);
            const students = await getStudents();
            const student = students.find(s => s.id === studentId);
            if (!student) {
                console.log('[API] Student not found');
                return res.status(404).json({ error: 'Student not found' });
            }
            if (student.teacherId !== req.teacherId) {
                console.log('[API] Unauthorized access to student');
                return res.status(403).json({ error: 'Unauthorized' });
            }

            // 2. Reset Assignments
            const assignmentsData = await fs.readFile(ASSIGNMENTS_FILE, 'utf8').catch(() => '{"assignments":[]}');
            let assignments = JSON.parse(assignmentsData).assignments || [];

            let updatedCount = 0;
            assignments.forEach(a => {
                if (a.studentId === studentId) {
                    a.status = 'pending';
                    a.score = 0;
                    a.analytics = undefined; // Clear analytics
                    // Keep other fields: id, gameId, settings, createdAt, teacherId, fromGroupAssignmentId
                    updatedCount++;
                }
            });

            await fs.writeFile(ASSIGNMENTS_FILE, JSON.stringify({ assignments }, null, 2));

            // 3. DELETE SESSIONS (Crucial for Dashboard Stats)
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
                            if (sess.studentId === studentId) {
                                await fs.unlink(filePath);
                                deletedSessions++;
                            }
                        } catch (e) {
                            console.error(`Error processing session ${file} during reset:`, e);
                        }
                    }
                }
                console.log(`[STUDENT RESET] Deleted ${deletedSessions} sessions for Student ${studentId}`);
            } catch (err) {
                console.error("Error clearing sessions:", err);
            }

            console.log(`[STUDENT RESET] Reset ${updatedCount} assignments for Student ${studentId}`);
            res.json({ success: true, count: updatedCount });

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to reset student progress' });
        }
    });
};
