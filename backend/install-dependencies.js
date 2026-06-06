#!/usr/bin/env node

/**
 * Smart dependency installer for WhatsApp API Server
 * Uses bcryptjs only for portable, reproducible deployments.
 */

const { execSync } = require('child_process');
const os = require('os');

console.log('🚀 WhatsApp API Server - Smart Dependency Installer');
console.log('===================================================');
console.log(`Platform: ${os.platform()}`);
console.log(`Node version: ${process.version}`);
console.log('');

// First, install all regular dependencies
console.log('📦 Installing core dependencies...');
try {
    execSync('npm install --production', { stdio: 'inherit' });
    console.log('✅ Core dependencies installed successfully');
} catch (error) {
    console.error('❌ Failed to install core dependencies');
    process.exit(1);
}

console.log('\n✨ Installation complete!');
console.log('\nYour application uses bcryptjs for stable installs across Docker, Easypanel, and cPanel.');
