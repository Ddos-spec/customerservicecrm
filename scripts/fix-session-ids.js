const { Pool } = require('../backend/node_modules/pg');
require('../backend/node_modules/dotenv').config({ path: './backend/.env' });

// Fallback if .env not found relative to script
if (!process.env.DATABASE_URL) {
    require('dotenv').config({ path: './backend/.env' });
}
if (!process.env.DATABASE_URL) {
    require('dotenv').config();
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function normalizeSessionId(id) {
    if (!id) return null;
    let clean = id.trim();
    // Remove non-digits
    clean = clean.replace(/\D/g, '');
    
    // Check if starts with 0
    if (clean.startsWith('0')) {
        return '62' + clean.slice(1);
    }
    return clean;
}

async function fixSessionIds() {
    console.log('🔧 Starting Session ID Fixer...');
    
    try {
        const client = await pool.connect();
        console.log('✅ Connected to Database');

        // 1. Fix Tenants
        console.log('\n--- Checking Tenants ---');
        const tenants = await client.query('SELECT id, company_name, session_id FROM tenants WHERE session_id IS NOT NULL');
        
        for (const t of tenants.rows) {
            const original = t.session_id;
            const fixed = await normalizeSessionId(original);

            if (original !== fixed) {
                console.log(`[Tenant] Fixing ${t.company_name}: ${original} -> ${fixed}`);
                await client.query('UPDATE tenants SET session_id = $1 WHERE id = $2', [fixed, t.id]);
            } else {
                console.log(`[Tenant] OK ${t.company_name}: ${original}`);
            }
        }

        // 2. Fix Users (Super Admin usually)
        console.log('\n--- Checking Users ---');
        const users = await client.query('SELECT id, name, email, session_id FROM users WHERE session_id IS NOT NULL');

        for (const u of users.rows) {
            const original = u.session_id;
            const fixed = await normalizeSessionId(original);

            if (original !== fixed) {
                console.log(`[User] Fixing ${u.name} (${u.email}): ${original} -> ${fixed}`);
                await client.query('UPDATE users SET session_id = $1 WHERE id = $2', [fixed, u.id]);
            } else {
                console.log(`[User] OK ${u.name}: ${original}`);
            }
        }
        
        // 3. Fix System Settings (Notifier)
        console.log('\n--- Checking System Settings ---');
        const settings = await client.query("SELECT key, value FROM system_settings WHERE key = 'notifier_session_id'");
        if (settings.rows.length > 0) {
            const original = settings.rows[0].value;
            const fixed = await normalizeSessionId(original);
            
            if (original !== fixed) {
                 console.log(`[System] Fixing Notifier: ${original} -> ${fixed}`);
                 await client.query("UPDATE system_settings SET value = $1 WHERE key = 'notifier_session_id'", [fixed]);
            } else {
                 console.log(`[System] OK Notifier: ${original}`);
            }
        }

        console.log('\n✅ All Done! Database pointers are now standardized to 62...');
        client.release();
        process.exit(0);

    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

fixSessionIds();
