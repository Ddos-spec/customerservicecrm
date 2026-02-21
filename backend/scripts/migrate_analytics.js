const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function migrate() {
  try {
    console.log('Migrating database...');
    
    // Add business_category to tenants
    await pool.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS business_category VARCHAR(50) DEFAULT 'general';
    `);

    // Drop deprecated tenant analysis webhook column
    await pool.query(`
      ALTER TABLE tenants
      DROP COLUMN IF EXISTS analysis_webhook_url;
    `);
    
    console.log('Migration successful: ensured business_category and removed analysis_webhook_url on tenants.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
