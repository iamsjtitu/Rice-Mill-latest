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
    if (status === 'active' && prevStatus === 'suspended') {
      // Re-activation after suspend → clear suspension fields & notify customer
      lic.suspended_at = null;
      lic.suspension_reason = null;
      lic.auto_suspended = null;
      fireNotify(notifier.notifyUnsuspended(lic), `unsuspended:${lic.key}`);
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

// POST /api/admin/licenses/:id/suspend — manually suspend with reason
router.post('/licenses/:id/suspend', (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  if (lic.status === 'revoked') return res.status(400).json({ error: 'Cannot suspend a revoked license' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'reason is required for suspension' });
  const wasSuspended = lic.status === 'suspended';
  lic.status = 'suspended';
  lic.suspended_at = new Date().toISOString();
  lic.suspension_reason = reason;
  lic.auto_suspended = false;
  // Deactivate all activations so next heartbeat from desktop halts the app
  (data.activations || []).forEach(a => { if (a.license_id === lic.id) a.active = false; });
  db.saveImmediate();
  if (!wasSuspended) fireNotify(notifier.notifySuspended(lic, reason), `suspended:${lic.key}`);
  res.json({ success: true, license: lic });
});

// POST /api/admin/licenses/:id/unsuspend — restore a suspended license
router.post('/licenses/:id/unsuspend', (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  if (lic.status !== 'suspended') return res.status(400).json({ error: `License is not suspended (currently: ${lic.status})` });
  lic.status = 'active';
  lic.suspended_at = null;
  lic.suspension_reason = null;
  lic.auto_suspended = null;
  db.saveImmediate();
  fireNotify(notifier.notifyUnsuspended(lic), `unsuspended:${lic.key}`);
  res.json({ success: true, license: lic });
});

// DELETE /api/admin/licenses/:id — permanently remove a license + its activations + notifications
router.delete('/licenses/:id', (req, res) => {
  const data = db.getData();
  const idx = data.licenses.findIndex(l => l.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'License not found' });
  const lic = data.licenses[idx];
  if (lic.is_master) return res.status(403).json({ error: 'Master license cannot be deleted' });

  // Optional: require the license key in request body as a sanity check (prevents accidental deletes)
  const confirmKey = String((req.body && req.body.confirm_key) || '').trim().toUpperCase();
  if (!confirmKey || confirmKey !== lic.key) {
    return res.status(400).json({ error: 'confirm_key must match the license key to delete' });
  }

  data.licenses.splice(idx, 1);
  // Cascade: remove related activations
  if (Array.isArray(data.activations)) {
    data.activations = data.activations.filter(a => a.license_id !== lic.id);
  }
  // Do NOT wipe notification logs — they're audit trail and survive deletion (historical record).
  db.saveImmediate();
  res.json({ success: true, deleted: { id: lic.id, key: lic.key, mill_name: lic.mill_name } });
});

// ============ OFFLINE .mlic GENERATION ============

// POST /api/admin/licenses/:id/generate-mlic — build & return signed .mlic payload
// Body: { note?, override_expires_at? }  (both optional)
router.post('/licenses/:id/generate-mlic', (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  if (lic.status !== 'active') return res.status(400).json({ error: `Cannot generate .mlic for a ${lic.status} license. Restore it first.` });
  const mlicSigner = require('../utils/mlic-signer');
  const payload = mlicSigner.signMlic(lic, {
    override_expires_at: req.body && req.body.override_expires_at,
    note: req.body && req.body.note,
  });

  // Persist to disk so it can be served publicly via token (for WhatsApp attachment URL).
  const mlicStore = require('../utils/mlic-store');
  const { token, download_url } = mlicStore.save(payload, { license_key: lic.key, mill_name: lic.mill_name });

  res.json({
    success: true,
    payload,
    mlic_id: payload.mlic_id,
    download_token: token,
    download_url,
    filename: `${lic.key}.mlic`,
    expires_in_hours: 48,
  });
});

// POST /api/admin/licenses/:id/send-mlic-whatsapp — generate (if not already), then push via 360Messenger.
// Body: { phone?, note? }  phone defaults to license.contact
router.post('/licenses/:id/send-mlic-whatsapp', async (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.id === req.params.id);
  if (!lic) return res.status(404).json({ error: 'License not found' });
  if (lic.status !== 'active') return res.status(400).json({ error: `Cannot send .mlic for a ${lic.status} license.` });
  const phoneRaw = (req.body && req.body.phone) || lic.contact;
  const phone = notifier.extractPhone(phoneRaw);
  if (!phone) return res.status(400).json({ error: 'No valid phone number on license or in request' });

  const mlicSigner = require('../utils/mlic-signer');
  const mlicStore = require('../utils/mlic-store');
  const payload = mlicSigner.signMlic(lic, { note: req.body && req.body.note });
  const { token, download_url } = mlicStore.save(payload, { license_key: lic.key, mill_name: lic.mill_name });

  const text = `*MillEntry Offline Activation File*\n\n` +
               `Mill: ${lic.mill_name}\nKey: ${lic.key}\n\n` +
               `Ye file attach hai — open karke apne MillEntry software me "Import Offline File" button ke through activate karo. Internet ki zaroorat nahi.\n\n` +
               `File 48 ghante tak valid hai.\n— t2@host9x.com`;

  const result = await notifier.sendMessage(phone, text, {
    license_id: lic.id,
    license_key: lic.key,
    event: 'mlic_sent',
    url: download_url, // forms part of the 360messenger payload when caller forwards it
  });
  // The sendMessage signature above accepts logCtx but not "url" directly — wire it through a custom call.
  // For file attachments we do a direct 360Messenger POST here (bypassing plain sendMessage):
  const waResult = await sendWhatsappWithAttachment(phone, text, download_url, {
    license_id: lic.id, license_key: lic.key, event: 'mlic_sent',
  });

  res.json({
    success: !!(waResult && waResult.success),
    sent_to: phone,
    download_url,
    mlic_id: payload.mlic_id,
    result: waResult,
  });
});

// Helper: send WhatsApp with an attachment URL via 360Messenger
// (plain notifier.sendMessage doesn't currently pass `url` field — we do it here once.)
function sendWhatsappWithAttachment(phone, text, attachmentUrl, logCtx) {
  const https = require('https');
  const { URLSearchParams } = require('url');
  return new Promise(resolve => {
    const s = db.getData().settings || {};
    const apiKey = (s.whatsapp_api_key || process.env.NOTIFY_WA_API_KEY || '').trim();
    const enabled = s.whatsapp_enabled !== false && !!apiKey;
    const finish = (result) => {
      if (logCtx) {
        notifier.logNotification({
          license_id: logCtx.license_id || null,
          license_key: logCtx.license_key || null,
          event: logCtx.event || 'mlic_sent',
          phone,
          status: result.success ? 'delivered' : (result.skipped ? 'skipped' : 'failed'),
          message_preview: (text || '').slice(0, 200),
          response: result.response ? JSON.stringify(result.response).slice(0, 300) : null,
          error: result.error || result.reason || null,
          status_code: result.statusCode || null,
        });
      }
      resolve(result);
    };
    if (!apiKey)  return finish({ success: false, skipped: true, reason: 'WhatsApp API key not configured' });
    if (!enabled) return finish({ success: false, skipped: true, reason: 'WhatsApp notifications disabled' });
    const form = new URLSearchParams({ phonenumber: phone, text, url: attachmentUrl });
    const body = form.toString();
    const req = https.request({
      hostname: 'api.360messenger.com', path: '/v2/sendMessage', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (r) => {
      let chunks = '';
      r.on('data', c => chunks += c);
      r.on('end', () => {
        try {
          const j = JSON.parse(chunks);
          finish({ success: !!(j.success || r.statusCode === 201), statusCode: r.statusCode, response: j });
        } catch { finish({ success: false, error: chunks.slice(0, 200) }); }
      });
    });
    req.on('error', e => finish({ success: false, error: e.message }));
    req.setTimeout(12000, () => { req.destroy(); finish({ success: false, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

// GET /api/admin/mlic-keys/status — returns whether keypair exists (for settings UI)
router.get('/mlic-keys/status', (req, res) => {
  const s = db.getData().settings || {};
  const mlicSigner = require('../utils/mlic-signer');
  // Ensure a key exists so first-request is idempotent
  mlicSigner.ensureKeypair();
  const s2 = db.getData().settings || {};
  res.json({
    ready: !!s2.mlic_public_key,
    generated_at: s2.mlic_keys_generated_at || null,
    public_key_preview: (s2.mlic_public_key || '').split('\n').slice(1, 2)[0]?.slice(0, 40) + '…',
  });
});

// POST /api/admin/mlic-keys/rotate — generate new keypair (invalidates all existing .mlic files)
router.post('/mlic-keys/rotate', (req, res) => {
  const mlicSigner = require('../utils/mlic-signer');
  const kp = mlicSigner.rotateKeypair();
  res.json({
    success: true,
    warning: 'All previously-issued .mlic files are now INVALID. Desktop apps must fetch new public key.',
    generated_at: new Date().toISOString(),
  });
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

// ============ NOTIFICATIONS LOG ============

// GET /api/admin/notifications?event=&status=&license=&limit=200
router.get('/notifications', (req, res) => {
  const data = db.getData();
  const rows = Array.isArray(data.notifications) ? data.notifications : [];
  const { event, status, license, q } = req.query;
  const limit = Math.min(1000, Math.max(10, parseInt(req.query.limit, 10) || 200));
  let filtered = rows;
  if (event)   filtered = filtered.filter(r => r.event === event);
  if (status)  filtered = filtered.filter(r => r.status === status);
  if (license) {
    const s = String(license).toUpperCase();
    filtered = filtered.filter(r => (r.license_key || '').toUpperCase().includes(s) || r.license_id === license);
  }
  if (q) {
    const s = String(q).toLowerCase();
    filtered = filtered.filter(r =>
      (r.license_key || '').toLowerCase().includes(s) ||
      (r.phone || '').toLowerCase().includes(s) ||
      (r.message_preview || '').toLowerCase().includes(s) ||
      (r.error || '').toLowerCase().includes(s)
    );
  }
  // Aggregate counts (total set, not just filtered page)
  const totals = rows.reduce((acc, r) => {
    acc.total++;
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, { total: 0 });
  res.json({
    rows: filtered.slice(0, limit),
    count_returned: Math.min(filtered.length, limit),
    count_matched: filtered.length,
    totals,
  });
});

// POST /api/admin/notifications/:id/retry — resend a failed/skipped notification using the same event + license
router.post('/notifications/:id/retry', async (req, res) => {
  const data = db.getData();
  const row = (data.notifications || []).find(n => n.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Notification not found' });
  const lic = row.license_id ? data.licenses.find(l => l.id === row.license_id) : null;
  if (!lic) return res.status(404).json({ error: 'License no longer exists — cannot retry' });
  let r;
  switch (row.event) {
    case 'revoked':     r = await notifier.notifyRevoked(lic); break;
    case 'expiring':    r = await notifier.notifyExpiringSoon(lic, 7); break;
    case 'expired':     r = await notifier.notifyExpired(lic); break;
    case 'activated':   r = await notifier.notifyActivated(lic); break;
    case 'suspended':   r = await notifier.notifySuspended(lic, lic.suspension_reason || 'Retry'); break;
    case 'unsuspended': r = await notifier.notifyUnsuspended(lic); break;
    default:
      return res.status(400).json({ error: `Event ${row.event} cannot be retried` });
  }
  res.json({ success: !!(r && r.success), result: r });
});

// DELETE /api/admin/notifications — clear entire log (with optional ?older_than_days=30)
router.delete('/notifications', (req, res) => {
  const data = db.getData();
  if (!Array.isArray(data.notifications)) data.notifications = [];
  const olderDays = parseInt(req.query.older_than_days, 10);
  if (isFinite(olderDays) && olderDays > 0) {
    const cutoff = Date.now() - olderDays * 24 * 60 * 60 * 1000;
    const before = data.notifications.length;
    data.notifications = data.notifications.filter(n => new Date(n.sent_at).getTime() >= cutoff);
    db.saveImmediate();
    return res.json({ success: true, deleted: before - data.notifications.length });
  }
  // Otherwise wipe everything
  const before = data.notifications.length;
  data.notifications = [];
  db.saveImmediate();
  res.json({ success: true, deleted: before });
});

// ============ WEBSITE DEPLOY PROXY (9x.design) ============
const websiteProxy = require('../utils/website-deploy-proxy');

// GET /api/admin/website-deploy/config — check if token + base URL are configured (no secrets leaked)
router.get('/website-deploy/config', (req, res) => {
  const s = db.getData().settings || {};
  res.json({
    token_set: !!(s.website_deploy_token && s.website_deploy_token.trim()),
    base: s.website_deploy_base || 'https://9x.design/api/deploy',
  });
});

// PUT /api/admin/website-deploy/config — save/update token + optional base override
router.put('/website-deploy/config', (req, res) => {
  const data = db.getData();
  const b = req.body || {};
  if (typeof b.token === 'string' && b.token.trim()) {
    data.settings.website_deploy_token = b.token.trim();
  }
  if (typeof b.base === 'string' && b.base.trim()) {
    data.settings.website_deploy_base = b.base.trim().replace(/\/+$/, '');
  }
  data.settings.updated_at = new Date().toISOString();
  db.saveImmediate();
  res.json({ success: true, token_set: !!data.settings.website_deploy_token, base: data.settings.website_deploy_base });
});

// DELETE /api/admin/website-deploy/config — forget the saved token
router.delete('/website-deploy/config', (req, res) => {
  const data = db.getData();
  data.settings.website_deploy_token = '';
  data.settings.updated_at = new Date().toISOString();
  db.saveImmediate();
  res.json({ success: true });
});

// GET  /api/admin/website-deploy/status  → proxies to 9x.design /status
router.get('/website-deploy/status', async (req, res) => {
  const r = await websiteProxy.forward('GET', '/status');
  res.status(r.status).json(r.body);
});

// POST /api/admin/website-deploy/run  → proxies to 9x.design /run (kicks off deploy)
router.post('/website-deploy/run', async (req, res) => {
  const r = await websiteProxy.forward('POST', '/run', { timeout: 15000 });
  res.status(r.status).json(r.body);
});

// GET  /api/admin/website-deploy/logs?tail=250 → proxies to 9x.design /logs
router.get('/website-deploy/logs', async (req, res) => {
  const tail = parseInt(req.query.tail, 10);
  const suffix = isFinite(tail) && tail > 0 ? '?tail=' + tail : '';
  const r = await websiteProxy.forward('GET', '/logs' + suffix, { timeout: 10000 });
  res.status(r.status).json(r.body);
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
    // Suspension
    suspend_on_expiry: s.suspend_on_expiry !== false,
    suspend_after_heartbeat_days: Number(s.suspend_after_heartbeat_days) || 0,
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
  // Suspension
  if (typeof b.suspend_on_expiry === 'boolean') data.settings.suspend_on_expiry = b.suspend_on_expiry;
  if (b.suspend_after_heartbeat_days !== undefined) {
    const n = parseInt(b.suspend_after_heartbeat_days, 10);
    data.settings.suspend_after_heartbeat_days = isFinite(n) && n >= 0 ? n : 0;
  }
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
  const r = await notifier.sendMessage(cleaned, text, { event: 'test' });
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
  const suspended = licenses.filter(l => l.status === 'suspended').length;
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
    suspended_licenses: suspended,
    currently_online: liveNow,
  });
});

module.exports = router;
