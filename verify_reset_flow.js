const http = require('http');

function request(path, method, body, cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} }));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function testReset() {
    console.log("=== TESTING PASSWORD RESET FLOW ===\n");

    // 1. Register Teacher
    const email = `reset_test_${Date.now()}@test.com`;
    console.log(`1. Registering ${email}...`);
    await request('/api/auth/register', 'POST', { email, password: 'oldpassword' });

    // 2. Request Reset Link
    console.log("2. Requesting Forgot Password...");
    // Mock the email logic by reading the server logs? 
    // Wait, I can't read console logs easily from here unless I spy.
    // BUT! I added a sneaky "mock" return in email.js on failure, or I can just check if success is returned.
    // ACTUALLY: backend returns success message.
    // Challenge: I need the TOKEN to proceed.
    // In a real automated test we would inspect the DB (teachers.json).
    // Let's do that! Read teachers.json directly.

    await request('/api/auth/forgot-password', 'POST', { email });

    const fs = require('fs');
    const path = require('path');
    // Wait a moment for file write
    await new Promise(r => setTimeout(r, 1000));

    const teachersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/teachers.json'), 'utf8'));
    const teacher = teachersData.teachers.find(t => t.email === email);

    if (!teacher.resetToken) {
        console.error("❌ FAIL: No reset token found in DB!");
        return;
    }
    console.log("✅ PASS: Token found:", teacher.resetToken);

    // 3. Reset Password
    console.log("3. Resetting Password...");
    const resReset = await request('/api/auth/reset-password', 'POST', {
        token: teacher.resetToken,
        password: 'NEWpassword123'
    });

    if (resReset.data.success) console.log("✅ PASS: Password update endpoint success");
    else console.error("❌ FAIL: Reset endpoint", resReset.data);

    // 4. Try Login with NEW password
    console.log("4. Logging in with NEW password...");
    const resLogin = await request('/api/auth/login', 'POST', { email, password: 'NEWpassword123' });
    if (resLogin.data.success) console.log("✅ PASS: Login with new password successful");
    else console.error("❌ FAIL: Login failed", resLogin.data);

    // 5. Try Login with OLD password
    console.log("5. Logging in with OLD password...");
    const resOld = await request('/api/auth/login', 'POST', { email, password: 'oldpassword' });
    if (resOld.status === 401) console.log("✅ PASS: Old password rejected");
    else console.error("❌ FAIL: Old password still worked!", resOld.status);

    console.log("\n=== TEST COMPLETE ===");
}

testReset();
