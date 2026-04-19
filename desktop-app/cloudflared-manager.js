/**
 * Cloudflared Tunnel Manager — Desktop App
 *
 * Responsibilities:
 *   1. Download cloudflared.exe (Windows amd64) from GitHub releases → cache in userData
 *   2. Install cloudflared as a Windows Service using a tunnel token
 *   3. Start/stop/uninstall the service
 *   4. Report live status (service installed? running? tunnel connected?)
 *
 * All Windows Service operations REQUIRE Administrator privileges — Electron must
 * be launched elevated, or the child_process calls will return "Access denied".
 * We surface these errors clearly so the UI can prompt the user to re-open the
 * app as Administrator for the first-time setup only (daily runs do not need it).
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const CLOUDFLARED_RELEASE_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const SERVICE_NAME = 'cloudflared';

function getBinDir() {
  const dir = path.join(app.getPath('userData'), 'cloudflared');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getBinaryPath() {
  return path.join(getBinDir(), 'cloudflared.exe');
}

function isBinaryInstalled() {
  const p = getBinaryPath();
  if (!fs.existsSync(p)) return false;
  try { return fs.statSync(p).size > 10 * 1024 * 1024; } // > 10 MB sanity
  catch { return false; }
}

// ====== Download with progress ======
/**
 * Downloads cloudflared.exe, reporting progress via `onProgress({bytes, total, pct})`.
 * Handles GitHub redirect (302 → actual release URL).
 */
function downloadBinary(onProgress) {
  return new Promise((resolve, reject) => {
    const destPath = getBinaryPath();
    const tmpPath = destPath + '.download';
    const file = fs.createWriteStream(tmpPath);
    let totalBytes = 0, downloadedBytes = 0;

    function follow(urlStr, redirectCount) {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      const u = new URL(urlStr);
      https.get({
        hostname: u.hostname, path: u.pathname + u.search,
        headers: { 'User-Agent': 'MillEntry-Desktop' },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} while downloading cloudflared`));
        }
        totalBytes = parseInt(res.headers['content-length'] || '0', 10) || 0;
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (onProgress) {
            const pct = totalBytes ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
            onProgress({ bytes: downloadedBytes, total: totalBytes, pct });
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try {
              // Atomic rename into place
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              fs.renameSync(tmpPath, destPath);
              if (onProgress) onProgress({ bytes: downloadedBytes, total: totalBytes || downloadedBytes, pct: 100 });
              resolve(destPath);
            } catch (e) { reject(e); }
          });
        });
      }).on('error', (err) => {
        try { fs.unlinkSync(tmpPath); } catch {}
        reject(err);
      });
    }

    follow(CLOUDFLARED_RELEASE_URL, 0);
  });
}

// ====== Service control ======
function runCloudflared(args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const bin = getBinaryPath();
    if (!fs.existsSync(bin)) return resolve({ success: false, error: 'cloudflared binary not found' });
    const proc = spawn(bin, args, { windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { try { proc.kill(); } catch {} }, timeoutMs);
    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', (e) => {
      clearTimeout(timer);
      resolve({ success: false, error: e.message, stdout, stderr });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, code, stdout, stderr });
    });
  });
}

function runSc(args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const proc = spawn('sc.exe', args, { windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { try { proc.kill(); } catch {} }, timeoutMs);
    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', (e) => {
      clearTimeout(timer);
      resolve({ success: false, error: e.message, stdout, stderr });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, code, stdout, stderr });
    });
  });
}

async function getServiceStatus() {
  // sc query cloudflared — returns RUNNING / STOPPED / not_installed
  const r = await runSc(['query', SERVICE_NAME]);
  if (/1060/.test(r.stderr || '') || /does not exist/i.test(r.stderr || r.stdout || '')) {
    return { installed: false, running: false };
  }
  const running = /RUNNING/i.test(r.stdout);
  const stopped = /STOPPED/i.test(r.stdout);
  return { installed: running || stopped, running };
}

/**
 * Detect if cloudflared service was pre-configured by the user manually
 * (e.g., via cloudflared install <token> command line before MillEntry knew about it).
 * Returns { preExisting: true, can_adopt: true } if service is installed & running
 * but MillEntry has no record of provisioning it.
 */
async function detectPreExistingConfig(serverKnowsTunnel) {
  const status = await getServiceStatus();
  if (!status.installed) return { preExisting: false };
  // Service exists. If server also has a tunnel record → our install, not pre-existing.
  if (serverKnowsTunnel) return { preExisting: false, ours: true };
  // Service exists but server has no tunnel → manually configured
  return { preExisting: true, running: status.running };
}

/** Install service using tunnel token. Requires admin privs. */
async function installService(tunnelToken) {
  if (!tunnelToken) throw new Error('Tunnel token required');
  if (!isBinaryInstalled()) throw new Error('cloudflared binary missing — run download first');
  // `cloudflared service install <token>` is idempotent but will fail if service already exists
  // with different config. Uninstall first if present.
  const status = await getServiceStatus();
  if (status.installed) {
    await runCloudflared(['service', 'uninstall']);
  }
  const r = await runCloudflared(['service', 'install', tunnelToken]);
  if (!r.success) {
    const msg = (r.stderr || r.stdout || '').trim();
    if (/access is denied|access denied/i.test(msg)) {
      throw new Error('Administrator rights required. Right-click MillEntry → "Run as administrator" and try again.');
    }
    throw new Error('cloudflared service install failed: ' + (msg || `exit ${r.code}`));
  }
  return { success: true };
}

async function startService() {
  const r = await runSc(['start', SERVICE_NAME]);
  // sc start returns 1056 if already running
  if (!r.success && !/1056|already/i.test(r.stdout + r.stderr)) {
    const msg = (r.stderr || r.stdout || '').trim();
    if (/access is denied/i.test(msg)) throw new Error('Administrator rights required to start service.');
    throw new Error('Service start failed: ' + msg);
  }
  return { success: true };
}

async function stopService() {
  const r = await runSc(['stop', SERVICE_NAME]);
  if (!r.success && !/1062|not started/i.test(r.stdout + r.stderr)) {
    // ignore "service not started" — already stopped is fine
    const msg = (r.stderr || r.stdout || '').trim();
    throw new Error('Service stop failed: ' + msg);
  }
  return { success: true };
}

async function uninstallService() {
  // Stop first
  try { await stopService(); } catch {}
  const r = await runCloudflared(['service', 'uninstall']);
  if (!r.success) {
    const msg = (r.stderr || r.stdout || '').trim();
    // If "service does not exist" — treat as success
    if (!/1060|does not exist/i.test(msg)) {
      if (/access is denied/i.test(msg)) throw new Error('Administrator rights required to uninstall service.');
      throw new Error('Uninstall failed: ' + msg);
    }
  }
  return { success: true };
}

async function getFullStatus() {
  const binExists = isBinaryInstalled();
  let service = { installed: false, running: false };
  try { service = await getServiceStatus(); } catch {}
  return {
    binary_installed: binExists,
    binary_path: binExists ? getBinaryPath() : null,
    service_installed: service.installed,
    service_running: service.running,
  };
}

module.exports = {
  getBinaryPath, isBinaryInstalled,
  downloadBinary,
  installService, startService, stopService, uninstallService,
  getServiceStatus, getFullStatus, detectPreExistingConfig,
  SERVICE_NAME,
  CLOUDFLARED_RELEASE_URL,
};
