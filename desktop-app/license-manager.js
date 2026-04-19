/**
 * License Manager — Desktop-app License Enforcement
 *
 * Flow:
 *   1. On app start, read encrypted license cache from userData
 *   2. If cache exists and last server-validation < 30 days, allow app to launch
 *   3. If cache missing / expired / revoked, show activation window (app blocked)
 *   4. Background heartbeat every 24h to central server
 *   5. If server says "not active on this machine" (kicked off by another PC), lock app
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

// ====== Configuration ======
const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || 'https://admin.9x.design';
const OFFLINE_GRACE_DAYS = 30;
const HEARTBEAT_INTERVAL_HOURS = 24;
const CACHE_FILE_NAME = 'license.enc';
// Per-install constant key derived from machine id — makes cache tamper-resistant
// (Not cryptographically perfect — defense in depth, not bank-grade)
const CACHE_KEY_SEED = '9x-design-millentry-license-cache-v1';

// ====== Machine Fingerprint ======
function getMachineFingerprint() {
  // Stable across reboots & app restarts. Changes if user reinstalls OS or moves HDD.
  const nets = os.networkInterfaces();
  const macs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') macs.push(net.mac);
    }
  }
  macs.sort();
  const data = [
    os.hostname(),
    os.platform(),
    os.arch(),
    macs.join(','),
    os.cpus()[0] ? os.cpus()[0].model : 'cpu',
  ].join('|');
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getPcInfo() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0] ? os.cpus()[0].model : 'unknown',
    ram_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    app_version: app.getVersion(),
  };
}

// ====== Encrypted cache (AES-256-GCM) ======
function deriveKey() {
  return crypto.createHash('sha256')
    .update(CACHE_KEY_SEED + '|' + getMachineFingerprint())
    .digest();
}

function encryptCache(obj) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptCache(str) {
  try {
    const buf = Buffer.from(str, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const key = deriveKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch (e) {
    console.warn('[License] Cache decrypt failed:', e.message);
    return null;
  }
}

function getCachePath() {
  try {
    return path.join(app.getPath('userData'), CACHE_FILE_NAME);
  } catch {
    return path.join(os.homedir(), '.millentry-' + CACHE_FILE_NAME);
  }
}

function loadCache() {
  const p = getCachePath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return decryptCache(raw);
  } catch (e) {
    console.warn('[License] loadCache error:', e.message);
    return null;
  }
}

function saveCache(data) {
  const p = getCachePath();
  const enc = encryptCache(data);
  fs.writeFileSync(p, enc, 'utf8');
}

function clearCache() {
  const p = getCachePath();
  if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
}

// ====== HTTP helpers ======
function httpPost(urlStr, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const data = JSON.stringify(body);
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeoutMs,
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          const json = JSON.parse(text);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(json.error || `HTTP ${res.statusCode}`));
        } catch (e) { reject(new Error('Invalid response: ' + text.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

function httpGet(urlStr, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.request({
      method: 'GET',
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      timeout: timeoutMs,
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          const json = JSON.parse(text);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(json.error || `HTTP ${res.statusCode}`));
        } catch (e) { reject(new Error('Invalid response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Timeout')); });
    req.end();
  });
}

// ====== Public API ======

/**
 * Lookup a license key (read-only preview) — returns mill name / customer / plan
 * without activating. Used by activation UI to show "Activating for: X" before commit.
 */
async function lookupLicense(key) {
  if (!key || !key.trim()) throw new Error('License key required');
  const cleanKey = key.trim().toUpperCase();
  return httpGet(LICENSE_SERVER_URL + '/api/license/lookup/' + encodeURIComponent(cleanKey), 6000);
}

/**
 * Check license status at startup.
 * Returns: { ok: true, cache } | { ok: false, reason, cache? }
 */
async function checkLicenseOnStartup() {
  const cache = loadCache();
  if (!cache || !cache.key) {
    return { ok: false, reason: 'no_activation' };
  }

  // Offline grace check
  const lastCheck = cache.last_validated_at ? new Date(cache.last_validated_at).getTime() : 0;
  const daysSinceCheck = (Date.now() - lastCheck) / (1000 * 60 * 60 * 24);

  // Try online heartbeat first
  try {
    const resp = await httpPost(LICENSE_SERVER_URL + '/api/license/heartbeat', {
      key: cache.key,
      machine_fingerprint: getMachineFingerprint(),
    }, 8000);
    if (resp && resp.active) {
      cache.last_validated_at = new Date().toISOString();
      cache.expires_at = resp.expires_at || cache.expires_at;
      cache.is_master = !!resp.is_master;
      saveCache(cache);
      return { ok: true, cache };
    } else {
      // Server responded but license inactive / revoked / kicked
      const reason = resp && resp.error ? resp.error : 'inactive';
      return { ok: false, reason, cache };
    }
  } catch (e) {
    console.warn('[License] Heartbeat failed (offline?):', e.message);
    // Offline fallback: allow if grace period not exceeded
    if (daysSinceCheck <= OFFLINE_GRACE_DAYS) {
      return { ok: true, cache, offline: true, days_remaining: Math.ceil(OFFLINE_GRACE_DAYS - daysSinceCheck) };
    } else {
      return { ok: false, reason: `Offline too long (${Math.floor(daysSinceCheck)} days — need to reconnect)`, cache };
    }
  }
}

/**
 * Activate license with a key. Called from Activation UI.
 */
async function activateLicense(key) {
  if (!key || !key.trim()) throw new Error('License key required');
  const cleanKey = key.trim().toUpperCase();
  const resp = await httpPost(LICENSE_SERVER_URL + '/api/license/activate', {
    key: cleanKey,
    machine_fingerprint: getMachineFingerprint(),
    pc_info: getPcInfo(),
  }, 15000);
  if (!resp || !resp.success) throw new Error((resp && resp.error) || 'Activation failed');
  const cache = {
    key: cleanKey,
    customer_name: resp.license.customer_name,
    mill_name: resp.license.mill_name,
    plan: resp.license.plan,
    expires_at: resp.license.expires_at,
    is_master: !!resp.license.is_master,
    activation_id: resp.activation_id,
    activated_at: new Date().toISOString(),
    last_validated_at: new Date().toISOString(),
  };
  saveCache(cache);
  return cache;
}

/**
 * Periodic background heartbeat. Called by setInterval from main.js.
 * Returns: { active } | { revoked: true, reason }
 */
async function sendHeartbeat() {
  const cache = loadCache();
  if (!cache || !cache.key) return { active: false, revoked: true, reason: 'no_cache' };
  try {
    const resp = await httpPost(LICENSE_SERVER_URL + '/api/license/heartbeat', {
      key: cache.key,
      machine_fingerprint: getMachineFingerprint(),
    }, 8000);
    if (resp && resp.active) {
      cache.last_validated_at = new Date().toISOString();
      cache.expires_at = resp.expires_at || cache.expires_at;
      saveCache(cache);
      return { active: true };
    } else {
      return { active: false, revoked: true, reason: (resp && resp.error) || 'inactive' };
    }
  } catch (e) {
    // Transient network error — don't treat as revoked
    return { active: true, offline: true };
  }
}

function startBackgroundHeartbeat(onRevoked) {
  const INTERVAL_MS = HEARTBEAT_INTERVAL_HOURS * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const res = await sendHeartbeat();
      if (res.revoked && typeof onRevoked === 'function') onRevoked(res.reason);
    } catch (e) { console.warn('[License] heartbeat loop error:', e.message); }
  }, INTERVAL_MS);
}

function getStatus() {
  const cache = loadCache();
  if (!cache) return { activated: false };
  return {
    activated: true,
    key: cache.key,
    customer_name: cache.customer_name,
    mill_name: cache.mill_name,
    plan: cache.plan,
    expires_at: cache.expires_at,
    is_master: cache.is_master,
    last_validated_at: cache.last_validated_at,
  };
}

module.exports = {
  getMachineFingerprint,
  getPcInfo,
  checkLicenseOnStartup,
  lookupLicense,
  activateLicense,
  sendHeartbeat,
  startBackgroundHeartbeat,
  getStatus,
  clearCache,
  LICENSE_SERVER_URL,
};
