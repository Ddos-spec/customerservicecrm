const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, '..', 'media');
const TOKENS_FILE = path.join(__dirname, '..', 'session_tokens.enc');

function safeRm(targetPath) {
    if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        return true;
    }
    return false;
}

function cleanup() {
    console.log('Starting cleanup...');

    // 1) Clear media uploads
    if (fs.existsSync(MEDIA_DIR)) {
        const files = fs.readdirSync(MEDIA_DIR);
        for (const file of files) {
            const fullPath = path.join(MEDIA_DIR, file);
            safeRm(fullPath);
        }
        console.log(`   Media cleared (${MEDIA_DIR}).`);
    } else {
        console.log('   Media folder not found, skipping.');
    }

    // 2) Remove stored session tokens (forces re-auth to gateway)
    if (safeRm(TOKENS_FILE)) {
        console.log('   Removed encrypted session tokens file.');
    } else {
        console.log('   No session_tokens.enc found, skipping.');
    }

    console.log('Cleanup complete. Restart the server after this.');
}

cleanup();
