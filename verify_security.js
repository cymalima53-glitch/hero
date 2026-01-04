const http = require('http');

function request(path, method, body, cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookie || ''
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    data: data ? JSON.parse(data) : {},
                    headers: res.headers
                });
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function testConfig() {
    console.log("=== STARTING SECURITY VERIFICATION ===\n");

    // 1. Unauthorized Access
    console.log("TEST 1: Unauthorized Access to /api/students");
    const res1 = await request('/api/students', 'GET');
    if (res1.status === 401) console.log("✅ PASS: 401 Unauthorized received");
    else {
        console.error("❌ FAIL: Expected 401, got", res1.status);
        process.exit(1);
    }

    // 2. Register Teacher A
    console.log("\nTEST 2: Register Teacher A");
    const emailA = `teachA_${Date.now()}@test.com`;
    const res2 = await request('/api/auth/register', 'POST', { email: emailA, password: 'password123' });
    if (res2.status === 200 && res2.headers['set-cookie']) {
        console.log("✅ PASS: Teacher A registered");
    } else {
        console.error("❌ FAIL: Registration failed", res2.data);
        process.exit(1);
    }
    const cookieA = res2.headers['set-cookie'][0].split(';')[0];

    // 3. Create Student A1
    console.log("\nTEST 3: Teacher A creates Student A1");
    const usernameA1 = `studA1_${Date.now()}`;
    const res3 = await request('/api/students', 'POST', { name: 'Student A1', username: usernameA1, password: 'pw' }, cookieA);
    const studentA1Id = res3.data.student.id;
    if (res3.status === 200) console.log("✅ PASS: Student A1 created:", studentA1Id);
    else {
        console.error("❌ FAIL: Student creation failed", res3.data);
        process.exit(1);
    }

    // 4. Register Teacher B
    console.log("\nTEST 4: Register Teacher B");
    const emailB = `teachB_${Date.now()}@test.com`;
    const res4 = await request('/api/auth/register', 'POST', { email: emailB, password: 'password123' });
    const cookieB = res4.headers['set-cookie'][0].split(';')[0];
    if (res4.status === 200) console.log("✅ PASS: Teacher B registered");

    // 5. ISOLATION: Teacher B lists students (Expect Empty or NOT A1)
    console.log("\nTEST 5: Teacher B lists students (Expect Isolation)");
    const res5 = await request('/api/students', 'GET', null, cookieB);
    const studentsB = res5.data.students;
    if (studentsB.length === 0) {
        console.log("✅ PASS: Teacher B sees 0 students (Isolation Success)");
    } else {
        console.error("❌ FAIL: Teacher B saw students!", studentsB);
        process.exit(1);
    }

    // 6. ISOLATION: Teacher B tries to delete Student A1 (Expect 404/403)
    console.log("\nTEST 6: Teacher B tries to delete Student A1");
    const res6 = await request(`/api/students/${studentA1Id}`, 'DELETE', null, cookieB);
    if (res6.status === 404 || res6.status === 403) {
        console.log("✅ PASS: Teacher B blocked from deleting A1 (Status:", res6.status, ")");
    } else {
        console.error("❌ FAIL: Teacher B DELETED A1!", res6.status);
        process.exit(1);
    }

    // 7. ISOLATION: Teacher B tries to Assign Game to Student A1
    console.log("\nTEST 7: Teacher B tries to assign game to Student A1");
    const res7 = await request('/api/assignments', 'POST', { studentIds: [studentA1Id], gameId: 'game1' }, cookieB);
    if (res7.status === 400 || res7.status === 403) {
        console.log("✅ PASS: Assignment blocked (Status:", res7.status, ")", res7.data.error);
    } else {
        console.error("❌ FAIL: Teacher B assigned work to A1!", res7.status);
        process.exit(1);
    }

    console.log("\n=== VERIFICATION COMPLETE ===");
}

testConfig();
