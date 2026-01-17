const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const STUDENTS_FILE = path.join(__dirname, '../data/students.json');

module.exports = function (app, requireAuth) {
    const { requireSubscription } = require('./subscriptionMiddleware');

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

    // GET STUDENTS (For logged-in Teacher)
    app.get('/api/students', requireAuth, requireSubscription, async (req, res) => {
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
    app.post('/api/students', requireAuth, requireSubscription, async (req, res) => {
        try {
            const { name, username, password, parentEmail } = req.body;

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
                createdAt: new Date().toISOString()
            };

            students.push(newStudent);
            await saveStudents(students);

            // Return without hash
            const { passwordHash, ...safeStudent } = newStudent;
            res.json({ success: true, student: safeStudent });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to create student' });
        }
    });

    // DELETE STUDENT
    app.delete('/api/students/:id', requireAuth, requireSubscription, async (req, res) => {
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

    // UPDATE STUDENT (Reset Password)
    app.put('/api/students/:id', requireAuth, requireSubscription, async (req, res) => {
        try {
            const studentId = req.params.id;
            const { password, name, username } = req.body; // Allow updating other fields too if needed
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

            students[studentIndex] = student;
            await saveStudents(students);

            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to update student' });
        }
    });
};
