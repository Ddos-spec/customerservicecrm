const express = require('express');

const router = express.Router();

function buildPresenceRouter(deps) {
    const { validateToken } = deps;
    router.use(validateToken);

    const unsupported = (message) => (req, res) => {
        res.status(501).json({ status: 'error', message });
    };

    router.post('/presence', unsupported('Presence update belum didukung di gateway Go.'));
    router.post('/read', unsupported('Read receipt belum didukung di gateway Go.'));
    router.get('/presence/:number', unsupported('Presence subscribe belum didukung di gateway Go.'));

    return router;
}

module.exports = { buildPresenceRouter };
