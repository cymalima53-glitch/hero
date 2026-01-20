const fs = require('fs').promises;
const path = require('path');

const TEACHERS_FILE = path.join(__dirname, '../data/teachers.json');

async function getTeachers() {
    try {
        const data = await fs.readFile(TEACHERS_FILE, 'utf8');
        return JSON.parse(data).teachers || [];
    } catch (e) {
        return [];
    }
}

async function getTeacherById(teacherId) {
    const teachers = await getTeachers();
    return teachers.find(t => t.id === teacherId);
}

function getSubscriptionStatus(teacher) {
    if (!teacher) {
        return { hasAccess: false, reason: 'teacher_not_found' };
    }

    // Internal free teachers always have access
    if (teacher.role === 'internal_free') {
        return { hasAccess: true, reason: 'internal_free', aiCredits: 999999 };
    }

    // Check if email is verified
    if (!teacher.emailVerified) {
        return { hasAccess: false, reason: 'email_not_verified' };
    }

    // Check if paid subscription is active
    if (teacher.subscriptionActive === true) {
        return {
            hasAccess: true,
            reason: 'paid_subscription',
            aiCredits: teacher.aiCredits || 0
        };
    }

    // Check if trial is active
    if (teacher.trialStart && teacher.trialEnd) {
        const now = new Date();
        const trialEnd = new Date(teacher.trialEnd);

        if (now < trialEnd) {
            const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
            return {
                hasAccess: true,
                reason: 'trial',
                trialDaysRemaining: daysRemaining,
                aiCredits: teacher.aiCredits || 0
            };
        }
    }

    // No access
    return { hasAccess: false, reason: 'trial_expired_no_subscription' };
}

// Middleware: Require active subscription (trial OR paid OR internal free)
async function requireSubscription(req, res, next) {
    try {
        const teacherId = req.teacherId;
        if (!teacherId) {
            return res.status(401).json({
                error: 'Unauthorized',
                redirectTo: '/dashboard/login.html'
            });
        }

        const teacher = await getTeacherById(teacherId);
        const status = getSubscriptionStatus(teacher);

        if (!status.hasAccess) {
            return res.status(403).json({
                error: 'Subscription required',
                reason: status.reason,
                redirectTo: '/dashboard/pricing.html'
            });
        }

        // Attach subscription info to request
        req.subscriptionStatus = status;
        next();
    } catch (error) {
        console.error('Subscription middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Middleware: Require AI credits
async function requireAICredits(req, res, next) {
    try {
        const teacherId = req.teacherId;
        if (!teacherId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const teacher = await getTeacherById(teacherId);
        const status = getSubscriptionStatus(teacher);

        // Internal free teachers have unlimited credits
        if (teacher.role === 'internal_free') {
            req.subscriptionStatus = status;
            return next();
        }

        // Check if teacher has access
        if (!status.hasAccess) {
            return res.status(403).json({
                error: 'Subscription required',
                redirectTo: '/dashboard/pricing.html'
            });
        }

        // Check if teacher has credits
        const credits = teacher.aiCredits || 0;
        if (credits <= 0) {
            return res.status(403).json({
                error: 'No AI credits remaining',
                message: 'You have used all your AI credits for this month. Credits reset on your next billing date.'
            });
        }

        req.subscriptionStatus = status;
        req.teacher = teacher;
        next();
    } catch (error) {
        console.error('AI credits middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    requireSubscription,
    requireAICredits,
    getSubscriptionStatus,
    getTeacherById
};
