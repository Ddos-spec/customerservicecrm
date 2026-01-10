function buildTokenValidator(sessionTokens) {
    return (req, res, next) => {
        let token = req.headers['apikey'] || req.headers['authorization'];
        if (token && token.startsWith('Bearer ')) {
            token = token.slice(7).trim();
        }

        if (!token) {
            return res.status(401).json({ status: 'error', message: 'No token provided' });
        }

        let sessionId = req.query.sessionId || req.body.sessionId || req.params.sessionId;
        if (!sessionId) {
            for (const [id, t] of sessionTokens.entries()) {
                if (t === token) {
                    sessionId = id;
                    req.sessionId = id;
                    break;
                }
            }
        }

        if (sessionId) {
            const expectedToken = sessionTokens.get(sessionId);
            if (expectedToken && token === expectedToken) {
                req.sessionId = sessionId;
                return next();
            }
            return res.status(403).json({ status: 'error', message: `Invalid token for session ${sessionId}` });
        }

        const isAnyTokenValid = Array.from(sessionTokens.values()).includes(token);
        if (isAnyTokenValid) {
            return next();
        }

        return res.status(403).json({ status: 'error', message: 'Invalid token' });
    };
}

module.exports = { buildTokenValidator };
