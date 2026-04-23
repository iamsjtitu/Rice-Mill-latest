#!/usr/bin/env node
/**
 * fetch-public-key.js
 *
 * Called at BUILD TIME (GitHub Actions → before `yarn pack`) to fetch the
 * current Ed25519 public key from the central license server and embed it
 * into the desktop app's mlic-import.js module.
 *
 * Why embed?
 *   First-install customers with zero internet can't fetch the key; embedding
 *   it in the installer means they can import .mlic the first time offline.
 *   Customers who eventually come online will refresh the cached key anyway.
 *
 * Usage:
 *   LICENSE_SERVER_URL=https://admin.9x.design node scripts/fetch-public-key.js
 *   # or fallback to default https://admin.9x.design
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SERVER = (process.env.LICENSE_SERVER_URL || 'https://admin.9x.design').replace(/\/+$/, '');
const TARGET_FILE = path.join(__dirname, '..', 'mlic-import.js');

function fetchJson(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'GET', hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname, timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Not JSON: ' + body.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

(async () => {
  try {
    console.log(`[fetch-public-key] fetching from ${SERVER}/api/license/public-key`);
    const j = await fetchJson(`${SERVER}/api/license/public-key`);
    if (!j || !j.public_key || !j.public_key.includes('BEGIN PUBLIC KEY')) {
      throw new Error('Malformed response (no public_key)');
    }
    const pem = j.public_key.trim();
    console.log(`[fetch-public-key] got key (algo=${j.algorithm}, ${pem.length} bytes)`);

    const src = fs.readFileSync(TARGET_FILE, 'utf8');
    // Replace the EMBEDDED_PUBLIC_KEY line (either empty or previous string)
    const marker = /const EMBEDDED_PUBLIC_KEY = process\.env\.MLIC_PUBLIC_KEY_OVERRIDE \|\| '[^']*';/;
    if (!marker.test(src)) throw new Error('Could not find EMBEDDED_PUBLIC_KEY marker in mlic-import.js');
    // JS-escape newlines for the PEM
    const escaped = pem.replace(/\n/g, '\\n');
    const replacement = `const EMBEDDED_PUBLIC_KEY = process.env.MLIC_PUBLIC_KEY_OVERRIDE || '${escaped}';`;
    const out = src.replace(marker, replacement);
    fs.writeFileSync(TARGET_FILE, out, 'utf8');
    console.log('[fetch-public-key] ✓ embedded public key into mlic-import.js');
    process.exit(0);
  } catch (e) {
    console.warn('[fetch-public-key] ⚠  Could not fetch public key:', e.message);
    console.warn('[fetch-public-key]    Build will continue — desktop app will fallback to online-fetch.');
    // Don't fail the build; the app supports online-fetch as fallback.
    process.exit(0);
  }
})();
