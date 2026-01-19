const express = require('express');

const router = express.Router();

function buildChannelsRouter(deps) {
    const { validateToken } = deps;
    // router.use(validateToken); // REMOVED

    const unsupported = (message) => (req, res) => {
        res.status(501).json({ status: 'error', message });
    };

    router.get('/channels', validateToken, unsupported('Channels belum didukung di gateway Go.'));
    router.post('/channels/:channelId/messages', validateToken, unsupported('Kirim pesan ke channel belum didukung di gateway Go.'));

    return router;
}

module.exports = { buildChannelsRouter };