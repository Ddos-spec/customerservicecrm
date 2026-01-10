const express = require('express');

const router = express.Router();

function buildContactsRouter(deps) {
    const { sessions, formatPhoneNumber, validateToken } = deps;
    router.use(validateToken);

    const getSession = (sessionId) => {
        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            const err = new Error(`Session ${sessionId} not found or not connected.`);
            err.statusCode = 404;
            throw err;
        }
        return session;
    };

    router.post('/check-number', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { numbers } = req.body;

        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            return res.status(400).json({ status: 'error', message: 'numbers array is required.' });
        }

        try {
            const session = getSession(sessionId);
            const results = [];

            for (const number of numbers) {
                const jid = number.includes('@') ? number : `${formatPhoneNumber(number)}@s.whatsapp.net`;
                const [result] = await session.sock.onWhatsApp(jid);
                results.push({
                    number,
                    exists: result?.exists || false,
                    jid: result?.jid || null
                });
            }

            res.status(200).json({ status: 'success', results });
        } catch (error) {
            res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
        }
    });

    router.get('/contacts', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;

        try {
            const session = getSession(sessionId);
            const contacts = session.sock.store?.contacts || {};
            res.status(200).json({
                status: 'success',
                contacts,
                note: Object.keys(contacts).length === 0
                    ? 'Kontak belum tersedia di gateway Go.'
                    : undefined
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
        }
    });

    return router;
}

module.exports = { buildContactsRouter };
