const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const {
    buildSignedEphemeralMediaUrl,
    verifySignedEphemeralMediaRequest,
} = require('../utils/ephemeral-media');
const googleDrive = require('../utils/google-drive');

const router = express.Router();
const mediaDir = path.join(__dirname, '..', 'media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, mediaDir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${randomUUID()}${ext}`);
    }
});
const upload = multer({ storage });

function setInlineFilename(res, filename) {
    if (typeof filename !== 'string' || !filename.trim()) return;
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename.trim())}`);
}

function buildMediaRouter(deps) {
    const { log, validateToken, waGateway } = deps;

    router.post('/media', validateToken, upload.single('file'), (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        if (!req.file) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'No file uploaded.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'No file uploaded.' });
        }
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/wav',
            'audio/x-wav', 'audio/webm', 'audio/aac', 'audio/opus',
            'video/mp4', 'video/3gpp', 'video/quicktime', 'video/webm',
            'image/webp'
        ];
        if (!allowedTypes.includes(req.file.mimetype)) {
            fs.unlinkSync(req.file.path);
            log('API error', 'SYSTEM', { event: 'api-error', error: 'Invalid file type.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'Invalid file type. Allowed: Images (JPEG, PNG, GIF, WebP), Audio (MP3, MP4, OGG, WAV, WebM, AAC, Opus), Video (MP4, 3GPP, QuickTime, WebM), Documents (PDF, DOC, DOCX, XLS, XLSX).' });
        }
        if (req.file.size > 25 * 1024 * 1024) {
            fs.unlinkSync(req.file.path);
            log('API error', 'SYSTEM', { event: 'api-error', error: 'File too large.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'File too large. Max 25MB.' });
        }
        const mediaId = req.file.filename;
        log('File uploaded', mediaId, { event: 'file-uploaded', mediaId });
        res.status(201).json({
            status: 'success',
            message: 'File uploaded successfully.',
            mediaId,
            url: `/media/${mediaId}`
        });
    });

    router.post('/download-media', validateToken, async (req, res) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const mediaToken = typeof body.token === 'string'
            ? body.token.trim()
            : (typeof body.mediaToken === 'string' ? body.mediaToken.trim() : '');
        const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim()
            ? body.sessionId.trim()
            : (typeof req.sessionId === 'string' ? req.sessionId.trim() : '');

        if (!mediaToken || !sessionId) {
            return res.status(400).json({
                status: 'error',
                message: 'sessionId dan media token wajib diisi.'
            });
        }

        const url = buildSignedEphemeralMediaUrl(req, {
            sessionId,
            token: mediaToken,
            expiresAt: body.expiresAt || body.ephemeralMediaExpiresAt || null,
        });

        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'Gagal membuat URL media sementara.'
            });
        }

        return res.json({
            status: 'success',
            sessionId,
            mediaToken,
            url,
        });
    });

    router.get('/media/ephemeral/:token', async (req, res) => {
        const verification = verifySignedEphemeralMediaRequest({
            sessionId: req.query.sessionId,
            token: req.params.token,
            exp: req.query.exp,
            sig: req.query.sig,
        });

        if (!verification.ok) {
            return res.status(verification.statusCode).json({
                status: 'error',
                message: verification.message,
            });
        }

        try {
            const result = await waGateway.fetchEphemeralMedia(verification.sessionId, verification.token);
            res.setHeader('Content-Type', result.contentType || 'application/octet-stream');
            res.setHeader('Cache-Control', 'private, no-store, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            if (result.contentLength) {
                res.setHeader('Content-Length', String(result.contentLength));
            }
            setInlineFilename(res, result.filename);
            return res.status(200).send(result.data);
        } catch (error) {
            const message = error?.message || 'Gagal mengambil media sementara.';
            const lowered = message.toLowerCase();
            const statusCode = lowered.includes('not found') || lowered.includes('expired')
                ? 404
                : 502;

            return res.status(statusCode).json({
                status: 'error',
                message,
            });
        }
    });

    // Permanent, signed access to inbound customer media persisted in Google
    // Drive (the /media/ephemeral/:token route above only works for the
    // lifetime of the gateway session/token that produced it).
    router.get('/media/drive/:fileId', async (req, res) => {
        const verification = googleDrive.verifySignedDriveMediaRequest({
            fileId: req.params.fileId,
            exp: req.query.exp,
            sig: req.query.sig,
        });

        if (!verification.ok) {
            return res.status(verification.statusCode).json({
                status: 'error',
                message: verification.message,
            });
        }

        try {
            const asset = await googleDrive.downloadMediaFromDrive(verification.fileId);
            res.setHeader('Content-Type', asset.mimeType);
            res.setHeader('Cache-Control', 'private, max-age=300');
            setInlineFilename(res, asset.filename);
            return res.status(200).send(asset.buffer);
        } catch (error) {
            return res.status(404).json({
                status: 'error',
                message: error?.message || 'Media tidak ditemukan',
            });
        }
    });

    return router;
}

module.exports = { buildMediaRouter };
