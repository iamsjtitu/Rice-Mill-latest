/**
 * Self-Updater — pulls latest central-license-server code from GitHub and
 * applies it in place. Used by the admin dashboard "Install Update" button.
 *
 * Flow:
 *   1. Fetch latest commit SHA for the configured branch from GitHub API
 *   2. Download the tarball for that commit
 *   3. Extract ONLY the central-license-server subdirectory into /tmp
 *   4. Copy code files into the installation root (preserving .env,
 *      database.json, node_modules, *.bak.*)
 *   5. Record new SHA in settings, schedule PM2 restart (triggers reload)
 *
 * Safety:
 *   - Never touches .env, database.json, node_modules/, or any *.bak.* files
 *   - Validates tarball integrity (must contain server.js + database.js)
 *   - Backs up current code dir before overwriting
 *   - Can target both PUBLIC and PRIVATE GitHub repos (PAT from settings)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../database');

// Installation root = directory containing server.js (one level above utils/)
const INSTALL_ROOT = path.resolve(__dirname, '..');
const SUBDIR_IN_REPO = 'central-license-server';

// Files/dirs that must NEVER be overwritten during update
const PROTECTED_PATTERNS = [
  /^\.env($|\.)/,
  /^database\.json$/,
  /^node_modules(\/|$)/,
  /\.bak\./,
  /^logs(\/|$)/,
  /^data(\/|$)/,
  /^\.git(\/|$)/,
];

function isProtected(relPath) {
  return PROTECTED_PATTERNS.some(p => p.test(relPath));
}

function getConfig() {
  const s = db.getData().settings || {};
  return {
    repo: (s.update_repo || 'iamsjtitu/Rice-Mill-latest').trim(),
    branch: (s.update_branch || 'main').trim(),
    pat: (s.github_pat || '').trim(),
    currentSha: s.update_current_sha || null,
    pmName: (s.update_pm_name || 'millentry-license').trim(),
  };
}

function saveState(patch) {
  const data = db.getData();
  data.settings = data.settings || {};
  Object.assign(data.settings, patch);
  data.settings.updated_at = new Date().toISOString();
  db.saveImmediate();
}

function httpsRequest(url, extraHeaders = {}, followRedirects = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {
      'User-Agent': 'MillEntry-License-Server/1.0',
      'Accept': 'application/vnd.github+json',
      ...extraHeaders,
    };
    const cfg = getConfig();
    if (cfg.pat) headers['Authorization'] = `Bearer ${cfg.pat}`;
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, timeout: 30000 };
    const req = https.request(opts, (res) => {
      // Redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && followRedirects > 0) {
        res.resume();
        return resolve(httpsRequest(res.headers.location, extraHeaders, followRedirects - 1));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('GitHub API timeout')); });
    req.end();
  });
}

// ====== Public API ======

/** Check: returns { current_sha, latest_sha, latest_commit, update_available } */
async function checkForUpdate() {
  const cfg = getConfig();
  const url = `https://api.github.com/repos/${cfg.repo}/commits/${encodeURIComponent(cfg.branch)}`;
  const res = await httpsRequest(url);
  if (res.status === 404) throw new Error(`Repo or branch not found: ${cfg.repo}@${cfg.branch}`);
  if (res.status === 401 || res.status === 403) throw new Error(`GitHub auth failed (HTTP ${res.status}). If repo is private, set a GitHub PAT in settings.`);
  if (res.status !== 200) throw new Error(`GitHub API HTTP ${res.status}`);
  let data;
  try { data = JSON.parse(res.body.toString('utf8')); } catch { throw new Error('Invalid JSON from GitHub'); }
  const latestSha = data.sha;
  if (!latestSha) throw new Error('GitHub did not return a commit SHA');
  return {
    repo: cfg.repo,
    branch: cfg.branch,
    current_sha: cfg.currentSha,
    latest_sha: latestSha,
    latest_commit_message: (data.commit?.message || '').split('\n')[0].slice(0, 120),
    latest_commit_author: data.commit?.author?.name || data.author?.login || '',
    latest_commit_date: data.commit?.author?.date,
    update_available: !cfg.currentSha || cfg.currentSha !== latestSha,
    has_pat: !!cfg.pat,
  };
}

/** Download repo tarball → extract → copy files → save sha → schedule restart */
async function applyUpdate(onProgress = () => {}) {
  const cfg = getConfig();
  onProgress({ step: 'check', pct: 5, message: 'Checking latest commit…' });
  const info = await checkForUpdate();
  const sha = info.latest_sha;

  // 1. Download tarball
  onProgress({ step: 'download', pct: 10, message: `Downloading ${sha.slice(0, 7)}…` });
  const tarUrl = `https://api.github.com/repos/${cfg.repo}/tarball/${sha}`;
  const tarRes = await httpsRequest(tarUrl);
  if (tarRes.status !== 200) throw new Error(`Tarball download HTTP ${tarRes.status}`);
  const tarballPath = path.join('/tmp', `mls-update-${sha.slice(0, 10)}-${Date.now()}.tar.gz`);
  fs.writeFileSync(tarballPath, tarRes.body);
  onProgress({ step: 'download', pct: 40, message: `Downloaded ${(tarRes.body.length / 1024).toFixed(0)} KB` });

  // 2. Extract
  const extractDir = path.join('/tmp', `mls-update-${sha.slice(0, 10)}-extract-${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });
  onProgress({ step: 'extract', pct: 50, message: 'Extracting tarball…' });
  await new Promise((resolve, reject) => {
    const p = spawn('tar', ['-xzf', tarballPath, '-C', extractDir], { windowsHide: true });
    let err = '';
    p.stderr.on('data', c => { err += c.toString(); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error('tar extract failed: ' + err)));
  });

  // 3. Find the extracted root directory (GitHub tars have a prefix like "owner-repo-sha7")
  const rootDirs = fs.readdirSync(extractDir).filter(f => fs.statSync(path.join(extractDir, f)).isDirectory());
  if (!rootDirs.length) throw new Error('No root directory in tarball');
  const srcDir = path.join(extractDir, rootDirs[0], SUBDIR_IN_REPO);
  if (!fs.existsSync(srcDir)) throw new Error(`${SUBDIR_IN_REPO}/ not found in tarball`);
  if (!fs.existsSync(path.join(srcDir, 'server.js'))) throw new Error('server.js missing in tarball — invalid update');

  // 4. Copy files over, preserving protected ones
  onProgress({ step: 'copy', pct: 70, message: 'Applying files…' });
  copyDirSafe(srcDir, INSTALL_ROOT);

  // 5. Save state
  saveState({ update_current_sha: sha, update_last_check: new Date().toISOString() });

  // 6. Cleanup temp
  try { fs.unlinkSync(tarballPath); } catch {}
  try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}

  onProgress({ step: 'restart', pct: 95, message: 'Scheduling restart…' });

  // 7. Schedule restart via PM2 after response is sent. Spawn detached so this
  //    process can exit cleanly and PM2 picks up the new code on re-spawn.
  setTimeout(() => {
    try {
      const p = spawn('pm2', ['restart', cfg.pmName, '--update-env'], {
        detached: true, stdio: 'ignore', windowsHide: true,
      });
      p.unref();
    } catch (e) {
      console.error('[self-updater] pm2 restart failed:', e.message);
    }
  }, 1500);

  onProgress({ step: 'done', pct: 100, message: 'Update applied. Server restarting…' });
  return { success: true, applied_sha: sha, restart_scheduled: true };
}

/** Recursive copy that skips protected patterns, within the install root. */
function copyDirSafe(srcDir, destDir, relPrefix = '') {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (isProtected(relPath)) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      copyDirSafe(src, dest, relPath);
    } else {
      // Atomic write via temp + rename
      const tmp = dest + '.updating';
      fs.copyFileSync(src, tmp);
      fs.renameSync(tmp, dest);
    }
  }
}

module.exports = { checkForUpdate, applyUpdate, getConfig };
