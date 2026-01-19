const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const router = express.Router();
const mediaDir = path.join(__dirname, '..', 'media');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, mediaDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${randomUUID()}${ext}`);
    }
});
const upload = multer({ storage });

function buildMediaRouter(deps) {
    const { log, validateToken } = deps;

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
            mediaId: mediaId,
            url: `/media/${mediaId}`
        });
    });

    router.post('/download-media', validateToken, async (req, res) => {
        return res.status(501).json({
            status: 'error',
            message: 'Download media belum didukung di integrasi gateway Go.'
        });
    });

    return router;
}

module.exports = { buildMediaRouter };
