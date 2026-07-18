const express = require('express');
const request = require('supertest');

jest.mock('../wa-gateway-client', () => ({
    login: jest.fn(),
    loginWithPairingCode: jest.fn(),
}));

const waGateway = require('../wa-gateway-client');
const { buildSessionsRouter } = require('../routes/sessions');

function createApp({
    user,
    sessions,
    createSession = jest.fn(),
    deleteSession = jest.fn(),
    getSessionsDetails = () => Array.from(sessions.entries()).map(([sessionId, session]) => ({ sessionId, ...session })),
    refreshSessionOwnerships = jest.fn().mockResolvedValue(undefined),
}) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.session = { user };
        next();
    });
    app.use(buildSessionsRouter({
        sessions,
        createSession,
        deleteSession,
        getSessionsDetails,
        log: jest.fn(),
        refreshSession: jest.fn().mockResolvedValue(undefined),
        refreshSessionOwnerships,
    }));
    return { app, createSession, deleteSession, refreshSessionOwnerships };
}

describe('tenant WhatsApp session access', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns only the owning tenant session', async () => {
        const sessions = new Map([
            ['628111', { status: 'CONNECTED' }],
            ['628222', { status: 'CONNECTING', qr: 'qr' }],
        ]);
        const { app } = createApp({ user: { role: 'admin_agent', session_id: '628111' }, sessions });

        const response = await request(app).get('/sessions');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].sessionId).toBe('628111');
    });

    it('refreshes tenant ownership metadata before returning sessions to a super admin', async () => {
        const sessions = new Map([['628111', { status: 'CONNECTED' }]]);
        const refreshSessionOwnerships = jest.fn().mockResolvedValue(undefined);
        const getSessionsDetails = jest.fn(() => ([{
            sessionId: '628111',
            status: 'CONNECTED',
            owner: 'Rehan Digital',
            ownerType: 'tenant',
            ownerName: 'Rehan',
        }]));
        const { app } = createApp({
            user: { role: 'super_admin' },
            sessions,
            refreshSessionOwnerships,
            getSessionsDetails,
        });

        const response = await request(app).get('/sessions');

        expect(response.status).toBe(200);
        expect(refreshSessionOwnerships).toHaveBeenCalledTimes(1);
        expect(response.body[0]).toMatchObject({
            owner: 'Rehan Digital',
            ownerType: 'tenant',
            ownerName: 'Rehan',
        });
    });

    it('never logs out or recreates an already connected tenant session when QR is requested', async () => {
        const sessions = new Map([['628111', { status: 'CONNECTED' }]]);
        const { app, createSession, deleteSession } = createApp({ user: { role: 'admin_agent', session_id: '628111' }, sessions });

        const response = await request(app).get('/sessions/628111/qr');

        expect(response.status).toBe(409);
        expect(createSession).not.toHaveBeenCalled();
        expect(deleteSession).not.toHaveBeenCalled();
    });

    it('rotates a pending QR without deleting the tenant session', async () => {
        const sessions = new Map([['628111', { status: 'CONNECTING', qr: 'old-qr' }]]);
        waGateway.login.mockResolvedValue({ status: true, data: { qrcode: 'fresh-qr', timeout: 30 } });
        const { app, createSession, deleteSession } = createApp({ user: { role: 'admin_agent', session_id: '628111' }, sessions });

        const response = await request(app).get('/sessions/628111/qr');

        expect(response.status).toBe(200);
        expect(response.body.session.qr).toBe('fresh-qr');
        expect(response.body.timeout).toBe(30);
        expect(new Date(response.body.session.qrExpiresAt).getTime()).toBeGreaterThan(Date.now());
        expect(createSession).not.toHaveBeenCalled();
        expect(deleteSession).not.toHaveBeenCalled();
    });

    it('rejects a tenant attempt to operate another tenant session', async () => {
        const sessions = new Map([['628222', { status: 'CONNECTING' }]]);
        const { app, createSession } = createApp({ user: { role: 'admin_agent', session_id: '628111' }, sessions });

        const response = await request(app).get('/sessions/628222/pair');

        expect(response.status).toBe(403);
        expect(createSession).not.toHaveBeenCalled();
        expect(waGateway.loginWithPairingCode).not.toHaveBeenCalled();
    });
});
