const fs = require('fs');
const path = require('path');

module.exports = function (app) {
    const TEACHERS_FILE = path.join(__dirname, '../data/teachers.json');
    const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
    const DATA_DIR = path.join(__dirname, '../data');

    // Admin authentication middleware
    function requireAdminAuth(req, res, next) {
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminPassword) {
            return res.status(500).json({ error: 'Admin password not configured' });
        }

        const providedPassword = req.headers['x-admin-password'] || req.query.password;

        if (providedPassword === adminPassword) {
            next();
        } else {
            res.status(401).json({ error: 'Unauthorized' });
        }
    }

    // GET /admin/api/users - List all teachers with stats
    app.get('/admin/api/users', requireAdminAuth, (req, res) => {
        try {
            if (!fs.existsSync(TEACHERS_FILE)) {
                return res.json({ users: [], total: 0 });
            }

            const data = JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf8'));
            const teachers = data.teachers || [];

            // Format user data for admin view
            const users = teachers.map(teacher => ({
                id: teacher.id,
                name: teacher.name,
                email: teacher.email,
                createdAt: teacher.createdAt || 'N/A',
                lastActiveAt: teacher.lastActiveAt || 'N/A',
                contentGeneratorUses: teacher.contentGeneratorUses || 0
            }));

            res.json({
                users,
                total: users.length
            });
        } catch (error) {
            console.error('Error fetching users:', error);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    });

    // DELETE /admin/api/users/:id - Delete a teacher and all their data
    app.delete('/admin/api/users/:id', requireAdminAuth, (req, res) => {
        try {
            const teacherId = req.params.id;

            // Delete teacher from teachers.json
            if (fs.existsSync(TEACHERS_FILE)) {
                const data = JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf8'));
                const teachers = data.teachers || [];
                const filteredTeachers = teachers.filter(t => t.id !== teacherId);

                fs.writeFileSync(TEACHERS_FILE, JSON.stringify({ teachers: filteredTeachers }, null, 2));
            }

            // Delete all students belonging to this teacher
            if (fs.existsSync(STUDENTS_FILE)) {
                const data = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
                const students = data.students || [];
                const filteredStudents = students.filter(s => s.teacherId !== teacherId);

                fs.writeFileSync(STUDENTS_FILE, JSON.stringify({ students: filteredStudents }, null, 2));
            }

            // Delete teacher's content data (en.json, fr.json, es.json)
            ['en', 'fr', 'es'].forEach(lang => {
                const contentFile = path.join(DATA_DIR, `${lang}.json`);
                if (fs.existsSync(contentFile)) {
                    try {
                        const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));

                        // Remove teacher's files/folders
                        if (content.files) {
                            Object.keys(content.files).forEach(fileId => {
                                if (content.files[fileId].ownerId === teacherId) {
                                    delete content.files[fileId];
                                }
                            });

                            fs.writeFileSync(contentFile, JSON.stringify(content, null, 2));
                        }
                    } catch (err) {
                        console.error(`Error cleaning ${lang}.json:`, err);
                    }
                }
            });

            res.json({ success: true, message: 'User deleted successfully' });
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    });

    // POST /admin/api/auth - Verify admin password
    app.post('/admin/api/auth', (req, res) => {
        const { password } = req.body;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminPassword) {
            return res.status(500).json({ error: 'Admin password not configured' });
        }

        if (password === adminPassword) {
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Invalid password' });
        }
    });
};
