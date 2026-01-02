const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const ASSIGNMENTS_FILE = path.join(__dirname, '../data/assignments.json');
const STUDENTS_FILE = path.join(__dirname, '../data/students.json');

module.exports = function (app, requireAuth, requireStudentAuth) {

    // HELPER: Read Assignments
    async function getAssignments() {
        try {
            const data = await fs.readFile(ASSIGNMENTS_FILE, 'utf8');
            return JSON.parse(data).assignments || [];
        } catch (e) {
            return [];
        }
    }

    // HELPER: Write Assignments
    async function saveAssignments(assignments) {
        await fs.writeFile(ASSIGNMENTS_FILE, JSON.stringify({ assignments }, null, 2));
    }

    // HELPER: Get Students to verify ownership
    async function getStudents() {
        try {
            const data = await fs.readFile(STUDENTS_FILE, 'utf8');
            return JSON.parse(data).students || [];
        } catch (e) {
            return [];
        }
    }

    // === TEACHER ROUTES (Manage Assignments) ===

    // GET /api/assignments/teacher - List all assignments created by me
    app.get('/api/assignments/teacher', requireAuth, async (req, res) => {
        try {
            const assignments = await getAssignments();
            const myAssignments = assignments.filter(a => a.teacherId === req.teacherId);
            res.json({ assignments: myAssignments });
        } catch (err) {
            res.status(500).json({ error: 'Failed to load assignments' });
        }
    });

    // POST /api/assignments - Assign Game to Students
    app.post('/api/assignments', requireAuth, async (req, res) => {
        try {
            const { studentIds, gameId, settings } = req.body;
            // studentIds is array of "s_..."

            if (!studentIds || !Array.isArray(studentIds) || !gameId) {
                return res.status(400).json({ error: 'Invalid payload' });
            }

            // CRITICAL: Verify these students belong to this teacher!
            const allStudents = await getStudents();
            const myStudentIds = new Set(
                allStudents.filter(s => s.teacherId === req.teacherId).map(s => s.id)
            );

            // Filter out any IDs that don't belong to this teacher
            const validStudentIds = studentIds.filter(id => myStudentIds.has(id));

            if (validStudentIds.length === 0) {
                return res.status(400).json({ error: 'No valid students found for this teacher.' });
            }
            if (validStudentIds.length < studentIds.length) {
                // Some were filtered out. Warn or just continue with valid?
                // For security, just proceed with valid, or fail?
                // Let's proceed with valid but maybe log it.
                console.warn(`Teacher ${req.teacherId} tried to assign to invalid students.`);
            }

            const assignments = await getAssignments();
            const newAssignments = [];

            validStudentIds.forEach(sId => {
                const newAssign = {
                    id: 'as_' + crypto.randomUUID(),
                    teacherId: req.teacherId,
                    studentId: sId,
                    gameId: gameId,
                    settings: settings || {},
                    status: 'pending',
                    score: 0,
                    createdAt: new Date().toISOString()
                };
                assignments.push(newAssign);
                newAssignments.push(newAssign);
            });

            await saveAssignments(assignments);
            res.json({ success: true, count: newAssignments.length, assignments: newAssignments });

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to assign' });
        }
    });

    // DELETE /api/assignments/:id - Unassign
    app.delete('/api/assignments/:id', requireAuth, async (req, res) => {
        try {
            const id = req.params.id;
            console.log(`[DELETE] Attempting to delete assignment ${id} for teacher ${req.teacherId}`);

            let assignments = await getAssignments();
            const initialLen = assignments.length;

            // Filter out (ensure ownership)
            // ISOLATION: Teacher can only delete assignments THEY created.
            assignments = assignments.filter(a => !(a.id === id && a.teacherId === req.teacherId));

            if (assignments.length === initialLen) {
                return res.status(404).json({ error: 'Assignment not found or unauthorized' });
            }

            await saveAssignments(assignments);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete' });
        }
    });

    // === STUDENT ROUTES (My Assignments) ===

    // POST /api/assignments/:id/start - Student starts the game
    app.post('/api/assignments/:id/start', requireStudentAuth, async (req, res) => {
        try {
            console.log("STARTING ASSIGNMENT:", req.params.id);
            const assignmentId = req.params.id;
            const assignments = await getAssignments();
            const assignment = assignments.find(a => a.id === assignmentId);

            if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
            // ISOLATION: Student can only start THEIR assignment
            if (assignment.studentId !== req.studentId) return res.status(403).json({ error: 'Unauthorized' });

            // 1. Load Data logic (inline for now, or could move to helper)
            // ... (keep existing logic from previous file read, assumed safe if not modifying) ...
            // Wait, I am overwriting the file. I MUST include the logic!
            // I will copy the logic from the previous file content (Step 16).

            // ... [Recovering START logic] ...
            const lang = assignment.settings?.lang || 'en';
            // We need to require fs/path at top (done).
            const dataPath = path.join(__dirname, `../data/${lang}.json`);
            let allWords = [];
            let files = {};
            let gameConfig = {};

            try {
                const raw = await fs.readFile(dataPath, 'utf8');
                const json = JSON.parse(raw);
                allWords = json.words || [];
                files = json.files || {};
                gameConfig = json.gameConfig || {};
            } catch (e) {
                console.error("Error loading word data", e);
                return res.status(500).json({ error: 'Failed to load content data: ' + e.message });
            }

            // 2. Filter Words
            let pool = allWords;

            const fileId = assignment.settings?.fileId;
            if (fileId && files[fileId]) {
                const fileWordIds = new Set(files[fileId].wordIds || []);
                pool = pool.filter(w => fileWordIds.has(w.id));
            }

            // Game Config Filter
            const specificConfig = gameConfig[assignment.gameId];
            if (specificConfig && specificConfig.questions && Array.isArray(specificConfig.questions)) {
                const allowedQuestions = new Set(specificConfig.questions);
                pool = pool.filter(w => allowedQuestions.has(w.id));
            }

            // 3. Shuffle & Limit
            pool.sort(() => Math.random() - 0.5);
            const limit = assignment.settings?.limit || 10;
            const selectedIds = pool.slice(0, limit).map(w => w.id);

            // 4. Create Session
            const SESSIONS_DIR = path.join(__dirname, '../data/sessions');
            // Ensure dir exists
            await fs.mkdir(SESSIONS_DIR, { recursive: true }).catch(() => { });

            const newSession = {
                id: 'sess_' + crypto.randomUUID(),
                teacherId: assignment.teacherId,
                studentId: req.studentId,
                gameId: assignment.gameId,
                lang: lang,
                wordIds: selectedIds,
                assignmentId: assignmentId,
                status: 'active',
                analytics: {
                    attempts: 0,
                    failuresBeforePass: 0,
                    timeSpent: 0,
                    questions: {}
                },
                createdAt: new Date().toISOString(),
                gameActions: assignment.settings?.gameActions
            };

            const sessionPath = path.join(SESSIONS_DIR, `${newSession.id}.json`);
            await fs.writeFile(sessionPath, JSON.stringify(newSession, null, 2));

            res.json({ success: true, sessionId: newSession.id });

        } catch (err) {
            console.error("CRITICAL START FAILURE:", err);
            res.status(500).json({ error: 'Failed to start assignment: ' + err.message });
        }
    });

    // GET /api/assignments/my-list
    app.get('/api/assignments/my-list', requireStudentAuth, async (req, res) => {
        try {
            const assignments = await getAssignments();
            // ISOLATION: Verified by filter
            const myAssignments = assignments.filter(a => a.studentId === req.studentId && a.status !== 'completed');
            res.json({ assignments: myAssignments });
        } catch (err) {
            res.status(500).json({ error: 'Failed' });
        }
    });

};
