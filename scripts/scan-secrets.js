const fs = require('fs');
const { execSync } = require('child_process');

// ANSI Colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

console.log(`${YELLOW}🔒 Security Check: Scanning staged files for secrets...${RESET}`);

// 1. Get list of staged files
try {
    const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' })
        .split('\n')
        .filter(file => file.trim() !== '' && fs.existsSync(file));

    if (stagedFiles.length === 0) {
        console.log(`${GREEN}✅ No files staged. Skipping check.${RESET}`);
        process.exit(0);
    }

    // 2. Define Patterns to Block
    // Format: [Regex, "Error Message"]
    const dangerPatterns = [
        [/AWS_ACCESS_KEY_ID\s*=\s*['"][A-Z0-9]{20}['"]/, 'Possible AWS Access Key'],
        [/sk_live_[0-9a-zA-Z]{24}/, 'Possible Stripe Secret Key'],
        [/xox[baprs]-([0-9a-zA-Z]{10,48})/, 'Possible Slack Token'],
        [/-----BEGIN PRIVATE KEY-----/, 'RSA Private Key'],
        [/-----BEGIN OPENSSH PRIVATE KEY-----/, 'SSH Private Key'],
        [/password\s*=\s*['"](?!$|null|undefined)[^'"]{3,}['"]/, 'Hardcoded password assignment'],
        [/secret\s*=\s*['"](?!$|null|undefined)[^'"]{3,}['"]/, 'Hardcoded secret assignment'],
        [/const\s+[A-Z_]+_KEY\s*=\s*['"][^'"]{10,}['"]/, 'Possible hardcoded API Key constant'],
        // Refined: Only flag defaults if variable name implies security sensitivity
        [/process\.env\.[A-Z_]*(SECRET|KEY|PASSWORD|TOKEN|AUTH|CRED|PASS)[A-Z_]*\s*\|\|\s*['"][^'"]{3,}['"]/, 'Insecure default secret (remove fallback)'],
    ];

    let hasErrors = false;

    // 3. Scan Each File
    stagedFiles.forEach(file => {
        // Skip lock files and images
        if (file.match(/\.(json|lock|png|jpg|svg|ico)$/)) return;
        
        // Skip the scanner script itself
        if (file.includes('scan-secrets.js')) return;

        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            dangerPatterns.forEach(([regex, msg]) => {
                if (regex.test(line)) {
                    console.error(`${RED}❌ SECURITY ALERT in ${file}:${index + 1}${RESET}`);
                    console.error(`   ${msg}`);
                    console.error(`   Line: ${line.trim().substring(0, 100)}...`);
                    hasErrors = true;
                }
            });
        });
    });

    if (hasErrors) {
        console.error(`\n${RED}⛔ COMMIT REJECTED${RESET}`);
        console.error('Please remove hardcoded secrets or insecure fallbacks before committing.');
        console.error('If this is a false positive, use "--no-verify" (NOT RECOMMENDED).');
        process.exit(1);
    } else {
        console.log(`${GREEN}✅ Security Check Passed. No obvious secrets found.${RESET}`);
        process.exit(0);
    }

} catch (error) {
    console.error('Security check failed to run:', error);
    // Fail safe: block commit if check fails
    process.exit(1);
}
