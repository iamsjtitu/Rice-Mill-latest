/**
 * MLIC File Store — saves signed .mlic payloads to disk with a short-lived
 * public download token. Used to expose the file via an HTTPS URL that
 * 360Messenger can attach to a WhatsApp message.
 *
 * Storage: /app/central-license-server/data/mlic/<token>.mlic
 * Retention: 48 hours (auto-cleanup on save)
 * Public route: /mlic/<token>  (mounted in server.js, unauthenticated)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_DIR = path.join(__dirname, '..', 'data', 'mlic');
const TOKEN_TTL_HOURS = 48;
const BASE_URL_OVERRIDE = process.env.MLIC_PUBLIC_BASE_URL || '';

function ensureDir() {
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch {}
}

function cleanupOldFiles() {
  try {
    if (!fs.existsSync(STORE_DIR)) return;
    const cutoff = Date.now() - TOKEN_TTL_HOURS * 60 * 60 * 1000;
    for (const f of fs.readdirSync(STORE_DIR)) {
      if (!f.endsWith('.mlic') && !f.endsWith('.mlic.json')) continue;
      try {
        const st = fs.statSync(path.join(STORE_DIR, f));
        if (st.mtimeMs < cutoff) fs.unlinkSync(path.join(STORE_DIR, f));
      } catch {}
    }
  } catch {}
}

function baseUrl(req) {
  // 1. Explicit env var wins (production: set MLIC_PUBLIC_BASE_URL=https://admin.9x.design)
  if (BASE_URL_OVERRIDE) return BASE_URL_OVERRIDE.replace(/\/+$/, '');
  // 2. If request context provided, derive from headers (handles reverse proxy)
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const host  = (req.headers['x-forwarded-host']  || req.headers.host || 'localhost:7000').split(',')[0].trim();
    return `${proto}://${host}`;
  }
  // 3. Fallback
  return 'http://localhost:' + (process.env.PORT || 7000);
}

/** Persist payload to disk and return { token, file_path, download_url }. */
function save(payload, meta = {}) {
  ensureDir();
  cleanupOldFiles();
  const token = crypto.randomBytes(16).toString('hex');
  const file = path.join(STORE_DIR, token + '.mlic');
  const body = JSON.stringify(payload, null, 2);
  fs.writeFileSync(file, body, 'utf8');
  // Store meta sidecar for auditing (license key, mill, issued_at)
  try {
    fs.writeFileSync(file + '.meta.json', JSON.stringify({ ...meta, saved_at: new Date().toISOString(), mlic_id: payload.mlic_id }, null, 2));
  } catch {}
  return {
    token,
    file_path: file,
    download_url: `${baseUrl()}/mlic/${token}.mlic`,
  };
}

function read(token) {
  if (!/^[a-f0-9]{32}$/i.test(token)) return null;
  const file = path.join(STORE_DIR, token + '.mlic');
  if (!fs.existsSync(file)) return null;
  const st = fs.statSync(file);
  const ageMs = Date.now() - st.mtimeMs;
  if (ageMs > TOKEN_TTL_HOURS * 60 * 60 * 1000) {
    try { fs.unlinkSync(file); fs.unlinkSync(file + '.meta.json'); } catch {}
    return null;
  }
  try {
    return { body: fs.readFileSync(file, 'utf8'), meta: JSON.parse(fs.readFileSync(file + '.meta.json', 'utf8')) };
  } catch {
    return { body: fs.readFileSync(file, 'utf8'), meta: null };
  }
}

module.exports = { save, read, ensureDir, cleanupOldFiles, STORE_DIR, TOKEN_TTL_HOURS };
