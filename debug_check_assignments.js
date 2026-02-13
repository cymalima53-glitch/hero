const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data/assignments.json');

try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw);
    const assignments = data.assignments || [];

    console.log(`Found ${assignments.length} assignments.`);

    // Show last 3
    const last3 = assignments.slice(-3);
    last3.forEach(a => {
        console.log('---');
        console.log(`ID: ${a.id}`);
        console.log(`Game: ${a.gameId}`);
        console.log(`Settings:`, JSON.stringify(a.settings, null, 2));
        if (a.settings && a.settings.wordIds) {
            console.log(`Word IDs Count: ${a.settings.wordIds.length}`);
            console.log(`Word IDs: ${JSON.stringify(a.settings.wordIds)}`);
        } else {
            console.log('⚠️  NO WORD IDs FOUND in settings!');
        }
    });

} catch (e) {
    console.error(e);
}
