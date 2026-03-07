/**
 * Mill Entry System - Setup Script
 * Frontend build karke public/ folder mein copy karta hai
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const LOCAL_DIR = __dirname;
const FRONTEND_DIR = path.join(LOCAL_DIR, '..', 'frontend');
const PUBLIC_DIR = path.join(LOCAL_DIR, 'public');

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const items = fs.readdirSync(src);
  items.forEach(item => {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

console.log('========================================');
console.log('  Mill Entry System - Setup');
console.log('========================================\n');

// Step 1: Install local-server dependencies
console.log('[1/3] Local server dependencies install ho rahe hain...');
try {
  execSync('npm install', { cwd: LOCAL_DIR, stdio: 'inherit' });
} catch (e) {
  console.error('[ERROR] npm install fail hua!');
  process.exit(1);
}

// Step 2: Check if public/ already exists
if (fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
  console.log('\n[OK] Frontend build already hai (public/ folder mein)');
  console.log('\n========================================');
  console.log('  Setup Complete! Ab "start.bat" chalayein');
  console.log('========================================\n');
  process.exit(0);
}

// Step 3: Build frontend
console.log('\n[2/3] Frontend build ho raha hai...');

if (!fs.existsSync(path.join(FRONTEND_DIR, 'package.json'))) {
  console.error('[ERROR] Frontend folder nahi mila: ' + FRONTEND_DIR);
  console.error('');
  console.error('Kya karein:');
  console.error('  1. GitHub se poora code download karein (sirf local-server nahi)');
  console.error('  2. Folder structure aisi honi chahiye:');
  console.error('     your-folder/');
  console.error('       frontend/    <-- ye hona chahiye');
  console.error('       local-server/');
  console.error('       backend/');
  process.exit(1);
}

try {
  console.log('  Installing frontend dependencies...');
  // Try yarn first, fallback to npm --legacy-peer-deps
  try {
    execSync('yarn install', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  } catch (e) {
    console.log('  yarn not found, using npm...');
    execSync('npm install --legacy-peer-deps', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  }
  
  console.log('  Building frontend (1-2 min lagega)...');
  execSync('npm run build', {
    cwd: FRONTEND_DIR,
    stdio: 'inherit',
    env: { ...process.env, REACT_APP_BACKEND_URL: 'http://localhost:8080' }
  });
} catch (e) {
  console.error('[ERROR] Frontend build fail hua!');
  console.error(e.message);
  process.exit(1);
}

// Step 4: Copy build to public/
console.log('\n[3/3] Frontend build copy ho raha hai...');
const buildDir = path.join(FRONTEND_DIR, 'build');

if (!fs.existsSync(buildDir)) {
  console.error('[ERROR] Build folder nahi bana: ' + buildDir);
  process.exit(1);
}

try {
  if (fs.existsSync(PUBLIC_DIR)) {
    fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
  }
  copyDirSync(buildDir, PUBLIC_DIR);
  const fileCount = fs.readdirSync(PUBLIC_DIR).length;
  console.log(`  ${fileCount} files copy ho gaye public/ mein`);
} catch (e) {
  console.error('[ERROR] Copy fail hua: ' + e.message);
  process.exit(1);
}

console.log('\n========================================');
console.log('  Setup Complete!');
console.log('  Ab "start.bat" double-click karein');
console.log('========================================\n');
