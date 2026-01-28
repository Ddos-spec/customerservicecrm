const express = require('express');

function buildSessionsRouter(deps) {
    const router = express.Router();
    const {
        sessions,
        sessionTokens,
        createSession,
        getSessionsDetails,
        deleteSession,
        log,
        phonePairing,
        saveSessionSettings,
        regenerateSessionToken,
        setWebhookUrl,
        getWebhookUrl,
        deleteWebhookUrl,
        scheduleMessageSend,
        validateWhatsAppRecipient,
        validateToken,
        refreshSession,
    } = deps;

    const requireSuperAdminSession = (req, res, next) => {
        const user = req.session?.user;
        if (!user) {
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }
        if (user.role !== 'super_admin') {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }
        return next();
    };

    router.post('/sessions', async (req, res) => {
        // ... (truncated for brevity, logic remains same)
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });

        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;

        if (!currentUser) {
            const masterKey = req.headers['x-master-key'];
            const requiredMasterKey = process.env.MASTER_API_KEY;

            if (requiredMasterKey && masterKey !== requiredMasterKey) {
                log('Unauthorized session creation attempt', 'SYSTEM', {
                    event: 'auth-failed',
                    endpoint: req.originalUrl,
                    ip: req.ip
                });
                return res.status(401).json({
                    status: 'error',
                    message: 'Master API key required for session creation'
                });
            }
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
            const token = sessionTokens.get(sanitizedSessionId);

            log('Session created', sanitizedSessionId, {
                event: 'session-created',
                sessionId: sanitizedSessionId,
                createdBy: currentUser ? currentUser.email : 'api-key'
            });
            res.status(201).json({
                status: 'success',
                message: `Session ${sanitizedSessionId} created.`,
                sessionId: sanitizedSessionId,
                token: token
            });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            if (error.message === 'Session already exists') {
                return res.status(409).json({ status: 'error', message: 'Session already exists' });
            }
            res.status(500).json({ status: 'error', message: `Failed to create session: ${error.message}` });
        }
    });

    router.get('/sessions', (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });

        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;

        let sessionsData = [];
        if (currentUser) {
            sessionsData = getSessionsDetails(currentUser.email, currentUser.role === 'admin');
        } else {
            sessionsData = getSessionsDetails();
        }

        // Trigger background refresh for stale sessions
        if (refreshSession) {
            sessionsData.forEach(session => {
                // AGRESSIVE CHECK: If not connected, force check!
                if (session.status !== 'CONNECTED') {
                    refreshSession(session.sessionId).catch(() => {});
                }
            });
        }

        return res.status(200).json(sessionsData);
    });

    router.delete('/sessions/:sessionId', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId parameter is required' });
        }

        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;

        try {
            await deleteSession(sessionId);
            log('Session deleted', sessionId, { event: 'session-deleted', sessionId });
            res.status(200).json({ status: 'success', message: `Session ${sessionId} deleted.` });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            res.status(500).json({ status: 'error', message: `Failed to delete session: ${error.message}` });
        }
    });

    router.get('/sessions/:sessionId/qr', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });

        const { sessionId } = req.params;
        const session = sessions.get(sessionId);

        log(`QR code regeneration requested for ${sessionId}`, sessionId);

        try {
            if (phonePairing) {
                await phonePairing.deletePairing(sessionId);
            }

            const sessionOwner = session ? session.owner : null;

            if (sessions.has(sessionId)) {
                await deleteSession(sessionId);
            }

            await createSession(sessionId, sessionOwner);

            log(`QR code regeneration initiated for ${sessionId}`, sessionId);
            res.status(200).json({
                status: 'success',
                message: 'QR code regeneration initiated. Please wait for the QR code to appear.'
            });
        } catch (error) {
            log(`Error regenerating QR for ${sessionId}: ${error.message}`, sessionId, { error });
            res.status(500).json({
                status: 'error',
                message: 'Failed to regenerate QR code. Please try again.'
            });
        }
    });

    // router.use(validateToken); // REMOVED GLOBAL MIDDLEWARE

    router.post('/sessions/:sessionId/generate-token', validateToken, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { sessionId } = req.params;

        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;

        try {
            if (currentUser && currentUser.role !== 'admin') {
                const session = sessions.get(sessionId);
                if (session && session.owner && session.owner !== currentUser.email) {
                    return res.status(403).json({ status: 'error', message: 'Access denied' });
                }
            }

            const newToken = await regenerateSessionToken(sessionId);
            res.status(200).json({ status: 'success', message: 'Token regenerated successfully.', token: newToken });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            res.status(500).json({ status: 'error', message: `Failed to regenerate token: ${error.message}` });
        }
    });

    router.get('/sessions/:sessionId/token', requireSuperAdminSession, async (req, res) => {
        const sessionId = (req.params.sessionId || '').toString().trim();
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId is required' });
        }
        const token = sessionTokens.get(sessionId) || null;
        const session = sessions.get(sessionId);
        return res.status(200).json({
            status: 'success',
            sessionId,
            token,
            connected: session?.status || 'UNKNOWN'
        });
    });

    router.post('/sessions/:sessionId/token', requireSuperAdminSession, async (req, res) => {
        const sessionId = (req.params.sessionId || '').toString().trim();
        const regenerate = req.body?.regenerate === true;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId is required' });
        }

        const existing = sessionTokens.get(sessionId);
        if (existing && !regenerate) {
            return res.status(200).json({
                status: 'success',
                sessionId,
                token: existing,
                regenerated: false
            });
        }

        try {
            const token = await regenerateSessionToken(sessionId);
            return res.status(200).json({
                status: 'success',
                sessionId,
                token,
                regenerated: true
            });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            return res.status(500).json({ status: 'error', message: `Failed to generate token: ${error.message}` });
        }
    });

    router.post('/sessions/:sessionId/settings', validateToken, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { sessionId } = req.params;
        const settings = req.body;

        if (!sessionId || !settings || typeof settings !== 'object') {
            return res.status(400).json({ status: 'error', message: 'sessionId and settings are required' });
        }

        try {
            await saveSessionSettings(sessionId, settings);
            res.status(200).json({ status: 'success', message: 'Settings updated' });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    router.post('/sessions/webhook', validateToken, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { url, sessionId } = req.body;
        if (!url || !sessionId) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'URL and sessionId are required.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'URL and sessionId are required.' });
        }
        await setWebhookUrl(sessionId, url);
        log('Webhook URL updated', url, { event: 'webhook-updated', sessionId, url });
        res.status(200).json({ status: 'success', message: `Webhook URL for session ${sessionId} updated to ${url}` });
    });

    router.get('/sessions/webhook', validateToken, async (req, res) => {
        const { sessionId } = req.query;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId is required.' });
        }
        const url = await getWebhookUrl(sessionId);
        res.status(200).json({ status: 'success', sessionId, url: url || null });
    });

    router.delete('/sessions/webhook', validateToken, async (req, res) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId is required.' });
        }
        await deleteWebhookUrl(sessionId);
        log('Webhook URL deleted', '', { event: 'webhook-deleted', sessionId });
        res.status(200).json({ status: 'success', message: `Webhook for session ${sessionId} deleted.` });
    });

    return router;
}

module.exports = { buildSessionsRouter };
