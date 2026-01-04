// Simple test to trigger the insights endpoint and see server logs
const https = require('https');

const data = JSON.stringify({
    studentId: 'test-student-123',
    summary: {
        totalGames: 10,
        avgAccuracy: 75,
        weakAreas: ['memoryEcho', 'matchPairs'],
        completedGames: 8
    },
    sessions: [
        {
            gameId: 'memoryEcho',
            createdAt: '2026-01-04T00:00:00Z',
            analytics: { attempts: 15, failuresBeforePass: 3 }
        },
        {
            gameId: 'matchPairs',
            createdAt: '2026-01-04T01:00:00Z',
            analytics: { attempts: 12, failuresBeforePass: 5 }
        }
    ]
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/analytics/insights',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        // Note: This won't have auth, so it will fail at auth middleware
        // But we can see if the endpoint is reachable
    },
    rejectUnauthorized: false
};

console.log('Sending POST request to /api/analytics/insights...');
console.log('Watch the server console for debug logs!\n');

const req = https.request(options, (res) => {
    console.log(`Response Status: ${res.statusCode}`);

    let responseData = '';
    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        console.log('Response Body:', responseData);
        if (res.statusCode === 401) {
            console.log('\n⚠️  Got 401 - This is expected (no auth cookie)');
            console.log('But the endpoint is reachable!');
            console.log('Check server logs for the debug messages.');
        }
    });
});

req.on('error', (error) => {
    console.error('Request Error:', error.message);
});

req.write(data);
req.end();

setTimeout(() => {
    console.log('\n✅ Test complete. Check server console above for:');
    console.log('   - "=== INSIGHTS REQUEST RECEIVED ==="');
    console.log('   - "API Key exists: true/false"');
    console.log('   - Any OpenAI error messages');
}, 1000);
