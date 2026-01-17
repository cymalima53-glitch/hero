// Clear invalid Stripe customer IDs from teachers.json
// Run this once to fix the "No such customer" error

const fs = require('fs').promises;
const path = require('path');

const TEACHERS_FILE = path.join(__dirname, 'data/teachers.json');

async function clearCustomerIds() {
    try {
        const data = await fs.readFile(TEACHERS_FILE, 'utf8');
        const teachersData = JSON.parse(data);

        let clearedCount = 0;

        teachersData.teachers.forEach(teacher => {
            if (teacher.stripeCustomerId) {
                console.log(`Clearing customer ID for ${teacher.email}: ${teacher.stripeCustomerId}`);
                delete teacher.stripeCustomerId;
                clearedCount++;
            }
        });

        await fs.writeFile(TEACHERS_FILE, JSON.stringify(teachersData, null, 2));

        console.log(`\n✅ Cleared ${clearedCount} invalid customer ID(s)`);
        console.log('Teachers can now create new checkout sessions without errors.');
        console.log('Customer IDs will be stored again after successful checkout.');

    } catch (error) {
        console.error('Error clearing customer IDs:', error);
    }
}

clearCustomerIds();
