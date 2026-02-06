const request = require('supertest');
const { app, server, redisClient, redisSessionClient } = require('../index'); 
const db = require('../db');
const bcrypt = require('bcryptjs');

// Mock process.env
process.env.NODE_ENV = 'test';

let ownerCookie;
let tenantId;
let chatId;

// Helper to extract cookie
const getCookie = (res) => {
    const cookies = res.headers['set-cookie'];
    if (!cookies) return null;
    return cookies.map(c => c.split(';')[0]).join('; ');
};

beforeAll(async () => {
    // Wait for DB connection
    let retries = 10;
    while (retries > 0) {
        try {
            await db.query('SELECT 1');
            break;
        } catch (err) {
            console.log('Waiting for DB...', err.message);
            retries--;
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // Connect Redis
    if (!redisClient.isOpen) await redisClient.connect();
    if (!redisSessionClient.isOpen) await redisSessionClient.connect();
    
    // Cleanup old test data
    await db.query("DELETE FROM users WHERE email = 'analytics_owner@test.com'");
    await db.query("DELETE FROM tenants WHERE company_name = 'Analytics Corp'");
});

afterAll(async () => {
    // Cleanup
    if (tenantId) {
        await db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    }
    
    if (redisClient.isOpen) await redisClient.quit();
    if (redisSessionClient.isOpen) await redisSessionClient.quit();
    if (server) server.close();
    await db.pool.end();
});

describe('Analytics API', () => {
    
    it('should setup tenant and owner', async () => {
        // Create Tenant
        const tenantRes = await db.query(`
            INSERT INTO tenants (company_name, status, session_id, api_key, business_category)
            VALUES ('Analytics Corp', 'active', '62899999999', 'test_analytics_key', 'general')
            RETURNING id
        `);
        tenantId = tenantRes.rows[0].id;

        // Create User
        const hash = await bcrypt.hash('password123', 10);
        await db.query(`
            INSERT INTO users (tenant_id, name, email, password_hash, role, status)
            VALUES ($1, 'Analytics Owner', 'analytics_owner@test.com', $2, 'admin_agent', 'active')
        `, [tenantId, hash]);

        // Login
        const res = await request(app)
            .post('/api/v1/admin/login')
            .send({
                email: 'analytics_owner@test.com',
                password: 'password123'
            });

        expect(res.statusCode).toEqual(200);
        ownerCookie = getCookie(res);
    });

    it('should seed chat messages', async () => {
        // Create Contact
        const contactRes = await db.query(`
            INSERT INTO contacts (tenant_id, jid, full_name, phone_number)
            VALUES ($1, '62888888888@s.whatsapp.net', 'Test Customer', '62888888888')
            RETURNING id
        `, [tenantId]);
        const contactId = contactRes.rows[0].id;

        // Create Chat
        const chatRes = await db.query(`
            INSERT INTO chats (tenant_id, contact_id, status)
            VALUES ($1, $2, 'open')
            RETURNING id
        `, [tenantId, contactId]);
        chatId = chatRes.rows[0].id;

        // Create Messages (using some keywords)
        const messages = [
            'Halo admin, mau tanya harga promo',
            'Berapa harga paket hemat?',
            'Apakah ada diskon untuk member?',
            'Terima kasih infonya'
        ];

        for (const msg of messages) {
            await db.query(`
                INSERT INTO messages (chat_id, sender_type, body, created_at)
                VALUES ($1, 'contact', $2, now())
            `, [chatId, msg]);
        }
    });

    it('should get keyword analytics', async () => {
        const res = await request(app)
            .get('/api/v1/analytics/keywords')
            .set('Cookie', ownerCookie);

        expect(res.statusCode).toEqual(200);
        expect(res.body.status).toBe('success');
        expect(res.body.data.keywords).toBeInstanceOf(Array);
        
        // Check for specific keywords
        const keywords = res.body.data.keywords;
        const harga = keywords.find(k => k.word === 'harga');
        const promo = keywords.find(k => k.word === 'promo');
        
        expect(harga).toBeDefined();
        expect(harga.count).toBeGreaterThanOrEqual(2); // 'harga' appears twice
    });

    it('should update business category', async () => {
        const res = await request(app)
            .put('/api/v1/analytics/category')
            .set('Cookie', ownerCookie)
            .send({ category: 'fnb' });

        expect(res.statusCode).toEqual(200);
        
        // Verify update
        const check = await request(app)
            .get('/api/v1/analytics/keywords')
            .set('Cookie', ownerCookie);
            
        expect(check.body.data.category).toBe('fnb');
    });
});
