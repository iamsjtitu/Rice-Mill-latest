/**
 * Desktop App - Setup Script
 * Builds frontend and copies to frontend-build/
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DESKTOP_DIR = __dirname;
const FRONTEND_DIR = path.join(DESKTOP_DIR, '..', 'frontend');
const BUILD_DIR = path.join(DESKTOP_DIR, 'frontend-build');

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(item => {
    const s = path.join(src, item), d = path.join(dest, item);
    if (fs.statSync(s).isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  });
}

console.log('=== Desktop App - Frontend Build ===\n');

if (fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
  console.log('[OK] frontend-build/ already exists. Skipping build.');
  console.log('    (Delete frontend-build/ folder to force rebuild)');
  process.exit(0);
}

if (!fs.existsSync(path.join(FRONTEND_DIR, 'package.json'))) {
  console.error('[ERROR] frontend/ folder not found at: ' + FRONTEND_DIR);
  console.error('');
  console.error('Fix: GitHub se poora code download karein (frontend/ folder included hona chahiye)');
  console.error('Ya manually frontend-build/ folder banayein.');
  process.exit(1);
}

console.log('Installing frontend deps...');
try { execSync('yarn install', { cwd: FRONTEND_DIR, stdio: 'inherit' }); } catch(e) {
  console.log('  yarn not found, using npm...');
  // Install ajv explicitly to fix Node v24 compatibility
  execSync('npm install --legacy-peer-deps', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  try { execSync('npm install ajv@8 --legacy-peer-deps', { cwd: FRONTEND_DIR, stdio: 'inherit' }); } catch(e2) {}
}

console.log('\nBuilding frontend (REACT_APP_BACKEND_URL=http://127.0.0.1:9876)...');
execSync('npm run build', {
  cwd: FRONTEND_DIR, stdio: 'inherit',
  env: { ...process.env, REACT_APP_BACKEND_URL: 'http://127.0.0.1:9876' }
});

console.log('\nCopying build to frontend-build/...');
if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true, force: true });
copyDirSync(path.join(FRONTEND_DIR, 'build'), BUILD_DIR);

// Fix title in index.html
const indexPath = path.join(BUILD_DIR, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace('Emergent | Fullstack App', 'Mill Entry System');
html = html.replace('A product of emergent.sh', 'Mill Entry System');
fs.writeFileSync(indexPath, html);

console.log('\n[OK] Frontend build ready!');
