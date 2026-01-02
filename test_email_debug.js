require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');

const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || 'template_assignment';

async function testSend() {
    console.log("=== EMAIL DEBUG (MULTI-PARAM) ===");

    // Strategy: Send EVERY possible common email variable name.
    // EmailJS ignores extra params, so this is safe and effective.
    const recipient = 'kamal_debug@test.com';

    const data = {
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        accessToken: PRIVATE_KEY,
        template_params: {
            // TARGET: to_email (Standard)
            'to_email': recipient,
            // Fallbacks:
            'email': recipient,
            'to': recipient,
            'recipient': recipient,
            'reply_to': recipient,
            'user_email': recipient,

            student_name: 'Debug User',
            message: 'This is a debug test with multi-params.'
        }
    };

    try {
        console.log("Sending request to EmailJS...");
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Response Body (Saved to file)");

        fs.writeFileSync('debug_email_error.txt', `Status: ${response.status}\nBody: ${text}`);

    } catch (e) {
        console.error("Network Error:", e);
        fs.writeFileSync('debug_email_error.txt', `Network Error: ${e.message}`);
    }
}

testSend();
