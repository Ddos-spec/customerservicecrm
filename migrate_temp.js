const db = require('./backend/db');

async function migrate() {
    try {
        console.log('Migrating database...');
        
        // Add sender_name to messages table
        await db.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS sender_name TEXT;
        `);
        console.log('✅ Added sender_name column to messages table.');

        console.log('Migration complete.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
