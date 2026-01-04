// Quick test script for analytics endpoint
const fetch = require('node-fetch');

async function testAnalytics() {
    try {
        console.log('Testing analytics insights endpoint...');

        const response = await fetch('http://localhost:3000/api/analytics/insights', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': 'teacherToken=test' // This will fail auth but we'll see if endpoint responds
            },
            body: JSON.stringify({
                studentId: 'test123',
                summary: {
                    totalGames: 5,
                    avgAccuracy: 85,
                    weakAreas: ['memoryEcho'],
                    completedGames: 5
                },
                sessions: []
            })
        });

        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);

    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

testAnalytics();
