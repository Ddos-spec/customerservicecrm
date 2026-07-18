const express = require('express');
const waGateway = require('../wa-gateway-client');

function buildSessionsRouter(deps) {
    const router = express.Router();
    const {
        sessions,
        createSession,
        getSessionsDetails,
        deleteSession,
        log,
        refreshSession,
        db,
    } = deps;

    // A tenant owner must only ever see or operate the WhatsApp device bound to
    // their tenant.  Apart from being an access-control boundary, this prevents
    // one tenant accidentally regenerating another tenant's QR/login state.
    const getCurrentUser = (req) => deps.resolveAuthenticatedUser?.(req) || req.session?.user || null;
    const canAccessSession = (req, sessionId) => {
        const user = getCurrentUser(req);
        return Boolean(user && (
            user.role === 'super_admin'
            || (user.role === 'admin_agent' && String(user.session_id || '') === String(sessionId || ''))
        ));
    };
    const requireSessionAccess = (req, res, next) => {
        if (!canAccessSession(req, req.params.sessionId)) {
            return res.status(403).json({ status: 'error', message: 'Anda tidak memiliki akses ke sesi WhatsApp ini.' });
        }
        next();
    };
    const toSessionPayload = (sessionId) => {
        const session = sessions.get(sessionId);
        return {
            sessionId,
            status: session?.status || 'UNKNOWN',
            qr: session?.qr || null,
            qrExpiresAt: session?.qrExpiresAt || null,
            connectedNumber: session?.connectedNumber || null,
        };
    };

    async function ensureSessionForConnection(sessionId) {
        const existing = sessions.get(sessionId);
        if (existing?.status === 'CONNECTED') return existing;

        // Do not logout/recreate a known device merely to display a QR or a
        // phone-pairing code. Recreating used to invalidate a working tenant
        // device and made unrelated tenants reconnect after an update.
        if (!sessions.has(sessionId)) {
            await createSession(sessionId);
        }
        return sessions.get(sessionId);
    }

    router.post('/sessions', async (req, res) => {
        // ... (truncated for brevity, logic remains same)
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });

        const currentUser = getCurrentUser(req);
        if (!currentUser) {
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }
        if (currentUser.role !== 'super_admin') {
            return res.status(403).json({ status: 'error', message: 'Only super admin can create a new WhatsApp session' });
        }

        const { sessionId } = req.body;
        if (!sessionId) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'sessionId is required', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'sessionId is required' });
        }

        const sanitizedSessionId = sessionId.trim().replace(/\s+/g, '_');

        try {
            const creatorEmail = currentUser ? currentUser.email : null;
            await createSession(sanitizedSessionId, creatorEmail);

            log('Session created', sanitizedSessionId, {
                event: 'session-created',
                sessionId: sanitizedSessionId,
                createdBy: currentUser ? currentUser.email : 'api-key'
            });
            await db?.logActivity({
                actorId: currentUser.id,
                action: 'session.created',
                entityType: 'whatsapp_session',
                entityId: sanitizedSessionId,
                summary: `${currentUser.name || 'Super Admin'} membuat sesi WhatsApp ${sanitizedSessionId}`,
            }).catch((activityError) => log('Activity log skipped', 'SYSTEM', { error: activityError.message }));
            res.status(201).json({
                status: 'success',
                message: `Session ${sanitizedSessionId} created.`,
                sessionId: sanitizedSessionId
            });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            if (error.message === 'Session already exists') {
                return res.status(409).json({ status: 'error', message: 'Session already exists' });
            }
            res.status(500).json({ status: 'error', message: `Failed to create session: ${error.message}` });
        }
    });

    router.get('/sessions', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });

        const user = getCurrentUser(req);
        if (!user) {
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }

        try {
            await deps.refreshSessionOwnerships?.();
        } catch (error) {
            // Ownership metadata must never make the session control plane
            // unavailable. The UI will explicitly mark a session as unmapped
            // instead of inventing an owner when the lookup fails.
            log('Session ownership lookup failed', 'SYSTEM', {
                event: 'session-ownership-lookup-failed',
                error: error.message,
            });
        }

        let sessionsData = getSessionsDetails();
        if (user.role !== 'super_admin') {
            sessionsData = sessionsData.filter((session) => String(session.sessionId) === String(user.session_id || ''));
        }

        // Trigger background refresh for stale sessions
        if (refreshSession) {
            sessionsData.forEach(session => {
                refreshSession(session.sessionId).catch(() => {});
            });
        }

        return res.status(200).json(sessionsData);
    });

    router.delete('/sessions/:sessionId', requireSessionAccess, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId parameter is required' });
        }

        try {
            const cleanup = await deleteSession(sessionId);
            const currentUser = getCurrentUser(req);
            await db?.logActivity({
                actorId: currentUser?.id || null,
                action: 'session.deleted',
                entityType: 'whatsapp_session',
                entityId: sessionId,
                summary: `${currentUser?.name || 'Admin'} menghapus sesi WhatsApp ${sessionId}`,
            }).catch((activityError) => log('Activity log skipped', 'SYSTEM', { error: activityError.message }));
            log('Session deleted', sessionId, { event: 'session-deleted', sessionId, cleanup });
            res.status(200).json({ status: 'success', message: `Session ${sessionId} deleted.`, cleanup });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            res.status(500).json({ status: 'error', message: `Failed to delete session: ${error.message}` });
        }
    });

    router.post('/sessions/:sessionId/disconnect', requireSessionAccess, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId parameter is required' });
        }

        try {
            const cleanup = await deleteSession(sessionId, {
                unlinkReferences: false,
                reason: 'manual-disconnect'
            });
            const currentUser = getCurrentUser(req);
            await db?.logActivity({
                actorId: currentUser?.id || null,
                action: 'session.disconnected',
                entityType: 'whatsapp_session',
                entityId: sessionId,
                summary: `${currentUser?.name || 'Admin'} memutuskan sesi WhatsApp ${sessionId}`,
            }).catch((activityError) => log('Activity log skipped', 'SYSTEM', { error: activityError.message }));
            log('Session disconnected', sessionId, { event: 'session-disconnected', sessionId, cleanup });
            res.status(200).json({
                status: 'success',
                message: `Session ${sessionId} disconnected.`,
                cleanup
            });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            res.status(500).json({ status: 'error', message: `Failed to disconnect session: ${error.message}` });
        }
    });

    router.get('/sessions/:sessionId/qr', requireSessionAccess, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });

        const { sessionId } = req.params;

        log(`QR code regeneration requested for ${sessionId}`, sessionId);

        try {
            const activeSession = await ensureSessionForConnection(sessionId);
            if (activeSession?.status === 'CONNECTED') {
                return res.status(409).json({
                    status: 'error',
                    message: 'WhatsApp sudah terhubung. Putuskan koneksi secara eksplisit bila memang ingin mengganti perangkat.'
                });
            }

            // Rotate only the pending login challenge. The gateway disconnects
            // its temporary, unpaired client and issues a fresh QR; it does not
            // logout a linked WhatsApp device.
            const gatewayResult = await waGateway.login(sessionId);
            const freshQr = gatewayResult?.data?.qrcode || gatewayResult?.qrcode || null;
            const gatewayMessage = (gatewayResult?.message || '').toLowerCase();
            if (gatewayMessage.includes('reconnected') || gatewayMessage.includes('already connected')) {
                activeSession.status = 'CONNECTED';
                activeSession.qr = null;
                sessions.set(sessionId, activeSession);
                return res.status(409).json({
                    status: 'error',
                    message: 'WhatsApp sudah terhubung. Putuskan koneksi secara eksplisit bila memang ingin mengganti perangkat.'
                });
            }
            if (!freshQr) {
                throw new Error(gatewayResult?.message || 'Gateway tidak mengembalikan QR code');
            }
            const qrTimeout = Number(gatewayResult?.data?.timeout || gatewayResult?.timeout || 0);
            activeSession.status = 'CONNECTING';
            activeSession.qr = freshQr;
            activeSession.qrExpiresAt = qrTimeout > 0
                ? new Date(Date.now() + (qrTimeout * 1000)).toISOString()
                : null;
            sessions.set(sessionId, activeSession);

            log(`QR code regeneration initiated for ${sessionId}`, sessionId);
            res.status(200).json({
                status: 'success',
                message: 'QR code siap untuk dipindai.',
                timeout: qrTimeout || null,
                session: toSessionPayload(sessionId)
            });
        } catch (error) {
            log(`Error regenerating QR for ${sessionId}: ${error.message}`, sessionId, { error });
            res.status(500).json({
                status: 'error',
                message: 'Failed to regenerate QR code. Please try again.'
            });
        }
    });

    router.get('/sessions/:sessionId/pair', requireSessionAccess, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId parameter is required' });
        }

        try {
            const activeSession = await ensureSessionForConnection(sessionId);
            if (activeSession?.status === 'CONNECTED') {
                return res.status(409).json({
                    status: 'error',
                    message: 'WhatsApp sudah terhubung. Putuskan koneksi secara eksplisit bila memang ingin mengganti perangkat.'
                });
            }

            const result = await waGateway.loginWithPairingCode(sessionId);
            const pairCode = result?.data?.paircode || result?.paircode || null;
            if (!pairCode) {
                throw new Error(result?.message || 'Gateway tidak mengembalikan kode telepon');
            }
            res.status(200).json({
                status: 'success',
                pairCode,
                timeout: result?.data?.timeout || result?.timeout || 160,
            });
        } catch (error) {
            log('Pair code error', sessionId, { event: 'pair-code-error', error: error.message });
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    return router;
}

module.exports = { buildSessionsRouter };

