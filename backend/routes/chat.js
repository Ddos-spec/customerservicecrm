const express = require('express');

function buildChatRouter(deps) {
    const router = express.Router();
    const { sessions, formatPhoneNumber, validateToken, db } = deps;

    const getSession = (sessionId) => {
        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            const err = new Error(`Session ${sessionId} not found or not connected.`);
            err.statusCode = 404;
            throw err;
        }
        return session;
    };

    const unsupported = (message) => (req, res) => {
        res.status(501).json({ status: 'error', message });
    };

    // Removed global validateToken to allow session-based access for UI
    // router.use(validateToken);

    /**
     * GET /api/v1/chats
     * List all chat rooms for the tenant (Inbox)
     */
    router.get('/chats', async (req, res) => {
        console.log(`[Chat] GET /chats accessed by user: ${req.session?.user?.email || 'Guest'}`);
        const user = req.session?.user;

        // Check session first
        if (!user) {
            return res.status(401).json({ status: 'error', message: 'Session expired. Please login again.' });
        }

        // Check tenant_id - super_admin doesn't have one
        if (!user.tenant_id) {
            // For super_admin, allow specifying tenant_id via query
            if (user.role === 'super_admin' && req.query.tenant_id) {
                try {
                    const limit = parseInt(req.query.limit) || 50;
                    const offset = parseInt(req.query.offset) || 0;
                    const chats = await db.getChatsByTenant(req.query.tenant_id, limit, offset);
                    return res.json({ status: 'success', data: chats });
                } catch (error) {
                    return res.status(500).json({ status: 'error', message: error.message });
                }
            }
            return res.status(400).json({
                status: 'error',
                message: 'No tenant associated with this account. Please contact admin.'
            });
        }

        try {
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const chats = await db.getChatsByTenant(user.tenant_id, limit, offset);
            res.json({ status: 'success', data: chats });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    /**
     * GET /api/v1/chats/:chatId/messages
     * Fetch message history for a specific chat room
     */
    router.get('/chats/:chatId/messages', async (req, res) => {
        const user = req.session?.user;
        if (!user) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

        try {
            const { chatId } = req.params;
            const limit = parseInt(req.query.limit) || 100;
            const messages = await db.getMessagesByChat(chatId, limit);
            res.json({ status: 'success', data: messages });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    router.get('/business-profile/:number', unsupported('Business profile belum didukung di gateway Go.'));
    router.post('/archive', unsupported('Archive chat belum didukung di gateway Go.'));
    router.post('/mute', unsupported('Mute chat belum didukung di gateway Go.'));
    router.post('/pin', unsupported('Pin chat belum didukung di gateway Go.'));
    router.post('/clear', unsupported('Clear chat belum didukung di gateway Go.'));
    router.post('/block', unsupported('Block contact belum didukung di gateway Go.'));

    router.get('/profile-picture/:jid', async (req, res) => {
        // Fallback to session user's tenant session if available
        const sessionId = req.sessionId || req.query.sessionId || req.session?.user?.tenant_session_id;
        const { jid } = req.params;
        const { type } = req.query;

        try {
            const session = getSession(sessionId);
            const targetJid = jid.includes('@') ? jid : `${formatPhoneNumber(jid)}@s.whatsapp.net`;
            const pictureUrl = await session.sock.profilePictureUrl(targetJid, type || 'image');

            res.status(200).json({
                status: 'success',
                jid: targetJid,
                profilePictureUrl: pictureUrl
            });
        } catch (error) {
            res.status(200).json({
                status: 'success',
                jid,
                profilePictureUrl: null,
                note: 'Profile picture belum didukung atau dibatasi privasi.'
            });
        }
    });

    return router;
}

module.exports = { buildChatRouter };
