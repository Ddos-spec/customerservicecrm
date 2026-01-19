const express = require('express');

const router = express.Router();

function buildProfileRouter(deps) {
    const { validateToken } = deps;
    // router.use(validateToken); // REMOVED GLOBAL

    const unsupported = (message) => (req, res) => {
        res.status(501).json({ status: 'error', message });
    };

    router.get('/profile', validateToken, unsupported('Profile belum didukung di gateway Go.'));
    router.put('/profile/name', validateToken, unsupported('Update profile name belum didukung di gateway Go.'));
    router.put('/profile/status', validateToken, unsupported('Update profile status belum didukung di gateway Go.'));
    router.put('/profile/picture', validateToken, unsupported('Update profile picture belum didukung di gateway Go.'));
    router.delete('/profile/picture', validateToken, unsupported('Hapus profile picture belum didukung di gateway Go.'));

    return router;
}

module.exports = { buildProfileRouter };