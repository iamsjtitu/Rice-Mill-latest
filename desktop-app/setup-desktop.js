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

// Check if build exists AND matches current version
const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, 'package.json'), 'utf8'));
const currentVersion = desktopPkg.version;
const versionFile = path.join(BUILD_DIR, '.build-version');

if (fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
  // Check if build version matches
  let buildVersion = null;
  if (fs.existsSync(versionFile)) {
    buildVersion = fs.readFileSync(versionFile, 'utf8').trim();
  }
  
  if (buildVersion === currentVersion) {
    console.log(`[OK] frontend-build/ already exists (v${currentVersion}). Skipping build.`);
    console.log('    (Delete frontend-build/ folder to force rebuild)');
    process.exit(0);
  } else {
    console.log(`[REBUILD] Version mismatch: build=${buildVersion || 'unknown'}, current=v${currentVersion}`);
    console.log('    Deleting old build and rebuilding...');
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
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

console.log('\nBuilding frontend (REACT_APP_BACKEND_URL= empty for relative URLs)...');
execSync('npm run build', {
  cwd: FRONTEND_DIR, stdio: 'inherit',
  env: { ...process.env, REACT_APP_BACKEND_URL: '' }
});

console.log('\nCopying build to frontend-build/...');
if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true, force: true });
copyDirSync(path.join(FRONTEND_DIR, 'build'), BUILD_DIR);

// Fix title and remove tracking scripts from index.html
const indexPath = path.join(BUILD_DIR, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace('Emergent | Fullstack App', 'Mill Entry System');
html = html.replace('A product of emergent.sh', 'Mill Entry System');
html = html.replace(/<script src="https:\/\/assets\.emergent\.sh\/[^"]*"><\/script>/g, '');
html = html.replace(/<a id="emergent-badge"[^>]*>.*?<\/a>/g, '');
html = html.replace(/<script>!function\(e,t\)\{var r,s,o,i;t\.__SV.*?<\/script>/g, '');
html = html.replace(/<script>window\.addEventListener\("error"[^<]*<\/script>/g, '');
fs.writeFileSync(indexPath, html);

// Write version file for future mismatch detection
fs.writeFileSync(versionFile, currentVersion);

console.log('\n[OK] Frontend build ready! (v' + currentVersion + ')');
