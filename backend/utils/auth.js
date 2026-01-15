function buildTokenValidator(sessionTokens) {
    return (req, res, next) => {
        let token = req.headers['apikey'] || req.headers['authorization'];
        if (token && token.startsWith('Bearer ')) {
            token = token.slice(7).trim();
        }

        if (!token) {
            console.warn(`[Auth] 401 No API Token provided for: ${req.method} ${req.originalUrl}`);
            return res.status(401).json({ status: 'error', message: 'No API Token provided' });
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

        return res.status(403).json({ status: 'error', message: 'Invalid token or session not found' });
    };
}

module.exports = { buildTokenValidator };
