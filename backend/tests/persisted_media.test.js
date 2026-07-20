const googleDrive = require('../utils/google-drive');
const {
    refreshPersistedMediaUrl,
    refreshPersistedMediaUrls,
} = require('../utils/persisted-media');

describe('persisted Drive media URLs', () => {
    const req = {
        headers: { 'x-forwarded-proto': 'https' },
        protocol: 'http',
        get(header) {
            if (header === 'host') return 'crm.example.com';
            return null;
        },
    };
    const fileId = '1AbCdEfGhIjKlMnOpQrStUvWxYz-1234';

    beforeAll(() => {
        process.env.EPHEMERAL_MEDIA_SIGNING_SECRET = 'drive-media-unit-test-secret';
    });

    afterAll(() => {
        delete process.env.EPHEMERAL_MEDIA_SIGNING_SECRET;
    });

    it('extracts Drive IDs only from the CRM signed media route', () => {
        expect(googleDrive.getDriveFileIdFromUrl(`https://crm.example.com/api/v1/media/drive/${fileId}?exp=1&sig=x`)).toBe(fileId);
        expect(googleDrive.getDriveFileIdFromUrl('https://example.com/video.mp4')).toBeNull();
    });

    it('refreshes an expired stored signed URL when chat history is read', () => {
        const expiredUrl = `https://old-host.example/api/v1/media/drive/${fileId}?exp=1&sig=expired`;
        const refreshedUrl = refreshPersistedMediaUrl(req, expiredUrl);
        const parsed = new URL(refreshedUrl);
        const verified = googleDrive.verifySignedDriveMediaRequest({
            fileId: decodeURIComponent(parsed.pathname.split('/').pop()),
            exp: parsed.searchParams.get('exp'),
            sig: parsed.searchParams.get('sig'),
        });

        expect(parsed.origin).toBe('https://crm.example.com');
        expect(verified.ok).toBe(true);
        expect(verified.fileId).toBe(fileId);
    });

    it('only rewrites persisted Drive entries in a message list', () => {
        const messages = refreshPersistedMediaUrls(req, [
            { id: 'persisted', media_url: `https://old-host.example/api/v1/media/drive/${fileId}?exp=1&sig=expired` },
            { id: 'external', media_url: 'https://cdn.example.com/asset.mp4' },
        ]);

        expect(messages[0].media_url).toContain('/api/v1/media/drive/');
        expect(messages[1].media_url).toBe('https://cdn.example.com/asset.mp4');
    });

    it('rejects private network URLs before attempting a remote media copy', async () => {
        await expect(googleDrive.fetchRemoteMedia('http://127.0.0.1/private-video.mp4'))
            .rejects
            .toThrow('host publik');
    });
});
