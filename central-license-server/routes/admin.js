const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { generateLicenseKey } = require('../utils/licenseGen');
const { requireSuperAdmin } = require('../middleware/auth');
const notifier = require('../utils/notifier');

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
  const key = s.whatsapp_api_key || '';
  res.json({
    whatsapp_api_key_masked: key ? (key.slice(0, 4) + '•'.repeat(Math.max(0, key.length - 8)) + key.slice(-4)) : '',
    whatsapp_api_key_set: !!key,
    whatsapp_cc: s.whatsapp_cc || '91',
    whatsapp_enabled: s.whatsapp_enabled !== false,
    updated_at: s.updated_at || null,
    // Also expose env-var fallback status so user knows if .env is the source
    env_key_available: !!process.env.NOTIFY_WA_API_KEY,
  });
});

// PUT /api/admin/settings — update WhatsApp config
router.put('/settings', (req, res) => {
  const data = db.getData();
  if (!data.settings) data.settings = {};
  const { whatsapp_api_key, whatsapp_cc, whatsapp_enabled } = req.body || {};
  // Only update api_key if a non-empty string is provided (prevents accidental wipe on partial save)
  if (typeof whatsapp_api_key === 'string' && whatsapp_api_key.trim()) {
    data.settings.whatsapp_api_key = whatsapp_api_key.trim();
  }
  if (typeof whatsapp_cc === 'string' && whatsapp_cc.trim()) {
    data.settings.whatsapp_cc = whatsapp_cc.trim().replace(/[^0-9]/g, '') || '91';
  }
  if (typeof whatsapp_enabled === 'boolean') {
    data.settings.whatsapp_enabled = whatsapp_enabled;
  }
  data.settings.updated_at = new Date().toISOString();
  db.saveImmediate();
  res.json({ success: true });
});

// DELETE /api/admin/settings/whatsapp-key — wipe the API key (separate endpoint for safety)
router.delete('/settings/whatsapp-key', (req, res) => {
  const data = db.getData();
  if (!data.settings) data.settings = {};
  data.settings.whatsapp_api_key = '';
  data.settings.updated_at = new Date().toISOString();
  db.saveImmediate();
  res.json({ success: true });
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
