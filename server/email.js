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

module.exports = { sendMagicLink, sendResetLink };
