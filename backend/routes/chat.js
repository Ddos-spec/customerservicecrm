const express = require('express');

const router = express.Router();

function buildChatRouter(deps) {
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

    router.use(validateToken);

    /**
     * GET /api/v1/chats
     * List all chat rooms for the tenant (Inbox)
     */
    router.get('/chats', async (req, res) => {
        const user = req.session?.user;
        if (!user || !user.tenant_id) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

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
        const sessionId = req.sessionId || req.query.sessionId;
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
