const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { generateLicenseKey } = require('../utils/licenseGen');
const { requireSuperAdmin } = require('../middleware/auth');
const notifier = require('../utils/notifier');
const cloudflare = require('../utils/cloudflare');
const selfUpdater = require('../utils/self-updater');

const router = express.Router();

// Fire-and-forget WhatsApp send — never block the HTTP response
function fireNotify(promise, label) {
  Promise.resolve(promise).then(r => {
    if (r && r.success) console.log(`[notifier:${label}] sent`, r.statusCode || '');
    else if (r && r.skipped) console.log(`[notifier:${label}] skipped (${r.reason})`);
    else console.warn(`[notifier:${label}] failed`, (r && (r.error || r.reason)) || '');
  }).catch(e => console.warn(`[notifier:${label}] error`, e.message));
}

// All admin routes require super admin authentication
router.use(requireSuperAdmin);

// ============ LICENSES CRUD ============

// GET /api/admin/licenses — list all with filters
router.get('/licenses', (req, res) => {
  const data = db.getData();
  const { status, search } = req.query;
  let rows = [...data.licenses];
  if (status) rows = rows.filter(l => l.status === status);
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter(l =>
      (l.customer_name || '').toLowerCase().includes(q) ||
      (l.mill_name || '').toLowerCase().includes(q) ||
      (l.contact || '').toLowerCase().includes(q) ||
      (l.key || '').toLowerCase().includes(q)
    );
  }
  rows.sort((a, b) => String(b.issued_at || '').localeCompare(String(a.issued_at || '')));

  // Attach active activation info
  const activations = data.activations || [];
  rows = rows.map(l => {
    const act = activations.find(a => a.license_id === l.id && a.active);
    return {
      ...l,
      current_machine: act ? act.machine_fingerprint : null,
      current_pc: act ? act.pc_info : null,
      last_seen_at: act ? act.last_seen_at : null,
    };
  });

  res.json(rows);
});

// POST /api/admin/licenses — create new license
router.post('/licenses', (req, res) => {
  const { customer_name, mill_name, contact, plan, expires_at, notes, custom_key } = req.body || {};
  if (!customer_name || !mill_name) return res.status(400).json({ error: 'customer_name and mill_name required' });
  const data = db.getData();
  const key = (custom_key || generateLicenseKey()).toUpperCase();
  if (data.licenses.some(l => l.key === key)) return res.status(409).json({ error: 'Key already exists' });
  const license = {
    id: uuidv4(),
    key,
    customer_name: String(customer_name).trim(),
    mill_name: String(mill_name).trim(),
    contact: String(contact || '').trim(),
    plan: plan || 'lifetime',  // 'lifetime' | 'yearly' | 'trial'
    status: 'active',
    issued_at: new Date().toISOString(),
    expires_at: expires_at || null,  // null = never expires (lifetime)
    notes: String(notes || '').trim(),
    revoked_at: null,
    is_master: false,
  };
  data.licenses.push(license);
  db.saveImmediate();
  fireNotify(notifier.notifyActivated(license), `created:${license.key}`);
  res.json({ success: true, license });
});

// PUT /api/admin/licenses/:id — update
router.put('/licenses/:id', (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  const { customer_name, mill_name, contact, expires_at, notes, status } = req.body || {};
  if (customer_name !== undefined) lic.customer_name = String(customer_name).trim();
  if (mill_name !== undefined) lic.mill_name = String(mill_name).trim();
  if (contact !== undefined) lic.contact = String(contact).trim();
  if (expires_at !== undefined) {
    const prevExpiry = lic.expires_at ? new Date(lic.expires_at).getTime() : 0;
    const newExpiry = expires_at ? new Date(expires_at).getTime() : 0;
    lic.expires_at = expires_at;
    // License renewed (pushed further in future) → clear notification flags so
    // fresh 7-day warning + expiry message can fire next cycle.
    if (!prevExpiry || newExpiry > prevExpiry) {
      lic.notified_7day = null;
      lic.notified_expired = null;
    }
  }
  if (notes !== undefined) lic.notes = String(notes).trim();
  if (status !== undefined) {
    const prevStatus = lic.status;
    lic.status = status;
    if (status === 'revoked' && prevStatus !== 'revoked') {
      lic.revoked_at = new Date().toISOString();
      fireNotify(notifier.notifyRevoked(lic), `revoked:${lic.key}`);
    }
    if (status === 'active' && prevStatus === 'revoked') {
      // Re-activation after revoke → clear revoked_at & notify customer
      lic.revoked_at = null;
      fireNotify(notifier.notifyActivated(lic), `reactivated:${lic.key}`);
    }
  }
  db.saveImmediate();
  res.json({ success: true, license: lic });
});

// POST /api/admin/licenses/:id/revoke
router.post('/licenses/:id/revoke', (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  const wasRevoked = lic.status === 'revoked';
  lic.status = 'revoked';
  lic.revoked_at = new Date().toISOString();
  // Deactivate all activations for this license
  (data.activations || []).forEach(a => { if (a.license_id === lic.id) a.active = false; });
  db.saveImmediate();
  if (!wasRevoked) fireNotify(notifier.notifyRevoked(lic), `revoked:${lic.key}`);
  res.json({ success: true, license: lic });
});

// POST /api/admin/licenses/:id/reset-machine — kick current active PC so customer can re-activate on new machine
router.post('/licenses/:id/reset-machine', (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  (data.activations || []).forEach(a => { if (a.license_id === lic.id) a.active = false; });
  db.saveImmediate();
  res.json({ success: true, message: 'Machine binding reset. Customer can re-activate on any PC.' });
});

// POST /api/admin/licenses/:id/test-notify — send a test WhatsApp to customer's number
router.post('/licenses/:id/test-notify', async (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  const kind = (req.body && req.body.kind) || 'activated';
  let r;
  if (kind === 'revoked') r = await notifier.notifyRevoked(lic);
  else if (kind === 'expiring') r = await notifier.notifyExpiringSoon(lic, 7);
  else if (kind === 'expired') r = await notifier.notifyExpired(lic);
  else r = await notifier.notifyActivated(lic);
  res.json({ success: !!(r && r.success), result: r });
});

// POST /api/admin/expiry-scan — manually trigger the daily expiry notification scan
router.post('/expiry-scan', async (req, res) => {
  const scheduler = require('../utils/expiry-scheduler');
  const result = await scheduler.runScan();
  res.json(result);
});

// POST /api/admin/licenses/:id/reset-notifications — clear notified flags (useful after renewing)
router.post('/licenses/:id/reset-notifications', (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  lic.notified_7day = null;
  lic.notified_expired = null;
  db.saveImmediate();
  res.json({ success: true });
});

// ============ SETTINGS (server-wide config) ============

// GET /api/admin/settings — returns config with API key masked for security
router.get('/settings', (req, res) => {
  const s = db.getData().settings || {};
  const mask = (k) => k ? (k.slice(0, 4) + '•'.repeat(Math.max(0, k.length - 8)) + k.slice(-4)) : '';
  const waKey = s.whatsapp_api_key || '';
  const cfKey = s.cloudflare_api_token || '';
  res.json({
    // WhatsApp
    whatsapp_api_key_masked: mask(waKey),
    whatsapp_api_key_set: !!waKey,
    whatsapp_cc: s.whatsapp_cc || '91',
    whatsapp_enabled: s.whatsapp_enabled !== false,
    env_key_available: !!process.env.NOTIFY_WA_API_KEY,
    // Cloudflare
    cloudflare_api_token_masked: mask(cfKey),
    cloudflare_api_token_set: !!cfKey,
    cloudflare_account_id: s.cloudflare_account_id || '',
    cloudflare_zone_id: s.cloudflare_zone_id || '',
    cloudflare_tunnel_domain: s.cloudflare_tunnel_domain || '9x.design',
    cloudflare_enabled: s.cloudflare_enabled !== false && !!cfKey,
    cloudflare_ready: !!(cfKey && s.cloudflare_account_id && s.cloudflare_zone_id),
    updated_at: s.updated_at || null,
  });
});

// PUT /api/admin/settings — update WhatsApp / Cloudflare config
router.put('/settings', (req, res) => {
  const data = db.getData();
  if (!data.settings) data.settings = {};
  const b = req.body || {};
  // WhatsApp
  if (typeof b.whatsapp_api_key === 'string' && b.whatsapp_api_key.trim()) data.settings.whatsapp_api_key = b.whatsapp_api_key.trim();
  if (typeof b.whatsapp_cc === 'string' && b.whatsapp_cc.trim()) data.settings.whatsapp_cc = b.whatsapp_cc.trim().replace(/[^0-9]/g, '') || '91';
  if (typeof b.whatsapp_enabled === 'boolean') data.settings.whatsapp_enabled = b.whatsapp_enabled;
  // Cloudflare
  if (typeof b.cloudflare_api_token === 'string' && b.cloudflare_api_token.trim()) data.settings.cloudflare_api_token = b.cloudflare_api_token.trim();
  if (typeof b.cloudflare_tunnel_domain === 'string' && b.cloudflare_tunnel_domain.trim()) data.settings.cloudflare_tunnel_domain = b.cloudflare_tunnel_domain.trim();
  if (typeof b.cloudflare_enabled === 'boolean') data.settings.cloudflare_enabled = b.cloudflare_enabled;
  data.settings.updated_at = new Date().toISOString();
  db.saveImmediate();
  res.json({ success: true });
});

// DELETE /api/admin/settings/whatsapp-key — wipe WhatsApp API key
router.delete('/settings/whatsapp-key', (req, res) => {
  const data = db.getData();
  if (!data.settings) data.settings = {};
  data.settings.whatsapp_api_key = '';
  data.settings.updated_at = new Date().toISOString();
  db.saveImmediate();
  res.json({ success: true });
});

// DELETE /api/admin/settings/cloudflare-token — wipe Cloudflare token (also clears discovered IDs)
router.delete('/settings/cloudflare-token', (req, res) => {
  const data = db.getData();
  if (!data.settings) data.settings = {};
  data.settings.cloudflare_api_token = '';
  data.settings.cloudflare_account_id = '';
  data.settings.cloudflare_zone_id = '';
  data.settings.updated_at = new Date().toISOString();
  db.saveImmediate();
  res.json({ success: true });
});

// POST /api/admin/settings/cloudflare-discover — auto-discover account + zone using saved/provided token
router.post('/settings/cloudflare-discover', async (req, res) => {
  const data = db.getData();
  const s = data.settings || (data.settings = {});
  const token = (req.body && req.body.token) || s.cloudflare_api_token;
  const domain = (req.body && req.body.domain) || s.cloudflare_tunnel_domain || '9x.design';
  if (!token) return res.status(400).json({ error: 'Cloudflare API token not set' });
  try {
    const info = await cloudflare.autoDiscover(token, domain);
    s.cloudflare_account_id = info.account_id;
    s.cloudflare_zone_id = info.zone_id;
    s.cloudflare_tunnel_domain = info.zone_name;
    s.updated_at = new Date().toISOString();
    db.saveImmediate();
    res.json({ success: true, ...info });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// POST /api/admin/settings/test-whatsapp — send a ping message to a phone number to verify config
router.post('/settings/test-whatsapp', async (req, res) => {
  const phone = req.body && req.body.phone;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  const cleaned = notifier.extractPhone(phone);
  if (!cleaned) return res.status(400).json({ error: 'Invalid phone number' });
  const text = '*MillEntry License Server*\n\n✓ WhatsApp configuration test successful.\n\nYour admin dashboard is correctly connected to 360Messenger. Customer notifications will now be delivered automatically.';
  const r = await notifier.sendMessage(cleaned, text);
  res.json({ success: !!(r && r.success), result: r, sent_to: cleaned });
});

// ============ CLOUDFLARE TUNNEL PROVISIONING ============

// POST /api/admin/licenses/:id/provision-tunnel — create or return existing tunnel for a license
router.post('/licenses/:id/provision-tunnel', async (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  // Already provisioned? return existing info
  if (lic.tunnel_id && lic.tunnel_slug) {
    return res.json({
      success: true, existed: true,
      slug: lic.tunnel_slug, hostname: lic.tunnel_hostname,
      tunnel_id: lic.tunnel_id, tunnel_token: lic.tunnel_token || null,
    });
  }
  try {
    const info = await cloudflare.provisionTunnel(lic);
    lic.tunnel_slug = info.slug;
    lic.tunnel_hostname = info.hostname;
    lic.tunnel_id = info.tunnel_id;
    lic.tunnel_token = info.tunnel_token;
    lic.tunnel_dns_record_id = info.dns_record_id;
    lic.tunnel_target_port = info.target_port;
    lic.tunnel_provisioned_at = new Date().toISOString();
    db.saveImmediate();
    res.json({ success: true, existed: false, ...info });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// DELETE /api/admin/licenses/:id/tunnel — delete the Cloudflare tunnel for a license
router.delete('/licenses/:id/tunnel', async (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  if (!lic.tunnel_id) return res.json({ success: true, note: 'No tunnel to delete' });
  const r = await cloudflare.deleteTunnel(lic);
  // Clear tunnel fields regardless (so admin can re-provision even if CF delete partially failed)
  lic.tunnel_slug = null;
  lic.tunnel_hostname = null;
  lic.tunnel_id = null;
  lic.tunnel_token = null;
  lic.tunnel_dns_record_id = null;
  lic.tunnel_provisioned_at = null;
  db.saveImmediate();
  res.json({ success: true, cloudflare_result: r });
});

// POST /api/admin/licenses/:id/mark-external-tunnel — mark tunnel as externally configured
// (for existing customers who already set up cloudflared manually). Does NOT touch Cloudflare.
router.post('/licenses/:id/mark-external-tunnel', (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  const { hostname, slug } = req.body || {};
  if (!hostname) return res.status(400).json({ error: 'hostname required' });
  lic.tunnel_hostname = String(hostname).trim();
  lic.tunnel_slug = String(slug || hostname.split('.')[0]).trim();
  lic.tunnel_externally_configured = true;
  lic.tunnel_provisioned_at = lic.tunnel_provisioned_at || new Date().toISOString();
  db.saveImmediate();
  res.json({ success: true, license: lic });
});

// ============ SELF-UPDATER ============

// GET /api/admin/server-update/check — returns current & latest SHA
router.get('/server-update/check', async (req, res) => {
  try {
    const info = await selfUpdater.checkForUpdate();
    res.json({ success: true, ...info });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// POST /api/admin/server-update/apply — downloads & applies latest, then restarts PM2
router.post('/server-update/apply', async (req, res) => {
  try {
    const result = await selfUpdater.applyUpdate();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/admin/server-update/apply-url — apply an update from an arbitrary tarball URL
// Body: { url: "https://paste.rs/xxxxx" }
router.post('/server-update/apply-url', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await selfUpdater.applyUpdateFromUrl(url);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/admin/server-update/settings — configure repo/branch/PAT
router.put('/server-update/settings', (req, res) => {
  const data = db.getData();
  const s = data.settings || (data.settings = {});
  const { repo, branch, github_pat, pm_name } = req.body || {};
  if (typeof repo === 'string' && repo.trim()) s.update_repo = repo.trim();
  if (typeof branch === 'string' && branch.trim()) s.update_branch = branch.trim();
  if (typeof github_pat === 'string' && github_pat.trim()) s.github_pat = github_pat.trim();
  if (typeof pm_name === 'string' && pm_name.trim()) s.update_pm_name = pm_name.trim();
  s.updated_at = new Date().toISOString();
  db.saveImmediate();
  res.json({ success: true });
});

// DELETE /api/admin/server-update/pat — wipe GitHub PAT
router.delete('/server-update/pat', (req, res) => {
  const data = db.getData();
  const s = data.settings || (data.settings = {});
  s.github_pat = '';
  s.updated_at = new Date().toISOString();
  db.saveImmediate();
  res.json({ success: true });
});

// GET /api/admin/stats — dashboard overview
router.get('/stats', (req, res) => {
  const data = db.getData();
  const now = new Date();
  const licenses = data.licenses || [];
  const activations = data.activations || [];
  const activeLicenses = licenses.filter(l => l.status === 'active');
  const expired = activeLicenses.filter(l => l.expires_at && new Date(l.expires_at) < now).length;
  const revoked = licenses.filter(l => l.status === 'revoked').length;
  const liveNow = activations.filter(a => {
    if (!a.active) return false;
    if (!a.last_seen_at) return false;
    return (Date.now() - new Date(a.last_seen_at).getTime()) < 10 * 60 * 1000; // last 10 min
  }).length;
  res.json({
    total_licenses: licenses.length,
    active_licenses: activeLicenses.length,
    expired_licenses: expired,
    revoked_licenses: revoked,
    currently_online: liveNow,
  });
});

module.exports = router;
