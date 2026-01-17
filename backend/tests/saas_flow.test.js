const request = require('supertest');
const { app, server, redisClient, redisSessionClient } = require('../index'); 
const db = require('../db');
const bcrypt = require('bcryptjs');

// Mock process.env
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';

let superAdminCookie;
let tenantId;
let ownerId;

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

    // Wait for Redis connection
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
    if (!redisSessionClient.isOpen) {
        await redisSessionClient.connect();
    }
    
    // Aggressive Cleanup
    await db.query('TRUNCATE TABLE user_invites CASCADE');
    await db.query('DELETE FROM users WHERE email IN (\'super@test.com\', \'owner@test.com\')');
    await db.query('DELETE FROM tenants WHERE company_name = \'Test Corp\'');
});

afterAll(async () => {
    // Close everything cleanly
    if (redisClient.isOpen) await redisClient.quit();
    if (redisSessionClient.isOpen) await redisSessionClient.quit();
    if (server) server.close();
    await db.pool.end();
});

describe('SaaS Workflow E2E', () => {
    
    // 1. Login Super Admin
    it('should login as Super Admin', async () => {
        const hash = await bcrypt.hash('superadmin123', 10);
        await db.query(`
            INSERT INTO users (name, email, password_hash, role, status)
            VALUES ('Super Test', 'super@test.com', $1, 'super_admin', 'active')
            ON CONFLICT (email) DO UPDATE SET password_hash = $1
        `, [hash]);

        // Delay sedikit untuk memastikan session store siap
        await new Promise(r => setTimeout(r, 500));

        const res = await request(app)
            .post('/api/v1/admin/login')
            .send({
                email: 'super@test.com',
                password: 'superadmin123'
            });

        if (res.statusCode !== 200) {
            console.error('Super Admin Login Failed:', JSON.stringify(res.body, null, 2));
        }

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        superAdminCookie = getCookie(res);
    });

    // 2. Create Tenant
    it('should create a new Tenant', async () => {
        if (!superAdminCookie) throw new Error('No cookie from previous test');

        const res = await request(app)
            .post('/api/v1/admin/tenants')
            .set('Cookie', superAdminCookie)
            .send({
                company_name: 'Test Corp',
                admin_name: 'Owner Test',
                admin_email: 'owner@test.com',
                admin_password: 'password123',
                admin_phone_number: '628123456789',
                session_id: '628123456789',
                gateway_url: 'http://localhost:3000'
            });

        if (res.statusCode !== 201) {
            console.error('Create Tenant Failed:', JSON.stringify(res.body, null, 2));
        }

        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
        expect(res.body.tenant.api_key).toBeDefined();
        
        tenantId = res.body.tenant.id;
        ownerId = res.body.admin.id;
    });

    // 3. Login as Owner
    it('should login as Owner and get Tenant Session ID', async () => {
        if (!tenantId) throw new Error('Tenant creation failed, skipping owner login test');

        const res = await request(app)
            .post('/api/v1/admin/login')
            .send({
                email: 'owner@test.com',
                password: 'password123'
            });

        if (res.statusCode !== 200) {
            console.error('Owner Login Failed:', JSON.stringify(res.body, null, 2));
        }

        expect(res.statusCode).toEqual(200);
        expect(res.body.user.role).toBe('admin_agent');
        expect(res.body.user.session_id).toBe('628123456789');
    });

    // 4. Impersonate Tenant
    it('should allow Super Admin to Impersonate Tenant', async () => {
        if (!superAdminCookie || !tenantId) throw new Error('Missing prerequisites');

        const res = await request(app)
            .post(`/api/v1/admin/impersonate/${tenantId}`)
            .set('Cookie', superAdminCookie);

        if (res.statusCode !== 200) {
            console.error('Impersonate Failed:', JSON.stringify(res.body, null, 2));
        }

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user.isImpersonating).toBe(true);
        expect(res.body.user.email).toBe('owner@test.com');
    });

    // 5. Cleanup
    it('should delete the test tenant', async () => {
        if (!tenantId) return;

        // Login again to get fresh session (clean slate)
        const loginRes = await request(app)
            .post('/api/v1/admin/login')
            .send({ email: 'super@test.com', password: 'superadmin123' });
        
        const cleanCookie = getCookie(loginRes);

        const res = await request(app)
            .delete(`/api/v1/admin/tenants/${tenantId}`)
            .set('Cookie', cleanCookie);

        if (res.statusCode !== 200) {
            console.error('Delete Failed:', JSON.stringify(res.body, null, 2));
        }

        expect(res.statusCode).toEqual(200);
    });
});