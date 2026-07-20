const googleDrive = require('./google-drive');
const { getPublicBaseUrl } = require('./ephemeral-media');

function createDriveConfigurationError() {
    const error = new Error('Google Drive belum dikonfigurasi. Media tidak dapat dikirim sebelum penyimpanan permanen aktif.');
    error.code = 'DRIVE_NOT_CONFIGURED';
    error.statusCode = 503;
    return error;
}

function assertDriveConfigured() {
    if (!googleDrive.isConfigured()) throw createDriveConfigurationError();
}

function buildPersistedMediaUrl(req, fileId) {
    return googleDrive.buildSignedDriveMediaUrl(getPublicBaseUrl(req), fileId);
}

async function persistMediaBuffer(req, buffer, mimeType, filename) {
    assertDriveConfigured();
    const fileId = await googleDrive.uploadMediaToDrive(buffer, mimeType, filename);
    return { fileId, url: buildPersistedMediaUrl(req, fileId) };
}

async function persistMediaSource(req, sourceUrl, filename, mimeType) {
    assertDriveConfigured();

    const existingFileId = googleDrive.getDriveFileIdFromUrl(sourceUrl);
    if (existingFileId) {
        return { fileId: existingFileId, url: buildPersistedMediaUrl(req, existingFileId) };
    }

    const copied = await googleDrive.copyMediaToDrive(sourceUrl, filename, mimeType);
    return { fileId: copied.fileId, url: buildPersistedMediaUrl(req, copied.fileId) };
}

function refreshPersistedMediaUrl(req, mediaUrl) {
    const fileId = googleDrive.getDriveFileIdFromUrl(mediaUrl);
    return fileId ? buildPersistedMediaUrl(req, fileId) : mediaUrl;
}

function refreshPersistedMediaUrls(req, messages) {
    if (!Array.isArray(messages)) return [];
    return messages.map((message) => ({
        ...message,
        media_url: refreshPersistedMediaUrl(req, message?.media_url),
    }));
}

module.exports = {
    assertDriveConfigured,
    buildPersistedMediaUrl,
    persistMediaBuffer,
    persistMediaSource,
    refreshPersistedMediaUrl,
    refreshPersistedMediaUrls,
};
