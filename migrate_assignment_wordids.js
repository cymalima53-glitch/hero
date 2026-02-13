// Migration Script: Add wordIds to Existing Assignments
// Run this ONCE to migrate existing assignments to the new structure

const fs = require('fs').promises;
const path = require('path');

async function migrate() {
    console.log('🔄 Starting migration: Adding wordIds to existing assignments...\n');

    try {
        // 1. Load assignments
        const assignmentsPath = path.join(__dirname, 'data/assignments.json');
        const assignmentsData = JSON.parse(await fs.readFile(assignmentsPath, 'utf8'));
        const assignments = assignmentsData.assignments || [];

        console.log(`📋 Found ${assignments.length} assignments to check\n`);

        // 2. Load language files to get current gameConfig
        const langs = ['en', 'fr', 'es'];
        const gameConfigs = {};

        for (const lang of langs) {
            try {
                const langPath = path.join(__dirname, `data/${lang}.json`);
                const langData = JSON.parse(await fs.readFile(langPath, 'utf8'));
                gameConfigs[lang] = langData.gameConfig || {};
                console.log(`✅ Loaded ${lang}.json gameConfig`);
            } catch (e) {
                console.log(`⚠️  Skipping ${lang}.json (not found)`);
            }
        }

        console.log('');

        // 3. Migrate each assignment
        let migratedCount = 0;
        let skippedCount = 0;

        for (const assignment of assignments) {
            // Ensure settings exists
            if (!assignment.settings) assignment.settings = {};

            // Skip if already has wordIds
            if (assignment.settings.wordIds && assignment.settings.wordIds.length > 0) {
                console.log(`⏭️  ${assignment.id}: Already has wordIds (${assignment.settings.wordIds.length} words)`);
                skippedCount++;
                continue;
            }

            // Get word IDs from gameConfig
            const lang = assignment.settings.lang || 'en';
            const gameConfig = gameConfigs[lang]?.[assignment.gameId];
            const wordIds = gameConfig?.questions || [];

            // Store in assignment
            assignment.settings.wordIds = wordIds;

            console.log(`✅ ${assignment.id}: Added ${wordIds.length} words from ${lang} gameConfig.${assignment.gameId}`);
            migratedCount++;
        }

        // 4. Save updated assignments
        await fs.writeFile(assignmentsPath, JSON.stringify(assignmentsData, null, 2));

        console.log('\n' + '='.repeat(60));
        console.log('✅ Migration complete!');
        console.log(`   - Migrated: ${migratedCount} assignments`);
        console.log(`   - Skipped: ${skippedCount} assignments (already had wordIds)`);
        console.log(`   - Total: ${assignments.length} assignments`);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        console.error('\nPlease restore from backup if needed:');
        console.error('   cp data/assignments.backup.*.json data/assignments.json');
        process.exit(1);
    }
}

// Run migration
migrate().catch(console.error);
