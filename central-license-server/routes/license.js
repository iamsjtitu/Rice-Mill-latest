const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { verifyLicenseFormat } = require('../utils/licenseGen');

const router = express.Router();

// PUBLIC — called by customer desktop-apps (no super admin auth)
// ================================================================

// GET /api/license/lookup/:key — read-only preview (shows mill name without activating)
router.get('/lookup/:key', (req, res) => {
  const upperKey = String(req.params.key || '').trim().toUpperCase();
  // Skip strict format check — DB lookup is source of truth (admin can create keys with any format via custom_key)
  const data = db.getData();
  const lic = data.licenses.find(l => l.key === upperKey);
  if (!lic) return res.status(404).json({ error: 'License key not found' });
  if (lic.status !== 'active') {
    const body = { error: `License is ${lic.status}`, status: lic.status };
    if (lic.status === 'suspended' && lic.suspension_reason) body.suspension_reason = lic.suspension_reason;
    return res.status(403).json(body);
  }
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) return res.status(403).json({ error: 'License expired' });
  res.json({
    customer_name: lic.customer_name,
    mill_name: lic.mill_name,
    plan: lic.plan,
    expires_at: lic.expires_at,
    is_master: !!lic.is_master,
  });
});

// POST /api/license/activate
// Body: { key, machine_fingerprint, pc_info }
// Flow: Loose binding — any NEW fingerprint replaces the old active machine (previous PC gets kicked off)
router.post('/activate', (req, res) => {
  const { key, machine_fingerprint, pc_info } = req.body || {};
  if (!key || !machine_fingerprint) return res.status(400).json({ error: 'key and machine_fingerprint required' });

  const upperKey = String(key).trim().toUpperCase();
  // Skip strict format check — DB lookup is source of truth (admin can create keys with any format via custom_key)

  const data = db.getData();
  const lic = data.licenses.find(l => l.key === upperKey);
  if (!lic) return res.status(404).json({ error: 'License key not found' });
  if (lic.status !== 'active') {
    const body = { error: `License is ${lic.status}`, status: lic.status };
    if (lic.status === 'suspended' && lic.suspension_reason) body.suspension_reason = lic.suspension_reason;
    return res.status(403).json(body);
  }
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) return res.status(403).json({ error: 'License expired' });

  // Loose binding: Kick existing active activations, create new one for this machine
  (data.activations || []).forEach(a => {
    if (a.license_id === lic.id && a.machine_fingerprint !== machine_fingerprint) a.active = false;
  });
  let act = data.activations.find(a => a.license_id === lic.id && a.machine_fingerprint === machine_fingerprint);
  if (!act) {
    act = {
      id: uuidv4(),
      license_id: lic.id,
      machine_fingerprint,
      pc_info: pc_info || {},
      activated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      active: true,
    };
    data.activations.push(act);
  } else {
    act.active = true;
    act.pc_info = pc_info || act.pc_info;
    act.last_seen_at = new Date().toISOString();
  }
  db.saveImmediate();

  res.json({
    success: true,
    license: {
      key: lic.key,
      customer_name: lic.customer_name,
      mill_name: lic.mill_name,
      plan: lic.plan,
      expires_at: lic.expires_at,
      is_master: !!lic.is_master,
    },
    activation_id: act.id,
    offline_grace_days: 30,
  });
});

// POST /api/license/heartbeat
// Body: { key, machine_fingerprint }
// Called every 24h by desktop-app. If the machine has been kicked off by another activation, returns active=false.
router.post('/heartbeat', (req, res) => {
  const { key, machine_fingerprint } = req.body || {};
  if (!key || !machine_fingerprint) return res.status(400).json({ error: 'key and machine_fingerprint required' });
  const data = db.getData();
  const lic = data.licenses.find(l => l.key === String(key).trim().toUpperCase());
  if (!lic) return res.status(404).json({ active: false, error: 'License not found' });
  if (lic.status !== 'active') {
    const body = { active: false, error: `License ${lic.status}`, status: lic.status };
    if (lic.status === 'suspended' && lic.suspension_reason) body.suspension_reason = lic.suspension_reason;
    return res.status(403).json(body);
  }
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) return res.status(403).json({ active: false, error: 'License expired' });

  const act = data.activations.find(a => a.license_id === lic.id && a.machine_fingerprint === machine_fingerprint);
  if (!act) return res.status(404).json({ active: false, error: 'No activation for this machine — re-activate' });
  if (!act.active) return res.json({ active: false, error: 'License in use on another PC' });

  act.last_seen_at = new Date().toISOString();
  db.saveImmediate();
  res.json({ active: true, expires_at: lic.expires_at, is_master: !!lic.is_master, offline_grace_days: 30 });
});

// POST /api/license/provision-cloud-access
// Body: { key, machine_fingerprint }
// Called when customer presses "Enable Cloud Access". Provisions a tunnel
// (or returns existing one) and sends back the tunnel token + hostname.
// Authenticated by the license key + machine_fingerprint (must match an active activation).
router.post('/provision-cloud-access', async (req, res) => {
  const { key, machine_fingerprint } = req.body || {};
  if (!key || !machine_fingerprint) return res.status(400).json({ error: 'key and machine_fingerprint required' });
  const data = db.getData();
  const lic = data.licenses.find(l => l.key === String(key).trim().toUpperCase());
  if (!lic) return res.status(404).json({ error: 'License not found' });
  if (lic.status !== 'active') return res.status(403).json({ error: `License ${lic.status}` });
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) return res.status(403).json({ error: 'License expired' });
  const act = data.activations.find(a => a.license_id === lic.id && a.machine_fingerprint === machine_fingerprint);
  if (!act || !act.active) return res.status(403).json({ error: 'This machine is not actively licensed' });

  // If tunnel already exists → return it (idempotent)
  if (lic.tunnel_id && lic.tunnel_token && lic.tunnel_hostname) {
    return res.json({
      success: true, existed: true,
      hostname: lic.tunnel_hostname,
      tunnel_token: lic.tunnel_token,
      slug: lic.tunnel_slug,
    });
  }

  // Provision new tunnel via Cloudflare
  try {
    const cloudflare = require('../utils/cloudflare');
    const info = await cloudflare.provisionTunnel(lic);
    lic.tunnel_slug = info.slug;
    lic.tunnel_hostname = info.hostname;
    lic.tunnel_id = info.tunnel_id;
    lic.tunnel_token = info.tunnel_token;
    lic.tunnel_dns_record_id = info.dns_record_id;
    lic.tunnel_target_port = info.target_port;
    lic.tunnel_provisioned_at = new Date().toISOString();
    db.saveImmediate();
    res.json({
      success: true, existed: false,
      hostname: info.hostname,
      tunnel_token: info.tunnel_token,
      slug: info.slug,
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// GET /api/license/cloud-access-status/:key — read-only status check for the Desktop App UI
router.get('/cloud-access-status/:key', (req, res) => {
  const data = db.getData();
  const lic = data.licenses.find(l => l.key === String(req.params.key).trim().toUpperCase());
  if (!lic) return res.status(404).json({ provisioned: false, error: 'License not found' });
  if (!lic.tunnel_hostname) return res.json({ provisioned: false });
  res.json({
    provisioned: true,
    hostname: lic.tunnel_hostname,
    slug: lic.tunnel_slug,
    provisioned_at: lic.tunnel_provisioned_at,
    externally_configured: !!lic.tunnel_externally_configured,
  });
});

module.exports = router;
