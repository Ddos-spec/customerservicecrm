const express = require('express');

const router = express.Router();

function buildChatRouter(deps) {
    const { sessions, formatPhoneNumber, validateToken } = deps;

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
