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

    // === GENERATOR RATE LIMIT MANAGEMENT ===

    // Helper: Get teachers
    function getTeachers() {
        if (!fs.existsSync(TEACHERS_FILE)) return [];
        const data = JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf8'));
        return data.teachers || [];
    }

    // Helper: Save teachers
    function saveTeachers(teachers) {
        fs.writeFileSync(TEACHERS_FILE, JSON.stringify({ teachers }, null, 2));
    }

    // GET /admin/api/generator-teachers - List all teachers with generator status
    app.get('/admin/api/generator-teachers', requireAdminAuth, (req, res) => {
        try {
            const teachers = getTeachers();
            const teacherList = teachers.map(t => ({
                email: t.email,
                id: t.id,
                generatorUsesToday: t.generatorUsesToday || 0,
                generatorTotalUses: t.generatorTotalUses || 0,
                unlimitedGenerator: t.unlimitedGenerator || false,
                generatorLastResetDate: t.generatorLastResetDate || 'Never',
                generatorLastUsed: t.generatorLastUsed || 'Never',
                generatorLimitHits: t.generatorLimitHits || 0,
                generatorLastLimitHitDate: t.generatorLastLimitHitDate || 'Never'
            }));
            res.json({ teachers: teacherList });
        } catch (error) {
            console.error('Error fetching generator teachers:', error);
            res.status(500).json({ error: 'Failed to fetch teachers' });
        }
    });

    // POST /admin/api/unlock-generator/:email - Grant unlimited access
    app.post('/admin/api/unlock-generator/:email', requireAdminAuth, (req, res) => {
        try {
            const teachers = getTeachers();
            const teacherIndex = teachers.findIndex(t => t.email === req.params.email);

            if (teacherIndex === -1) {
                return res.status(404).json({ error: 'Teacher not found' });
            }

            teachers[teacherIndex].unlimitedGenerator = true;
            saveTeachers(teachers);

            res.json({ success: true, message: `Unlimited access granted to ${req.params.email}` });
        } catch (error) {
            console.error('Error unlocking generator:', error);
            res.status(500).json({ error: 'Failed to unlock generator' });
        }
    });

    // POST /admin/api/lock-generator/:email - Remove unlimited access
    app.post('/admin/api/lock-generator/:email', requireAdminAuth, (req, res) => {
        try {
            const teachers = getTeachers();
            const teacherIndex = teachers.findIndex(t => t.email === req.params.email);

            if (teacherIndex === -1) {
                return res.status(404).json({ error: 'Teacher not found' });
            }

            teachers[teacherIndex].unlimitedGenerator = false;
            saveTeachers(teachers);

            res.json({ success: true, message: `Limited to 3/day for ${req.params.email}` });
        } catch (error) {
            console.error('Error locking generator:', error);
            res.status(500).json({ error: 'Failed to lock generator' });
        }
    });

    // POST /admin/api/reset-generator/:email - Reset daily counter
    app.post('/admin/api/reset-generator/:email', requireAdminAuth, (req, res) => {
        try {
            const teachers = getTeachers();
            const teacherIndex = teachers.findIndex(t => t.email === req.params.email);

            if (teacherIndex === -1) {
                return res.status(404).json({ error: 'Teacher not found' });
            }

            teachers[teacherIndex].generatorUsesToday = 0;
            saveTeachers(teachers);

            res.json({ success: true, message: `Counter reset for ${req.params.email}` });
        } catch (error) {
            console.error('Error resetting generator:', error);
            res.status(500).json({ error: 'Failed to reset generator' });
        }
    });

    // GET /admin/api/generator-abuse-report - Abuse monitoring report
    app.get('/admin/api/generator-abuse-report', requireAdminAuth, (req, res) => {
        try {
            const teachers = getTeachers();

            // Calculate risk scores
            const teachersWithRisk = teachers.map(t => {
                const limitHits = t.generatorLimitHits || 0;
                const totalUses = t.generatorTotalUses || 0;
                const usesToday = t.generatorUsesToday || 0;

                let riskLevel = 'NORMAL';
                let riskScore = 0;

                // High risk: Hit limit 5+ times
                if (limitHits >= 5) {
                    riskLevel = 'HIGH';
                    riskScore += 50;
                }

                // Medium risk: 100+ total uses
                if (totalUses >= 100) {
                    riskLevel = riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM';
                    riskScore += 30;
                }

                // Currently blocked
                if (usesToday >= 5 && !t.unlimitedGenerator) {
                    riskScore += 20;
                }

                return {
                    email: t.email,
                    riskLevel,
                    riskScore,
                    usesToday,
                    totalUses,
                    limitHits,
                    lastUsed: t.generatorLastUsed || 'Never',
                    lastLimitHit: t.generatorLastLimitHitDate || 'Never',
                    unlimitedGenerator: t.unlimitedGenerator || false
                };
            });

            // Sort by risk score (high to low)
            teachersWithRisk.sort((a, b) => b.riskScore - a.riskScore);

            res.json({ teachers: teachersWithRisk });
        } catch (error) {
            console.error('Error generating abuse report:', error);
            res.status(500).json({ error: 'Failed to generate abuse report' });
        }
    });

    // GET /admin/api/generator-usage/:email - Detailed usage history
    app.get('/admin/api/generator-usage/:email', requireAdminAuth, (req, res) => {
        try {
            const teachers = getTeachers();
            const teacher = teachers.find(t => t.email === req.params.email);

            if (!teacher) {
                return res.status(404).json({ error: 'Teacher not found' });
            }

            res.json({
                email: teacher.email,
                generatorUsesToday: teacher.generatorUsesToday || 0,
                generatorTotalUses: teacher.generatorTotalUses || 0,
                generatorLastUsed: teacher.generatorLastUsed || 'Never',
                generatorLimitHits: teacher.generatorLimitHits || 0,
                generatorLastLimitHitDate: teacher.generatorLastLimitHitDate || 'Never',
                generatorUsageLog: teacher.generatorUsageLog || [],
                unlimitedGenerator: teacher.unlimitedGenerator || false
            });
        } catch (error) {
            console.error('Error fetching usage details:', error);
            res.status(500).json({ error: 'Failed to fetch usage details' });
        }
    });
};
