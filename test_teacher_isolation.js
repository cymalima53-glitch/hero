const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3000';

// Test Data Isolation Between Teachers
async function testTeacherIsolation() {
    console.log('🧪 Testing Teacher Data Isolation...\n');

    try {
        // Step 1: Create Teacher A
        console.log('📝 Step 1: Creating Teacher A...');
        const teacherA = {
            email: `teacherA_${Date.now()}@test.com`,
            password: 'testpass123'
        };

        const regA = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teacherA)
        });
        const regAData = await regA.json();
        console.log('✅ Teacher A registered:', teacherA.email);

        // Note: In real scenario, teacher would verify email
        // For testing, we'll need to manually verify or skip verification
        console.log('⚠️  Note: Email verification required. Check server logs for verification link.\n');

        // Step 2: Create Teacher B
        console.log('📝 Step 2: Creating Teacher B...');
        const teacherB = {
            email: `teacherB_${Date.now()}@test.com`,
            password: 'testpass123'
        };

        const regB = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teacherB)
        });
        const regBData = await regB.json();
        console.log('✅ Teacher B registered:', teacherB.email);
        console.log('⚠️  Note: Email verification required. Check server logs for verification link.\n');

        console.log('📋 Test Summary:');
        console.log('1. Two teacher accounts created');
        console.log('2. Each teacher needs to verify email via link in server logs');
        console.log('3. After verification, login and test:');
        console.log('   - Teacher A uploads words');
        console.log('   - Teacher B should see EMPTY word list');
        console.log('   - Teacher A should see only their words');
        console.log('\n✅ Test setup complete! Please verify emails and test manually.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run test
testTeacherIsolation();
