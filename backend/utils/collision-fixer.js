const db = require('../db');

async function normalizeSessionId(id) {
    if (!id) return null;
    let clean = id.toString().trim();
    clean = clean.replace(/\D/g, '');
    if (clean.startsWith('0')) {
        return '62' + clean.slice(1);
    }
    return clean;
}

async function fixSessionCollisions() {
    console.log('[Auto-Fix] 🔍 Checking for Session Identity Collisions...');
    
    try {
        // Use existing DB pool from backend
        const tenants = await db.query('SELECT id, company_name, session_id FROM tenants WHERE session_id IS NOT NULL');
        
        const map = new Map(); // Normalized -> [Tenants]

        for (const t of tenants.rows) {
            const norm = await normalizeSessionId(t.session_id);
            if (!norm) continue;

            if (!map.has(norm)) {
                map.set(norm, []);
            }
            map.get(norm).push(t);
        }

        let collisionCount = 0;

        for (const [norm, list] of map.entries()) {
            if (list.length > 1) {
                console.warn(`[Auto-Fix] ❌ COLLISION DETECTED for ID: ${norm}`);
                
                // Strategy: Keep the one that matches normalized ID exactly, or the first one.
                const exactMatch = list.find(t => t.session_id === norm);
                const winner = exactMatch || list[0];
                
                console.log(`[Auto-Fix] 👉 WINNER: ${winner.company_name} (Keeping session_id)`);
                
                for (const loser of list) {
                    if (loser.id === winner.id) continue;
                    
                    console.log(`[Auto-Fix] 🛠️ FIXING: Removing duplicate session_id from ${loser.company_name}...`);
                    await db.query('UPDATE tenants SET session_id = NULL WHERE id = $1', [loser.id]);
                }
                collisionCount++;
            }
        }

        if (collisionCount > 0) {
            console.log(`[Auto-Fix] ✅ Fixed ${collisionCount} collisions. Identities are now unique.`);
        } else {
            console.log('[Auto-Fix] ✅ No collisions found. System healthy.');
        }

    } catch (err) {
        console.error('[Auto-Fix] ❌ Error during check:', err.message);
    }
}

module.exports = { fixSessionCollisions };
