const {
    buildSignedEphemeralMediaUrl,
    verifySignedEphemeralMediaRequest,
} = require('../utils/ephemeral-media');

describe('ephemeral media url signing', () => {
    const req = {
        headers: { 'x-forwarded-proto': 'https' },
        protocol: 'http',
        get(header) {
            if (header === 'host') return 'crm.example.com';
            return null;
        },
    };

    beforeAll(() => {
        process.env.EPHEMERAL_MEDIA_SIGNING_SECRET = 'unit-test-secret';
    });

    afterAll(() => {
        delete process.env.EPHEMERAL_MEDIA_SIGNING_SECRET;
    });

    it('builds a signed public url that verifies successfully', () => {
        const expiresAt = Math.floor(Date.now() / 1000) + 600;
        const url = buildSignedEphemeralMediaUrl(req, {
            sessionId: '6281234567890',
            token: 'abc123token',
            expiresAt,
        });

        const parsed = new URL(url);
        const result = verifySignedEphemeralMediaRequest({
            sessionId: parsed.searchParams.get('sessionId'),
            token: decodeURIComponent(parsed.pathname.split('/').pop()),
            exp: parsed.searchParams.get('exp'),
            sig: parsed.searchParams.get('sig'),
        });

        expect(parsed.origin).toBe('https://crm.example.com');
        expect(result.ok).toBe(true);
        expect(result.sessionId).toBe('6281234567890');
        expect(result.token).toBe('abc123token');
    });

    it('rejects expired signed urls', () => {
        const result = verifySignedEphemeralMediaRequest({
            sessionId: '6281234567890',
            token: 'abc123token',
            exp: Math.floor(Date.now() / 1000) - 10,
            sig: 'deadbeef',
        });

        expect(result.ok).toBe(false);
        expect(result.statusCode).toBe(410);
    });
});
