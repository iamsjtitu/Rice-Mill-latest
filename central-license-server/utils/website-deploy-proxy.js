/**
 * Website Deploy Proxy — forwards requests from admin dashboard to 9x.design's /api/deploy/*
 * This exists so the browser doesn't need to talk to 9x.design directly (solves the CORS mess).
 *
 * Token storage: data.settings.website_deploy_token (persisted; admin enters once).
 * Never returned to the browser — only the "is it configured?" bit is exposed.
 *
 * Proxied endpoints:
 *   GET  /status        → 9x.design GET  /status
 *   POST /run           → 9x.design POST /run
 *   GET  /logs?tail=N   → 9x.design GET  /logs?tail=N
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');
const db = require('../database');

const DEFAULT_TIMEOUT_MS = 30000;

function getConfig() {
  const s = db.getData().settings || {};
  return {
    token: (s.website_deploy_token || '').trim(),
    base:  (s.website_deploy_base || 'https://9x.design/api/deploy').replace(/\/+$/, ''),
  };
}

function forward(method, upstreamPath, opts = {}) {
  return new Promise((resolve) => {
    const { token, base } = getConfig();
    if (!token) {
      return resolve({ ok: false, status: 400, body: { detail: 'Deploy token not configured on server. Save it in Settings → Website.' } });
    }
    const target = new URL(base + upstreamPath);
    const lib = target.protocol === 'https:' ? https : http;
    const req = lib.request({
      method,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      headers: Object.assign({
        'X-Deploy-Token': token,
        'User-Agent': 'MillEntry-Admin-Proxy/1.0',
        'Accept': 'application/json',
      }, opts.headers || {}),
      timeout: opts.timeout || DEFAULT_TIMEOUT_MS,
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        let body;
        try { body = JSON.parse(chunks); }
        catch { body = { raw: chunks.slice(0, 2000) }; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body });
      });
    });
    req.on('error', e => resolve({ ok: false, status: 502, body: { detail: 'Upstream error: ' + e.message } }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 504, body: { detail: 'Upstream timeout' } }); });
    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

module.exports = { forward, getConfig };
