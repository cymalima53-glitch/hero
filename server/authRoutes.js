const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const TEACHERS_FILE = path.join(__dirname, '../data/teachers.json');
const SESSIONS_FILE = path.join(__dirname, '../data/auth_sessions.json');

// Simple in-memory session cache that we sync to file
let activeSessions = {};

// Load sessions on startup
async function loadSessions() {
    try {
        const data = await fs.readFile(SESSIONS_FILE, 'utf8');
        activeSessions = JSON.parse(data);
    } catch (e) {
        activeSessions = {};
    }
}
loadSessions();

async function saveSessions() {
    try {
        await fs.writeFile(SESSIONS_FILE, JSON.stringify(activeSessions, null, 2));
    } catch (e) {
        console.error('Failed to save sessions', e);
    }
}

async function getTeachers() {
    try {
        const data = await fs.readFile(TEACHERS_FILE, 'utf8');
        return JSON.parse(data).teachers || [];
    } catch (e) {
        return [];
    }
}

async function saveTeachers(teachers) {
    try {
        await fs.writeFile(TEACHERS_FILE, JSON.stringify({ teachers }, null, 2));
    } catch (e) {
        console.error('Failed to save teachers', e);
    }
}

// Middleware to check cookie
async function requireAuth(req, res, next) {
    let token = req.cookies?.teacher_token;

    // Fallback for non-cookie-parser environments (redundant if app.use(cookieParser) is on, but safe)
    if (!token && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
            const [k, v] = c.trim().split('=');
            acc[k] = v;
            return acc;
        }, {});
        token = cookies.teacher_token;
    }

    if (!token || !activeSessions[token]) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = activeSessions[token];
    if (typeof session === 'string') {
        req.teacherId = session;
    } else if (session.type === 'teacher') {
        req.teacherId = session.id;
    } else {
        return res.status(401).json({ error: 'Not a teacher' });
    }

    next();
}

// Middleware: Student Auth
async function requireStudentAuth(req, res, next) {
    let token = req.cookies?.student_token;
    if (!token && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
            const [k, v] = c.trim().split('=');
            acc[k] = v;
            return acc;
        }, {});
        token = cookies.student_token;
    }

    if (!token || !activeSessions[token] || activeSessions[token].type !== 'student') {
        return res.status(401).json({ error: 'Invalid session/Unauthorized' });
    }

    req.studentId = activeSessions[token].id;
    next();
}

module.exports = function (app) {

    // REGISTER
    app.post('/api/auth/register', async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const teachers = await getTeachers();
        if (teachers.find(t => t.email === email)) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new teacher
        const newTeacher = {
            id: 't_' + crypto.randomUUID(),
            email: email,
            passwordHash: hashedPassword,
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
            contentGeneratorUses: 0,
            students: []
        };

        // Save
        teachers.push(newTeacher);
        await saveTeachers(teachers);

        // Auto-login
        const token = crypto.randomUUID();
        activeSessions[token] = { type: 'teacher', id: newTeacher.id };
        await saveSessions();

        res.cookie('teacher_token', token, { httpOnly: true, maxAge: 86400000 }); // 24h
        res.json({ success: true, teacher: { id: newTeacher.id, email: newTeacher.email } });
    });

    // LOGIN
    app.post('/api/auth/login', async (req, res) => {
        const { email, password } = req.body;
        const teachers = await getTeachers();

        let teacher = teachers.find(t => t.email === email);
        if (!teacher) return res.status(401).json({ error: 'Invalid credentials' });

        let isValid = false;
        let migrated = false;

        // CHECK 1: Legacy PLAIN prefix
        if (teacher.passwordHash && teacher.passwordHash.startsWith('PLAIN:')) {
            const plain = teacher.passwordHash.replace('PLAIN:', '');
            if (plain === password) {
                isValid = true;
                // MIGRATION: Hash it now!
                console.log(`[AUTH] Migrating password for ${email}`);
                teacher.passwordHash = await bcrypt.hash(password, 10);
                migrated = true;
            }
        }
        // CHECK 2: Bcrypt
        else if (teacher.passwordHash) {
            isValid = await bcrypt.compare(password, teacher.passwordHash);
        }
        // CHECK 3: Dev/Legacy Fallback (e.g. "admin"/"password")
        else if (email === 'admin' && password === 'password') {
            isValid = true;
            console.log(`[AUTH] Migrating ADMIN password`);
            teacher.passwordHash = await bcrypt.hash(password, 10);
            migrated = true;
        }

        if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

        if (migrated) {
            await saveTeachers(teachers);
        }

        const token = crypto.randomUUID();
        activeSessions[token] = { type: 'teacher', id: teacher.id };
        await saveSessions();

        res.cookie('teacher_token', token, { httpOnly: true, maxAge: 86400000 });
        res.json({ success: true, teacher: { id: teacher.id, email: teacher.email } });
    });

    // ME
    app.get('/api/auth/me', requireAuth, async (req, res) => {
        const teachers = await getTeachers();
        const teacher = teachers.find(t => t.id === req.teacherId);
        if (!teacher) return res.status(401).json({ error: 'User not found' });
        res.json({ teacher: { id: teacher.id, email: teacher.email, name: teacher.name } });
    });

    // LOGOUT
    app.post('/api/auth/logout', (req, res) => {
        const token = req.cookies?.teacher_token;
        if (token) {
            delete activeSessions[token];
            saveSessions();
        }
        res.clearCookie('teacher_token');
        res.json({ success: true });
    });

    // PASSWORD RESET START
    const emailService = require('./email');

    // 1. Request Reset
    app.post('/api/auth/forgot-password', async (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });

        const teachers = await getTeachers();
        const teacher = teachers.find(t => t.email === email);

        // Security: Always return success even if not found to prevent enumeration
        if (!teacher) {
            // Fake delay to mimic processing
            await new Promise(r => setTimeout(r, 500));
            return res.json({ success: true, message: "If that email matches an account, we sent a reset link." });
        }

        // Generate Token
        const resetToken = crypto.randomUUID();
        const resetExpires = Date.now() + 15 * 60 * 1000; // 15 mins

        teacher.resetToken = resetToken;
        teacher.resetExpires = resetExpires;
        await saveTeachers(teachers);

        // Send Email
        // Dynamic Host Construction (Works for Localhost & Render)
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const resetLink = `${protocol}://${host}/dashboard/reset.html?token=${resetToken}`;

        console.log(`[AUTH] Generated Reset Link: ${resetLink}`); // DEBUG LOG

        await emailService.sendResetLink(email, resetLink);

        res.json({ success: true, message: "If that email matches an account, we sent a reset link." });
    });

    // 2. Perform Reset
    app.post('/api/auth/reset-password', async (req, res) => {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ error: 'Missing fields' });

        const teachers = await getTeachers();
        // Find teacher with valid token
        const teacher = teachers.find(t =>
            t.resetToken === token &&
            t.resetExpires > Date.now()
        );

        if (!teacher) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        // Update Password
        teacher.passwordHash = await bcrypt.hash(password, 10);

        // Clear Token
        delete teacher.resetToken;
        delete teacher.resetExpires;

        await saveTeachers(teachers);

        res.json({ success: true, message: 'Password updated' });
    });
    // PASSWORD RESET END

    // STUDENT LOGIN
    app.post('/api/auth/student/login', async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

        // Read students.json
        let students = [];
        try {
            const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
            const data = await fs.readFile(STUDENTS_FILE, 'utf8');
            students = JSON.parse(data).students || [];
        } catch (e) { }

        const student = students.find(s => s.username === username);
        if (!student) return res.status(401).json({ error: 'Invalid credentials' });

        let isValid = false;
        // Check hash
        if (student.passwordHash) {
            if (student.passwordHash.startsWith('PLAIN:')) {
                // MIGRATE STUDENT
                if (student.passwordHash === 'PLAIN:' + password) {
                    isValid = true;
                    // Hash & Save
                    student.passwordHash = await bcrypt.hash(password, 10);
                    try {
                        const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
                        await fs.writeFile(STUDENTS_FILE, JSON.stringify({ students }, null, 2));
                    } catch (e) { }
                }
            } else {
                isValid = await bcrypt.compare(password, student.passwordHash);
            }
        }

        if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

        // Create Session
        const token = crypto.randomUUID();
        activeSessions[token] = { type: 'student', id: student.id };
        await saveSessions();

        res.cookie('student_token', token, { httpOnly: true, maxAge: 86400000 });
        res.json({ success: true, student: { id: student.id, name: student.name } });
    });

    // STUDENT PASSWORD RESET START
    // 1. Request Reset (Student)
    app.post('/api/auth/student/forgot-password', async (req, res) => {
        const { username, email } = req.body;
        if (!username || !email) return res.status(400).json({ error: 'Username and Parent Email required' });

        // Read students.json
        let students = [];
        try {
            const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
            const data = await fs.readFile(STUDENTS_FILE, 'utf8');
            students = JSON.parse(data).students || [];
        } catch (e) {
            return res.status(500).json({ error: 'System error' });
        }

        const student = students.find(s => s.username === username);

        // Security: Check matching
        if (!student) {
            // Fake delay
            await new Promise(r => setTimeout(r, 500));
            return res.json({ success: true, message: "If details match, a reset link was sent." });
        }

        const parentEmail = (student.parentEmail || '').trim();
        const inputEmail = email.trim();

        // Check Match (Case insensitive for email?)
        // Let's do exact match first
        if (parentEmail.toLowerCase() !== inputEmail.toLowerCase()) {
            // Fake delay
            await new Promise(r => setTimeout(r, 500));
            return res.json({ success: true, message: "If details match, a reset link was sent." });
        }

        // Generate Token
        const resetToken = crypto.randomUUID();
        const resetExpires = Date.now() + 15 * 60 * 1000; // 15 mins

        student.resetToken = resetToken;
        student.resetExpires = resetExpires;

        // Save
        try {
            const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
            await fs.writeFile(STUDENTS_FILE, JSON.stringify({ students }, null, 2));
        } catch (e) {
            return res.status(500).json({ error: 'System saving error' });
        }

        // Send Email
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        // Point to student/reset.html
        const resetLink = `${protocol}://${host}/student/reset.html?token=${resetToken}`;

        console.log(`[AUTH-STUDENT] Generated Reset Link for ${username}: ${resetLink}`);

        await emailService.sendResetLink(inputEmail, resetLink);

        res.json({ success: true, message: "If details match, a reset link was sent." });
    });

    // 2. Perform Reset (Student)
    app.post('/api/auth/student/reset-password', async (req, res) => {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ error: 'Missing fields' });

        // Read students.json
        let students = [];
        try {
            const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
            const data = await fs.readFile(STUDENTS_FILE, 'utf8');
            students = JSON.parse(data).students || [];
        } catch (e) { return res.status(500).json({ error: 'System error' }); }

        // Find student
        const student = students.find(s =>
            s.resetToken === token &&
            s.resetExpires > Date.now()
        );

        if (!student) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        // Update Password
        student.passwordHash = await bcrypt.hash(password, 10);

        // Clear Token
        delete student.resetToken;
        delete student.resetExpires;

        // Save
        try {
            const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
            await fs.writeFile(STUDENTS_FILE, JSON.stringify({ students }, null, 2));
        } catch (e) { return res.status(500).json({ error: 'System error' }); }

        res.json({ success: true, message: 'Password updated' });
    });
    // STUDENT PASSWORD RESET END
    // Return middleware for use in other files
    return { requireAuth, requireStudentAuth };
};
