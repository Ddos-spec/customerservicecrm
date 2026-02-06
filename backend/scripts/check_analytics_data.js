const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkData() {
  try {
    const tenants = await pool.query('SELECT id, company_name FROM tenants');
    
    console.log('--- DIAGNOSA DATA ANALYTICS ---');
    
    for (const tenant of tenants.rows) {
        console.log(`
Tenant: ${tenant.company_name} (${tenant.id})`);
        
        // Cek total pesan
        const totalMsg = await pool.query('SELECT COUNT(*) FROM messages m JOIN chats c ON m.chat_id = c.id WHERE c.tenant_id = $1', [tenant.id]);
        console.log(`- Total Pesan (All): ${totalMsg.rows[0].count}`);

        // Cek pesan yang valid untuk analisis
        const validMsg = await pool.query(`
            SELECT COUNT(*) 
            FROM messages m 
            JOIN chats c ON m.chat_id = c.id 
            WHERE c.tenant_id = $1 
            AND m.sender_type = 'contact'
            AND m.message_type = 'text'
        `, [tenant.id]);
        console.log(`- Pesan Valid (Incoming Text): ${validMsg.rows[0].count}`);

        if (parseInt(validMsg.rows[0].count) > 0) {
            // Sample pesan
            const sample = await pool.query(`
                SELECT m.body 
                FROM messages m 
                JOIN chats c ON m.chat_id = c.id 
                WHERE c.tenant_id = $1 
                AND m.sender_type = 'contact'
                AND m.message_type = 'text'
                LIMIT 3
            `, [tenant.id]);
            console.log('- Sample Pesan:');
            sample.rows.forEach(r => console.log(`  "${r.body}"`));
        } else {
            console.log('  ⚠️ TIDAK ADA DATA UNTUK DIANALISIS');
            console.log('  Pastikan ada pesan masuk (Incoming) dari WA Customer.');
        }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkData();
