const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const API_URL = 'http://localhost:3000/api';
let teacherToken = '';
let groupId = '';
let studentId = '';
let gameId = 'memoryEcho';

async function runTests() {
    console.log("🚀 Starting Groups Feature Verification...");

    try {
        const uniqueEmail = `test_${Date.now()}@teacher.com`;

        // 1. Register New Teacher for Test
        console.log(`\n1. Registering new teacher: ${uniqueEmail}...`);
        const regRes = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: uniqueEmail, password: 'password123' })
        });
        const regData = await regRes.json();

        if (!regRes.ok) throw new Error(regData.error || 'Registration failed');
        teacherToken = regData.token;
        console.log("   ✅ Registered and logged in.");

        // 2. Create a Group
        console.log("\n2. Creating Group 'Test Group A'...");
        const groupRes = await fetch(`${API_URL}/groups`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${teacherToken}`
            },
            body: JSON.stringify({ name: 'Test Group A' })
        });
        const groupData = await groupRes.json();
        if (!groupRes.ok) throw new Error(groupData.error);
        groupId = groupData.group.id;
        console.log(`   ✅ Group Created: ${groupId}`);

        // 3. Create a Student in the Group
        console.log("\n3. Creating Student 'Group Student'...");
        const studentRes = await fetch(`${API_URL}/students`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${teacherToken}`
            },
            body: JSON.stringify({
                name: 'Group Student',
                username: 'grp_' + Date.now(),
                password: 'abc',
                groupId: groupId
            })
        });
        const studentData = await studentRes.json();
        if (!studentRes.ok) throw new Error(studentData.error);
        studentId = studentData.student.id;
        console.log(`   ✅ Student Created: ${studentId} in Group ${groupId}`);

        // 4. Assign Game to Group
        console.log("\n4. Assigning Game to Group...");
        const assignRes = await fetch(`${API_URL}/groups/${groupId}/assign`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${teacherToken}`
            },
            body: JSON.stringify({
                gameId: gameId,
                settings: { limit: 5 }
            })
        });
        const assignData = await assignRes.json();
        if (!assignRes.ok) throw new Error(assignData.error);
        console.log(`   ✅ Game Assigned. Students affected: ${assignData.count}`);

        // 5. Verify Student has Assignment
        console.log("\n5. Verifying Assignment for Student...");
        const listRes = await fetch(`${API_URL}/assignments/teacher`, {
            headers: { 'Authorization': `Bearer ${teacherToken}` }
        });
        const listData = await listRes.json();
        const studentAssigns = listData.assignments.filter(a => a.studentId === studentId && a.gameId === gameId);

        if (studentAssigns.length > 0) {
            console.log(`   ✅ Assignment found for student! ID: ${studentAssigns[0].id}`);
        } else {
            console.error("   ❌ Assignment NOT found for student.");
        }

        // 6. Create NEW Student in Group (Auto-Assign Check)
        console.log("\n6. Creating NEW Student 'Late Joiner' (Auto-Assign Check)...");
        const lateStudentRes = await fetch(`${API_URL}/students`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${teacherToken}`
            },
            body: JSON.stringify({
                name: 'Late Joiner',
                username: 'late_' + Date.now(),
                password: 'abc',
                groupId: groupId
            })
        });
        const lateStudentData = await lateStudentRes.json();
        const lateStudentId = lateStudentData.student.id;

        // Wait a bit for async auto-assign
        await new Promise(r => setTimeout(r, 1000));

        // Check assignments
        const listRes2 = await fetch(`${API_URL}/assignments/teacher`, {
            headers: { 'Authorization': `Bearer ${teacherToken}` }
        });
        const listData2 = await listRes2.json();
        const lateAssigns = listData2.assignments.filter(a => a.studentId === lateStudentId && a.gameId === gameId);

        if (lateAssigns.length > 0) {
            console.log(`   ✅ Auto-Assignment worked! Assignment found for Late Joiner.`);
        } else {
            console.error("   ❌ Auto-Assignment FAILED.");
        }

        // 7. Verify Analytics Endpoint
        console.log("\n7. Verifying Group Analytics endpoint...");
        const analyticsRes = await fetch(`${API_URL}/groups/${groupId}/analytics`, {
            headers: { 'Authorization': `Bearer ${teacherToken}` }
        });
        const analytics = await analyticsRes.json();

        if (analytics.studentCount === 2 && analytics.assignmentsCount > 0) {
            console.log("   ✅ Analytics data correct:", JSON.stringify(analytics));
        } else {
            console.warn("   ⚠️ Analytics data mismatch or empty:", JSON.stringify(analytics));
        }

        console.log("\n🎉 Verification Complete!");


    } catch (e) {
        console.error("\n❌ Test Failed:", e);
    }
}

runTests();
