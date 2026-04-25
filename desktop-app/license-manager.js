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
// IMPORTANT: This must be STABLE across restarts. Common pitfalls (cause "License not
// activated" errors when cache is actually present):
//   - USB ethernet/WiFi/Bluetooth adapters being plugged/unplugged
//   - Hyper-V, WSL, Docker, VirtualBox, VMware adapters appearing/disappearing
//   - VPN adapters (NordVPN, ExpressVPN, etc.) toggling on/off
//   - Windows Update sometimes renames the CPU model string
//
// Fix: Filter to PHYSICAL non-virtual MACs only, and OMIT the volatile CPU model.
const VIRTUAL_INTERFACE_PATTERNS = [
  /vEthernet/i, /Hyper-V/i, /VirtualBox/i, /VMware/i, /VMnet/i,
  /Bluetooth/i, /Tunnel/i, /TAP/i, /Loopback/i, /isatap/i, /Teredo/i,
  /Docker/i, /WSL/i, /VPN/i, /TailScale/i, /Wintun/i, /Pseudo/i,
  /vboxnet/i, /utun\d+/i, /awdl/i, /llw/i, /anpi/i, /ap\d+/i, /bridge/i, /gif/i, /stf/i,
];

// Common fake/locally-administered MAC prefixes (virtual NICs)
function isPhysicalMac(mac) {
  if (!mac || mac === '00:00:00:00:00:00') return false;
  const firstByte = parseInt(mac.split(':')[0], 16);
  if (isNaN(firstByte)) return false;
  // The 2nd-least-significant bit of the 1st byte = "locally administered"
  // Hyper-V/Docker/etc usually set this; physical NICs almost never do.
  // We TOLERATE these (some real laptops have it) but still filter virtual adapters by name.
  return true;
}

function getStableMacs() {
  const nets = os.networkInterfaces();
  const macs = [];
  for (const name of Object.keys(nets)) {
    // Skip if name matches any virtual pattern
    if (VIRTUAL_INTERFACE_PATTERNS.some(p => p.test(name))) continue;
    for (const net of nets[name] || []) {
      if (!net.internal && net.mac && isPhysicalMac(net.mac)) {
        macs.push(net.mac.toLowerCase());
      }
    }
  }
  // Dedupe + sort
  return [...new Set(macs)].sort();
}

function getMachineFingerprint() {
  // Stable across reboots & app restarts. Filters virtual/USB adapters that come & go.
  const macs = getStableMacs();
  const data = [
    os.hostname(),
    os.platform(),
    os.arch(),
    macs.join(','),
    // CPU model REMOVED - sometimes changes after Windows Updates / power state
  ].join('|');
  return crypto.createHash('sha256').update(data).digest('hex');
}

// "Minimal" fingerprint — used as fallback for decrypting older caches when MACs
// have changed (USB plugged/unplugged, virtual adapter installed, etc.). Without
// this, the user's session would appear to be "Cache not found".
function getMinimalFingerprint() {
  const data = [os.hostname(), os.platform(), os.arch()].join('|');
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Legacy v1 fingerprint — what the OLD code (pre-v104.28.21) used. Includes ALL
// MACs (virtual + physical) and the CPU model. Needed for backward-compatible
// decryption of caches created by older versions.
function getLegacyFingerprintV1() {
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
function deriveKey(fingerprint) {
  const fp = fingerprint || getMachineFingerprint();
  return crypto.createHash('sha256')
    .update(CACHE_KEY_SEED + '|' + fp)
    .digest();
}

function encryptCache(obj) {
  const key = deriveKey();  // always uses the current (stable) fingerprint
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptCacheWithKey(buf, key) {
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

/**
 * Decrypt cache, trying multiple candidate fingerprints in priority order.
 * Why: A user's machine fingerprint can shift between sessions when they:
 *   - plug/unplug USB ethernet, WiFi or Bluetooth adapters
 *   - install/uninstall WSL, Docker, Hyper-V, VPN, VirtualBox, VMware
 *   - apply a Windows Update that changes the CPU model string
 * Without fallbacks, the cache file would be unreadable and the user would see
 * "License not activated" / "Cache not found" — even though the file is right there.
 *
 * Returns null if NO candidate works (then the cache is genuinely corrupt or
 * the machine has actually changed).
 */
function decryptCache(str) {
  let buf;
  try { buf = Buffer.from(str, 'base64'); } catch (e) { return null; }
  if (buf.length < 30) return null;

  const candidates = [
    { name: 'current',  fp: getMachineFingerprint() },
    { name: 'minimal',  fp: getMinimalFingerprint() },
    { name: 'legacy_v1', fp: getLegacyFingerprintV1() },
  ];

  for (const cand of candidates) {
    try {
      const data = decryptCacheWithKey(buf, deriveKey(cand.fp));
      if (cand.name !== 'current') {
        console.warn(`[License] Cache decrypted via ${cand.name} fallback (machine fingerprint shifted). Re-saving with current key.`);
        // Re-save immediately with the current fingerprint so future loads use 'current' path
        try { saveCache(data); } catch (e) { /* best-effort */ }
      }
      return data;
    } catch (e) { /* try next candidate */ }
  }
  console.warn('[License] Cache decrypt failed — all candidate fingerprints exhausted.');
  return null;
}

function getCachePath() {
  try {
    return path.join(app.getPath('userData'), CACHE_FILE_NAME);
  } catch {
    return path.join(os.homedir(), '.millentry-' + CACHE_FILE_NAME);
  }
}

function loadCache() {
  const result = loadCacheWithReason();
  return result.cache;
}

/**
 * Like loadCache() but also returns WHY it failed. Used by status / startup logic
 * to differentiate between "no file" and "file exists but cannot decrypt".
 * Returns: { cache, reason: 'ok' | 'not_found' | 'decrypt_failed' | 'read_error' }
 */
function loadCacheWithReason() {
  const p = getCachePath();
  if (!fs.existsSync(p)) return { cache: null, reason: 'not_found' };
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    console.warn('[License] loadCache read error:', e.message);
    return { cache: null, reason: 'read_error', error: e.message };
  }
  if (!raw || !raw.trim()) return { cache: null, reason: 'empty_file' };
  const cache = decryptCache(raw);
  if (!cache) return { cache: null, reason: 'decrypt_failed' };
  return { cache, reason: 'ok' };
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

/**
 * Import a signed .mlic file and activate locally. Uses the embedded/cached
 * public key for offline verification. If machine has internet, ALSO notifies
 * central server via /api/license/activate-mlic so admin dashboard tracks the binding.
 *
 * @param {string} filePath - absolute path to the .mlic file
 * @returns {Promise<Object>} the activated cache record
 */
async function importMlic(filePath) {
  const mlicImport = require('./mlic-import');
  const payload = await mlicImport.readAndVerifyMlicFile(filePath, LICENSE_SERVER_URL);

  // Payload verified — build a local cache with bind-on-first-use.
  const cache = {
    key: payload.license.key,
    customer_name: payload.license.customer_name,
    mill_name: payload.license.mill_name,
    plan: payload.license.plan,
    expires_at: payload.license.expires_at,
    is_master: !!payload.license.is_master,
    activation_id: 'mlic-' + (payload.mlic_id || Date.now()),
    activated_at: new Date().toISOString(),
    last_validated_at: new Date().toISOString(),
    via_mlic: true,
    mlic_id: payload.mlic_id,
    machine_fingerprint: getMachineFingerprint(),
  };

  // Best-effort: notify central server (doesn't fail the import if offline)
  try {
    const resp = await httpPost(LICENSE_SERVER_URL + '/api/license/activate-mlic', {
      mlic: payload,
      machine_fingerprint: getMachineFingerprint(),
      pc_info: getPcInfo(),
    }, 10000);
    if (resp && resp.success) {
      cache.activation_id = resp.activation_id || cache.activation_id;
      cache.server_registered = true;
    }
  } catch (e) {
    console.warn('[License] mlic activation offline — local cache saved, will sync next online:', e.message);
    cache.server_registered = false;
  }

  saveCache(cache);
  return cache;
}

// ====== Public API ======

/**
 * Auto-recover license when local cache is unreadable.
 * Asks the central server "do any of my candidate fingerprints match an active
 * activation?" — if yes, server returns the license key and we silently re-activate.
 * No user action required (no key re-entry, no Repair button click).
 *
 * @returns {Promise<Object|null>} cache object on success, null on failure
 */
async function attemptAutoRecoverFromServer() {
  try {
    const candidates = [
      getMachineFingerprint(),
      getMinimalFingerprint(),
      getLegacyFingerprintV1(),
    ].filter(Boolean);
    const resp = await httpPost(
      LICENSE_SERVER_URL + '/api/license/recover-by-fingerprint',
      { fingerprints: candidates },
      8000
    );
    if (!resp || !resp.success || !resp.key) return null;
    console.warn(`[License] Auto-recovery succeeded — re-activating with key from server (matched fingerprint variant).`);
    // Re-run the activation flow with the recovered key
    const cache = await activateLicense(resp.key);
    return cache;
  } catch (e) {
    console.warn('[License] Auto-recovery failed:', e.message);
    return null;
  }
}

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
 * Returns: { ok: true, cache } | { ok: false, reason, cache?, decrypt_failed? }
 */
async function checkLicenseOnStartup() {
  const { cache: initialCache, reason: loadReason } = loadCacheWithReason();
  let cache = initialCache;
  if (!cache || !cache.key) {
    // Differentiate genuine "never activated" vs "cache exists but can't decrypt"
    if (loadReason === 'decrypt_failed') {
      // FIRST try server-based auto-recovery (fingerprint match) — silent, no user action
      console.warn('[License] cache_decrypt_failed — attempting auto-recovery via server fingerprint match...');
      const recovered = await attemptAutoRecoverFromServer();
      if (recovered) {
        return { ok: true, cache: recovered, auto_recovered: true };
      }
      return { ok: false, reason: 'cache_decrypt_failed', decrypt_failed: true };
    }
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
  const { cache, reason } = loadCacheWithReason();
  if (!cache) {
    return {
      activated: false,
      cache_file_exists: reason !== 'not_found',
      decrypt_failed: reason === 'decrypt_failed',
      load_reason: reason,
    };
  }
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

/**
 * Ask central server to provision (or return existing) Cloudflare tunnel for this license.
 * Returns: { success, hostname, tunnel_token, slug, existed }
 */
async function provisionCloudAccess() {
  const cache = loadCache();
  if (!cache || !cache.key) throw new Error('License not activated');
  const resp = await httpPost(LICENSE_SERVER_URL + '/api/license/provision-cloud-access', {
    key: cache.key,
    machine_fingerprint: getMachineFingerprint(),
  }, 30000);
  if (!resp || !resp.success) throw new Error((resp && resp.error) || 'Tunnel provisioning failed');
  // Cache hostname locally for quick read
  cache.tunnel_hostname = resp.hostname;
  cache.tunnel_slug = resp.slug;
  cache.cloud_enabled_at = cache.cloud_enabled_at || new Date().toISOString();
  saveCache(cache);
  return resp;
}

/** Read-only lookup of cloud-access status from central server. */
async function getCloudAccessStatus() {
  const cache = loadCache();
  if (!cache || !cache.key) return { provisioned: false };
  try {
    const resp = await httpGet(LICENSE_SERVER_URL + '/api/license/cloud-access-status/' + encodeURIComponent(cache.key), 8000);
    return resp;
  } catch (e) {
    // Offline fallback: return cached info if we have it
    if (cache.tunnel_hostname) return { provisioned: true, hostname: cache.tunnel_hostname, slug: cache.tunnel_slug, offline: true };
    throw e;
  }
}

module.exports = {
  getMachineFingerprint,
  getMinimalFingerprint,
  getLegacyFingerprintV1,
  loadCacheWithReason,
  getPcInfo,
  checkLicenseOnStartup,
  lookupLicense,
  activateLicense,
  importMlic,
  sendHeartbeat,
  startBackgroundHeartbeat,
  getStatus,
  clearCache,
  provisionCloudAccess,
  getCloudAccessStatus,
  attemptAutoRecoverFromServer,
  LICENSE_SERVER_URL,
};
