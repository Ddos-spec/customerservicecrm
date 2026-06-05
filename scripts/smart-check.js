const { execSync } = require('child_process');
const path = require('path');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command, cwd) {
    try {
        log(`Running: ${command} in ${cwd}`, colors.blue);
        execSync(command, { stdio: 'inherit', cwd });
        return true;
    } catch (error) {
        log(`❌ Check failed in ${cwd}`, colors.red);
        return false;
    }
}

function quoteCommandArg(value) {
    return `"${value.replace(/"/g, '\\"')}"`;
}

function commandExists(command) {
    try {
        const lookupCommand = process.platform === 'win32'
            ? `where ${command}`
            : `command -v ${command}`;
        const output = execSync(lookupCommand, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        return output ? output.split(/\r?\n/)[0] : null;
    } catch {
        return null;
    }
}

function findGoBinary() {
    const envGo = process.env.GO_BINARY || process.env.GO_EXE;
    const candidates = [
        envGo,
        commandExists('go'),
        ...(process.platform === 'win32'
            ? [
                'C:\\Program Files\\Go\\bin\\go.exe',
                'C:\\Go\\bin\\go.exe',
                path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Go', 'bin', 'go.exe'),
            ]
            : [
                '/usr/local/go/bin/go',
                '/usr/bin/go',
                '/opt/homebrew/bin/go',
            ]),
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            execSync(`${quoteCommandArg(candidate)} version`, { stdio: 'ignore' });
            return candidate;
        } catch {
            // Try next candidate.
        }
    }

    return null;
}

function getStagedFiles() {
    try {
        const output = execSync('git diff --cached --name-only').toString().trim();
        return output ? output.split('\n') : [];
    } catch (error) {
        return [];
    }
}

function main() {
    log('🛡️  Smart Consistency Check...', colors.cyan);
    
    const stagedFiles = getStagedFiles();
    if (stagedFiles.length === 0) {
        log('No files staged. Skipping checks.', colors.yellow);
        process.exit(0);
    }

    const checks = {
        frontend: false,
        backend: false,
        gateway: false
    };

    stagedFiles.forEach(file => {
        if (file.startsWith('frontend/')) checks.frontend = true;
        if (file.startsWith('backend/')) checks.backend = true;
        if (file.startsWith('wa-gateway/')) checks.gateway = true;
    });

    let success = true;

    if (checks.frontend) {
        log('\n📦 Frontend changes detected. verifying...', colors.yellow);
        if (!runCommand('npm run check', path.join(process.cwd(), 'frontend'))) {
            success = false;
        }
    }

    if (checks.backend) {
        log('\n🔙 Backend changes detected. verifying...', colors.yellow);
        // Ensure dependencies are installed if package.json changed
        if (stagedFiles.some(f => f.includes('backend/package.json'))) {
             log('Backend package.json changed, checking deps...', colors.blue);
             // runCommand('npm install', path.join(process.cwd(), 'backend'));
        }
        if (!runCommand('npm run check', path.join(process.cwd(), 'backend'))) {
            success = false;
        }
    }

    if (checks.gateway) {
        log('\n🐹 Go Gateway changes detected. verifying...', colors.yellow);
        const goBinary = findGoBinary();
        if (!goBinary) {
            log('⚠️  Go is not installed or not discoverable. Set GO_BINARY to the full go executable path to enable Gateway checks.', colors.yellow);
        } else {
            log(`Using Go binary: ${goBinary}`, colors.blue);
            if (!runCommand(`${quoteCommandArg(goBinary)} build -v ./...`, path.join(process.cwd(), 'wa-gateway'))) {
                success = false;
            }
        }
    }

    if (!success) {
        log('\n❌ Verification failed. Fix errors before committing.', colors.red);
        process.exit(1);
    }

    log('\n✅ All checks passed! Ready to commit.', colors.green);
}

main();
