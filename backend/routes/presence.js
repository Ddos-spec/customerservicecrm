const express = require('express');

const router = express.Router();

function buildPresenceRouter(deps) {
    const { validateToken } = deps;
    // router.use(validateToken); // REMOVED

    const unsupported = (message) => (req, res) => {
        res.status(501).json({ status: 'error', message });
    };

    router.post('/presence', validateToken, unsupported('Presence update belum didukung di gateway Go.'));
    router.post('/read', validateToken, unsupported('Read receipt belum didukung di gateway Go.'));
    router.get('/presence/:number', validateToken, unsupported('Presence subscribe belum didukung di gateway Go.'));

    return router;
}

module.exports = { buildPresenceRouter };