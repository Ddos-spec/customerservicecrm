const request = require('supertest');
const { app, server } = require('../index'); // Kita butuh export app dari index.js
const db = require('../db');

// Mock process.env
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';

let superAdminCookie;
let ownerCookie;
let tenantId;
let ownerId;

// Helper to extract cookie
const getCookie = (res) => {
    const cookies = res.headers['set-cookie'];
    if (!cookies) return null;
    return cookies.map(c => c.split(';')[0]).join('; ');
};

beforeAll(async () => {
    // Tunggu server/db siap (opsional, tergantung setup)
    // Di real CI, service postgres jalan duluan
});

afterAll(async () => {
    if (server) server.close();
    await db.pool.end();
});

describe('SaaS Workflow E2E', () => {
    
    // 1. Login Super Admin
    it('should login as Super Admin', async () => {
        // Ensure super admin exists (idempotent)
        await db.ensureSuperAdmin(); // Pastikan fungsi ini di-export di db.js atau auth.js? 
        // Ah, ensureSuperAdmin ada di auth.js, tapi dipanggil di index.js
        // Kita asumsikan seed sudah jalan atau manual insert user test
        
        // Manual insert super admin for test stability
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('superadmin123', 10);
        await db.query(`
            INSERT INTO users (name, email, password_hash, role, status)
            VALUES ('Super Test', 'super@test.com', $1, 'super_admin', 'active')
            ON CONFLICT (email) DO UPDATE SET password_hash = $1
        `, [hash]);

        const res = await request(app)
            .post('/api/v1/admin/login')
            .send({
                email: 'super@test.com',
                password: 'superadmin123'
            });

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user.role).toBe('super_admin');
        superAdminCookie = getCookie(res);
    });

    // 2. Create Tenant (API Key auto-generated)
    it('should create a new Tenant', async () => {
        const res = await request(app)
            .post('/api/v1/admin/tenants')
            .set('Cookie', superAdminCookie)
            .send({
                company_name: 'Test Corp',
                admin_name: 'Owner Test',
                admin_email: 'owner@test.com',
                admin_password: 'password123',
                admin_phone_number: '628123456789',
                session_id: '628123456789'
            });

        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
        expect(res.body.tenant.api_key).toBeDefined(); // Cek fitur API Key
        
        tenantId = res.body.tenant.id;
        ownerId = res.body.admin.id;
    });

    // 3. Login as Owner (Check Single Session)
    it('should login as Owner and get Tenant Session ID', async () => {
        const res = await request(app)
            .post('/api/v1/admin/login')
            .send({
                email: 'owner@test.com',
                password: 'password123'
            });

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user.role).toBe('admin_agent');
        
        // CRITICAL CHECK: Single Session Architecture
        // User session_id should match Tenant session_id
        expect(res.body.user.session_id).toBe('628123456789');
        
        ownerCookie = getCookie(res);
    });

    // 4. Impersonate Tenant (Super Admin Feature)
    it('should allow Super Admin to Impersonate Tenant', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/impersonate/${tenantId}`)
            .set('Cookie', superAdminCookie);

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user.isImpersonating).toBe(true);
        expect(res.body.user.email).toBe('owner@test.com');
        
        // Update cookie to impersonated session
        const impersonateCookie = getCookie(res); // Session cookie changed?
        // Note: Express-session might update the existing session in-place or issue new cookie
        // We reuse superAdminCookie if ID stays same, but let's see.
    });

    // 5. Cleanup
    it('should delete the test tenant', async () => {
        // Need to stop impersonate first or re-login as super admin?
        // Impersonated user is Owner, cannot delete tenant.
        // Let's re-login super admin for cleanup
        const loginRes = await request(app)
            .post('/api/v1/admin/login')
            .send({ email: 'super@test.com', password: 'superadmin123' });
        const cleanCookie = getCookie(loginRes);

        const res = await request(app)
            .delete(`/api/v1/admin/tenants/${tenantId}`)
            .set('Cookie', cleanCookie);

        expect(res.statusCode).toEqual(200);
    });
});
