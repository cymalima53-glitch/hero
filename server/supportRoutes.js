const emailService = require('./email');

module.exports = function (app, requireAuth) {
    // Send support email
    app.post('/api/support/send', requireAuth, async (req, res) => {
        try {
            const { from, subject, message } = req.body;

            if (!from || !subject || !message) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Compose email to support
            const emailSubject = `Support Request: ${subject}`;
            const emailBody = `
Support Request from Teacher Dashboard

From: ${from}
Subject: ${subject}

Message:
${message}

---
This message was sent from the Hero Teacher Dashboard support form.
            `.trim();

            // Send email to support address
            await emailService.sendSupportEmail('cymalima53@gmail.com', emailSubject, emailBody);

            res.json({ success: true, message: 'Support request sent successfully' });
        } catch (error) {
            console.error('Support email error:', error);
            res.status(500).json({ error: 'Failed to send support request' });
        }
    });
};
