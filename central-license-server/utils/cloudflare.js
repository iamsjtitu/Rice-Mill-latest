/**
 * Cloudflare API client for auto-provisioning tunnels.
 *
 * Workflow:
 *   1. Admin stores Cloudflare API token in settings (one-time)
 *   2. Admin triggers tunnel provisioning for a license
 *   3. This module:
 *        a. Creates a named tunnel on the customer's Cloudflare account
 *        b. Fetches the connector token (cloudflared uses this to connect)
 *        c. Creates a CNAME DNS record (<slug>.<domain> → <tunnel_id>.cfargotunnel.com)
 *        d. Configures ingress rules (public hostname → http://localhost:8080)
 *   4. Installer later uses the connector token to start cloudflared service on customer PC
 *
 * All functions throw an Error with a clean message on failure — caller should try/catch.
 */
const https = require('https');
const db = require('../database');

function cfApi(token, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.cloudflare.com', port: 443, path: '/client/v4' + path, method,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      timeout: 15000,
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request(opts, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-json */ }
        if (!json) return reject(new Error(`Cloudflare API returned non-JSON (HTTP ${res.statusCode}): ${text.slice(0, 200)}`));
        if (!json.success) {
          const msg = (json.errors || []).map(e => e.message).join('; ') || `HTTP ${res.statusCode}`;
          return reject(new Error('Cloudflare: ' + msg));
        }
        resolve(json.result);
      });
    });
    req.on('error', e => reject(new Error('Cloudflare network error: ' + e.message)));
    req.on('timeout', () => { req.destroy(new Error('Cloudflare API timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

// ====== Config resolution ======
function getCfConfig() {
  const s = (db.getData().settings) || {};
  return {
    token: (s.cloudflare_api_token || '').trim(),
    account_id: (s.cloudflare_account_id || '').trim(),
    zone_id: (s.cloudflare_zone_id || '').trim(),
    domain: (s.cloudflare_tunnel_domain || '').trim() || '9x.design',
  };
}

function requireCfConfig() {
  const c = getCfConfig();
  if (!c.token) throw new Error('Cloudflare API token not configured (set it in admin Settings)');
  if (!c.account_id) throw new Error('Cloudflare account_id missing (run auto-discover first)');
  if (!c.zone_id) throw new Error('Cloudflare zone_id missing (run auto-discover first)');
  return c;
}

// ====== Auto-discovery (one-time setup) ======

/** Call after admin pastes token — fetches account_id and zone_id for the configured domain. */
async function autoDiscover(token, domain) {
  domain = (domain || '9x.design').trim();
  // 1. Account (should be exactly one for a scoped token)
  const accounts = await cfApi(token, 'GET', '/accounts');
  if (!accounts || !accounts.length) throw new Error('No Cloudflare accounts accessible with this token');
  const account = accounts[0];
  // 2. Zone matching the domain
  const zones = await cfApi(token, 'GET', `/zones?name=${encodeURIComponent(domain)}`);
  if (!zones || !zones.length) throw new Error(`Zone "${domain}" not found — add the domain to Cloudflare first`);
  const zone = zones[0];
  return { account_id: account.id, account_name: account.name, zone_id: zone.id, zone_name: zone.name };
}

// ====== Slug helpers ======
function slugifyMillName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'customer';
}

function uniqueSlug(base) {
  const data = db.getData();
  const used = new Set((data.licenses || []).filter(l => l.tunnel_slug).map(l => l.tunnel_slug));
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return base + '-' + Date.now();
}

// ====== Tunnel provisioning ======

/**
 * Create a Cloudflare Tunnel end-to-end for a license.
 * Returns: { slug, hostname, tunnel_id, tunnel_token, dns_record_id }
 */
async function provisionTunnel(license, targetPort = 8080) {
  const cfg = requireCfConfig();
  const slug = uniqueSlug(slugifyMillName(license.mill_name));
  const hostname = `${slug}.${cfg.domain}`;
  const tunnelName = `millentry-${slug}`;

  // 1. Create named tunnel
  const tunnel = await cfApi(cfg.token, 'POST', `/accounts/${cfg.account_id}/cfd_tunnel`, {
    name: tunnelName,
    config_src: 'cloudflare',  // managed config (we can push ingress rules via API)
  });

  // 2. Get connector token (installer uses this to start cloudflared service)
  const tokenResult = await cfApi(cfg.token, 'GET', `/accounts/${cfg.account_id}/cfd_tunnel/${tunnel.id}/token`);
  // tokenResult is directly the token string for this endpoint
  const tunnelToken = typeof tokenResult === 'string' ? tokenResult : (tokenResult && tokenResult.token) || '';
  if (!tunnelToken) throw new Error('Could not fetch tunnel connector token');

  // 3. Configure ingress rules (public hostname → customer's local port 8080)
  await cfApi(cfg.token, 'PUT', `/accounts/${cfg.account_id}/cfd_tunnel/${tunnel.id}/configurations`, {
    config: {
      ingress: [
        { hostname, service: `http://localhost:${targetPort}` },
        { service: 'http_status:404' }, // catch-all required by Cloudflare
      ],
    },
  });

  // 4. Create DNS CNAME (proxied so traffic goes through Cloudflare)
  const dns = await cfApi(cfg.token, 'POST', `/zones/${cfg.zone_id}/dns_records`, {
    type: 'CNAME',
    name: slug,   // Cloudflare auto-appends the zone domain
    content: `${tunnel.id}.cfargotunnel.com`,
    proxied: true,
    ttl: 1,       // 1 = automatic
    comment: `MillEntry tunnel for ${license.mill_name} (${license.key})`,
  });

  return {
    slug, hostname,
    tunnel_id: tunnel.id,
    tunnel_token: tunnelToken,
    dns_record_id: dns.id,
    target_port: targetPort,
  };
}

/** Delete tunnel + DNS record (on license revoke / customer offboarding). Best-effort: ignores missing resources. */
async function deleteTunnel(license) {
  const cfg = getCfConfig();
  if (!cfg.token) return { skipped: true };
  const errors = [];
  if (license.tunnel_dns_record_id) {
    try { await cfApi(cfg.token, 'DELETE', `/zones/${cfg.zone_id}/dns_records/${license.tunnel_dns_record_id}`); }
    catch (e) { errors.push('DNS: ' + e.message); }
  }
  if (license.tunnel_id) {
    // Must delete tunnel connector first (force cleanup)
    try { await cfApi(cfg.token, 'DELETE', `/accounts/${cfg.account_id}/cfd_tunnel/${license.tunnel_id}?cascade=true`); }
    catch (e) { errors.push('Tunnel: ' + e.message); }
  }
  return { success: errors.length === 0, errors };
}

module.exports = {
  autoDiscover,
  provisionTunnel,
  deleteTunnel,
  slugifyMillName,
  uniqueSlug,
  getCfConfig,
};
