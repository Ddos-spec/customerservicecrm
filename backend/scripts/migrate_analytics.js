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

    // Add tenant analysis webhook URL
    await pool.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS analysis_webhook_url TEXT;
    `);
    
    console.log('Migration successful: Added business_category + analysis_webhook_url to tenants.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
