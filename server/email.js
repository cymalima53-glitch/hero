require('dotenv').config();


// EmailJS Configuration from .env
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || 'template_assignment';

async function sendEmail(templateParams) {
    if (!PUBLIC_KEY || !SERVICE_ID) {
        console.log(`[EMAIL-MOCK] (Missing Keys) Params:`, templateParams);
        return { success: true, mock: true };
    }

    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Antigravity/1.0'
    };

    // AUGMENT PARAMS: Add fallbacks for common email field names
    // This fixes "Recipients address is empty" if user configured template differently
    const email = templateParams.to_email;
    const augmentedParams = {
        ...templateParams,
        'email': email,
        'to': email,
        'recipient': email,
        'reply_to': email,
        'user_email': email
    };

    const data = {
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        accessToken: PRIVATE_KEY,
        template_params: augmentedParams
    };

    try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (response.ok) {
            console.log(`[EMAILJS] Success! Sent to ${email}`);
            return { success: true };
        } else {
            const text = await response.text();
            console.error(`[EMAILJS] Failed: ${response.status} ${text}`);
            return { success: false, error: text };
        }
    } catch (error) {
        console.error('[EMAILJS] Error:', error);
        return { success: false, error: error.message };
    }
}

async function sendMagicLink(toEmail, studentName, magicLink, gameName) {
    console.log(`[EMAIL] Sending Magic Link to ${toEmail}`);
    return sendEmail({
        to_email: toEmail,
        student_name: studentName,
        magic_link: magicLink,
        game_name: gameName,
        message: `New Assignment: ${gameName}. Play here: ${magicLink}`
    });
}

async function sendResetLink(toEmail, resetLink) {
    console.log(`[EMAIL] Sending Reset Link to ${toEmail}`);
    return sendEmail({
        to_email: toEmail,
        message: `Reset your password here: ${resetLink} (Valid for 15 minutes)`,
        magic_link: resetLink, // Reuse param if template uses it
        reset_link: resetLink  // Explicit param
    });
}

async function sendVerificationEmail(toEmail, verificationLink) {
    console.log(`[EMAIL] Sending Verification Email to ${toEmail}`);
    return sendEmail({
        to_email: toEmail,
        message: `Verify your email to start your 3-day free trial: ${verificationLink}`,
        magic_link: verificationLink,
        verification_link: verificationLink
    });
}

async function sendSupportEmail(toEmail, subject, body) {
    console.log(`[SUPPORT] Logging support ticket from ${toEmail}`);

    const fs = require('fs').promises;
    const path = require('path');

    const supportTicket = {
        from: toEmail,
        subject: subject,
        message: body,
        timestamp: new Date().toISOString(),
        status: 'new'
    };

    // Log to file
    const logFile = path.join(__dirname, '../data/support_tickets.json');

    let tickets = [];
    try {
        const data = await fs.readFile(logFile, 'utf8');
        tickets = JSON.parse(data);
    } catch (e) {
        // File doesn't exist yet, start with empty array
    }

    tickets.push(supportTicket);
    await fs.writeFile(logFile, JSON.stringify(tickets, null, 2));

    console.log('[SUPPORT TICKET SAVED]', supportTicket);

    // Also send to your email (optional - you can remove this if you just want file logging)
    console.log(`\n========== NEW SUPPORT TICKET ==========`);
    console.log(`From: ${toEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Message:\n${body}`);
    console.log(`========================================\n`);

    return { success: true };
}

module.exports = { sendMagicLink, sendResetLink, sendVerificationEmail, sendSupportEmail };
