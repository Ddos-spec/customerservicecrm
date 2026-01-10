const express = require('express');

const router = express.Router();

function buildSearchRouter(deps) {
    const { validateToken } = deps;
    router.use(validateToken);

    router.post('/search', (req, res) => {
        res.status(501).json({
            status: 'error',
            message: 'Search pesan belum didukung di gateway Go.'
        });
    });

    return router;
}

module.exports = { buildSearchRouter };
