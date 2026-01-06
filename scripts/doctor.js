const { execSync } = require('child_process');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const MODE = process.argv[2]; // 'check' or 'fix'

function runCommand(name, command, cwd = '.') {
    console.log(`${CYAN}🔍 [${name}] Running...${RESET}`);
    try {
        execSync(command, { cwd, stdio: 'inherit' });
        console.log(`${GREEN}✅ [${name}] Passed!${RESET}\n`);
        return true;
    } catch (error) {
        console.log(`${RED}❌ [${name}] Failed!${RESET}\n`);
        return false;
    }
}

console.log(`${YELLOW}🚑 SYSTEM DOCTOR STARTING... (${MODE === 'fix' ? 'AUTO-FIX MODE' : 'SCAN MODE'})${RESET}\n`);

let allPassed = true;

// 1. FRONTEND CHECKS
if (MODE === 'fix') {
    allPassed = runCommand('Frontend Linter (Fix)', 'npm run lint -- --fix', 'frontend') && allPassed;
} else {
    // Check Types (TypeScript) - Only check, TS cannot auto-fix logic
    allPassed = runCommand('Frontend Type Check', 'npx tsc --noEmit', 'frontend') && allPassed;
    // Check Code Style
    allPassed = runCommand('Frontend Linter', 'npm run lint', 'frontend') && allPassed;
}

// 2. BACKEND CHECKS
if (MODE === 'fix') {
    allPassed = runCommand('Backend Linter (Fix)', 'npx eslint . --fix', 'backend') && allPassed;
} else {
    allPassed = runCommand('Backend Linter', 'npx eslint .', 'backend') && allPassed;
}

if (allPassed) {
    console.log(`${GREEN}🎉 SYSTEM HEALTHY! No critical errors found.${RESET}`);
} else {
    console.log(`${RED}🔥 SYSTEM ISSUES DETECTED.${RESET}`);
    if (MODE !== 'fix') {
        console.log(`${YELLOW}👉 Tip: Run "npm run doctor:fix" to automatically fix formatting and simple errors.${RESET}`);
    } else {
        console.log(`${YELLOW}👉 Note: Some errors (like TypeScript logic errors) require manual fixing.${RESET}`);
    }
    process.exit(1);
}
