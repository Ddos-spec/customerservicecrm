const express = require('express');

const router = express.Router();

function buildGroupsRouter(deps) {
    const { sessions, validateToken } = deps;

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

    router.get('/groups', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId;

        try {
            const session = getSession(sessionId);
            const groups = await session.sock.groupFetchAllParticipating();
            const groupList = Object.values(groups).map(g => ({
                id: g.id,
                subject: g.subject,
                owner: g.owner,
                creation: g.creation,
                desc: g.desc,
                descId: g.descId,
                restrict: g.restrict,
                announce: g.announce,
                size: g.size,
                participants: g.participants?.length || 0
            }));

            res.status(200).json({
                status: 'success',
                count: groupList.length,
                groups: groupList
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
        }
    });

    router.post('/groups/accept-invite', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { inviteCode } = req.body;

        if (!inviteCode) {
            return res.status(400).json({ status: 'error', message: 'inviteCode is required.' });
        }

        try {
            const session = getSession(sessionId);
            if (typeof session.sock.groupAcceptInvite !== 'function') {
                return res.status(501).json({
                    status: 'error',
                    message: 'Join group via invite belum didukung di gateway Go.'
                });
            }

            const code = inviteCode.includes('chat.whatsapp.com/')
                ? inviteCode.split('chat.whatsapp.com/')[1]
                : inviteCode;
            const link = inviteCode.includes('chat.whatsapp.com/')
                ? inviteCode
                : `https://chat.whatsapp.com/${code}`;

            const groupId = await session.sock.groupAcceptInvite(link);
            res.status(200).json({
                status: 'success',
                message: 'Joined group via invite',
                groupId
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
        }
    });

    router.post('/groups/:groupId/leave', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { groupId } = req.params;

        try {
            const session = getSession(sessionId);
            const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
            await session.sock.groupLeave(groupJid);
            res.status(200).json({ status: 'success', message: 'Left the group' });
        } catch (error) {
            res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
        }
    });

    const groupNotSupported = unsupported('Fitur grup ini belum didukung di gateway Go.');
    router.put('/groups/:groupId/picture', groupNotSupported);
    router.post('/groups/:groupId/participants', groupNotSupported);
    router.delete('/groups/:groupId/participants', groupNotSupported);
    router.post('/groups/:groupId/admins', groupNotSupported);
    router.delete('/groups/:groupId/admins', groupNotSupported);
    router.put('/groups/:groupId/settings', groupNotSupported);
    router.get('/groups/:groupId/invite-code', groupNotSupported);
    router.post('/groups/:groupId/revoke-invite', groupNotSupported);

    return router;
}

module.exports = { buildGroupsRouter };
