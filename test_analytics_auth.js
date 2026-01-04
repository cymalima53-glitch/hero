// Test analytics endpoint with authentication
const fetch = require('node-fetch');

async function testWithAuth() {
    try {
        // First, login to get auth cookie
        console.log('Step 1: Logging in...');
        const loginRes = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'teacher@test.com',
                password: 'password123'
            })
        });

        // Extract cookie
        const cookies = loginRes.headers.raw()['set-cookie'];
        const cookieHeader = cookies ? cookies.join('; ') : '';
        console.log('Login status:', loginRes.status);
        console.log('Cookie:', cookieHeader ? 'Received' : 'None');

        if (!cookieHeader) {
            console.log('⚠️  No auth cookie - endpoint may fail');
        }

        // Now test analytics insights
        console.log('\nStep 2: Testing analytics insights...');
        const response = await fetch('http://localhost:3000/api/analytics/insights', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookieHeader
            },
            body: JSON.stringify({
                studentId: 'test123',
                summary: {
                    totalGames: 5,
                    avgAccuracy: 85,
                    weakAreas: ['memoryEcho'],
                    completedGames: 5
                },
                sessions: [
                    {
                        gameId: 'memoryEcho',
                        analytics: { attempts: 10, failuresBeforePass: 2 }
                    }
                ]
            })
        });

        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log('\n✅ SUCCESS! Endpoint is working!');
        } else {
            console.log('\n❌ FAILED:', data.error || data.message);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testWithAuth();
