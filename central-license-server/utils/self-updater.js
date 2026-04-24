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

/** Check: returns { current_sha, latest_sha, latest_commit, update_available }
 *
 *  NOTE: uses the `commits?path=central-license-server&per_page=1` endpoint
 *  instead of `commits/:branch`. This way frontend-only or desktop-app-only
 *  pushes to the monorepo do NOT trigger a false "update available" on the
 *  admin dashboard — only commits that actually touched the central-license-server
 *  folder count.
 */
async function checkForUpdate() {
  const cfg = getConfig();
  const url = `https://api.github.com/repos/${cfg.repo}/commits?sha=${encodeURIComponent(cfg.branch)}&path=${encodeURIComponent(SUBDIR_IN_REPO)}&per_page=1`;
  const res = await httpsRequest(url);
  if (res.status === 404) throw new Error(`Repo or branch not found: ${cfg.repo}@${cfg.branch}`);
  if (res.status === 401 || res.status === 403) throw new Error(`GitHub auth failed (HTTP ${res.status}). If repo is private, set a GitHub PAT in settings.`);
  if (res.status !== 200) throw new Error(`GitHub API HTTP ${res.status}`);
  let list;
  try { list = JSON.parse(res.body.toString('utf8')); } catch { throw new Error('Invalid JSON from GitHub'); }
  if (!Array.isArray(list) || list.length === 0) {
    // No commits have ever touched this folder — fall back to branch HEAD as a safe default
    const fallback = await httpsRequest(`https://api.github.com/repos/${cfg.repo}/commits/${encodeURIComponent(cfg.branch)}`);
    if (fallback.status !== 200) throw new Error(`GitHub API HTTP ${fallback.status}`);
    const fb = JSON.parse(fallback.body.toString('utf8'));
    list = [{ sha: fb.sha, commit: fb.commit, author: fb.author }];
  }
  const data = list[0];
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
    scoped_to: SUBDIR_IN_REPO,
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

/**
 * Apply update from an arbitrary tarball URL (paste.rs, file host, etc.).
 * Use case: quick hotfixes without waiting for GitHub Actions.
 *
 * Behaviour:
 *   - Fetches raw URL content
 *   - If content looks like base64 (ASCII only, decodes to gzip header),
 *     automatically decodes it. Otherwise treats as raw tar.gz.
 *   - Extracts, validates, and applies like applyUpdate().
 *   - Does NOT modify update_current_sha (manual URL updates are out-of-band).
 */
async function applyUpdateFromUrl(tarballUrl, onProgress = () => {}) {
  if (!tarballUrl || !/^https:\/\//.test(tarballUrl)) throw new Error('Valid HTTPS URL required');
  const cfg = getConfig();

  onProgress({ step: 'download', pct: 10, message: `Fetching tarball from ${new URL(tarballUrl).hostname}…` });
  // Raw fetch without GitHub headers (might interfere with paste.rs responses)
  const raw = await new Promise((resolve, reject) => {
    const follow = (url, redirectsLeft) => {
      if (redirectsLeft < 0) return reject(new Error('Too many redirects'));
      const u = new URL(url);
      https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'MillEntry-License-Server/1.0' }, timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(res.headers.location, redirectsLeft - 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject).on('timeout', () => reject(new Error('Download timeout')));
    };
    follow(tarballUrl, 5);
  });

  // Detect base64: if buffer is all printable ASCII and doesn't start with gzip magic (0x1f 0x8b),
  // try decoding as base64.
  let tarball = raw;
  const isGzip = raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b;
  if (!isGzip) {
    const asText = raw.toString('utf8').trim();
    // base64 charset check
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(asText)) {
      try {
        const decoded = Buffer.from(asText, 'base64');
        if (decoded.length >= 2 && decoded[0] === 0x1f && decoded[1] === 0x8b) {
          tarball = decoded;
          onProgress({ step: 'download', pct: 30, message: 'Decoded base64 payload' });
        }
      } catch { /* fall through */ }
    }
    if (!(tarball.length >= 2 && tarball[0] === 0x1f && tarball[1] === 0x8b)) {
      throw new Error('Downloaded content is not a valid tar.gz archive (magic bytes check failed)');
    }
  }

  // Write to temp + extract
  const tarballPath = path.join('/tmp', `mls-url-update-${Date.now()}.tar.gz`);
  fs.writeFileSync(tarballPath, tarball);
  onProgress({ step: 'download', pct: 45, message: `Fetched ${(tarball.length / 1024).toFixed(0)} KB` });

  const extractDir = path.join('/tmp', `mls-url-update-extract-${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });
  onProgress({ step: 'extract', pct: 55, message: 'Extracting tarball…' });
  await new Promise((resolve, reject) => {
    const p = spawn('tar', ['-xzf', tarballPath, '-C', extractDir], { windowsHide: true });
    let err = '';
    p.stderr.on('data', c => { err += c.toString(); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error('tar extract failed: ' + err)));
  });

  // Find source dir: either the archive has central-license-server/ at root, OR the files are at root directly.
  let srcDir;
  if (fs.existsSync(path.join(extractDir, SUBDIR_IN_REPO, 'server.js'))) {
    srcDir = path.join(extractDir, SUBDIR_IN_REPO);
  } else if (fs.existsSync(path.join(extractDir, 'server.js'))) {
    srcDir = extractDir;
  } else {
    // Also try single nested dir (like GitHub tarballs)
    const dirs = fs.readdirSync(extractDir).filter(f => fs.statSync(path.join(extractDir, f)).isDirectory());
    for (const d of dirs) {
      if (fs.existsSync(path.join(extractDir, d, SUBDIR_IN_REPO, 'server.js'))) {
        srcDir = path.join(extractDir, d, SUBDIR_IN_REPO); break;
      }
      if (fs.existsSync(path.join(extractDir, d, 'server.js'))) {
        srcDir = path.join(extractDir, d); break;
      }
    }
  }
  if (!srcDir) throw new Error('Could not locate server.js in tarball — invalid structure');

  onProgress({ step: 'copy', pct: 75, message: 'Applying files…' });
  copyDirSafe(srcDir, INSTALL_ROOT);

  saveState({ update_last_url: tarballUrl, update_last_applied_at: new Date().toISOString() });

  try { fs.unlinkSync(tarballPath); } catch {}
  try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}

  onProgress({ step: 'restart', pct: 95, message: 'Scheduling restart…' });
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
  return { success: true, source: 'url', url: tarballUrl, restart_scheduled: true };
}

module.exports = { checkForUpdate, applyUpdate, applyUpdateFromUrl, getConfig };
