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

// POST /api/license/recover-by-fingerprint
// Body: { fingerprints: [<current>, <minimal>, <legacy_v1>] }
// Used by desktop apps when local cache decrypts fail (after machine fingerprint
// shifted). The client sends ALL its candidate fingerprints; server checks if ANY
// matches an existing active activation. If yes, returns the license key so the
// client can re-activate WITHOUT requiring the user to remember & re-type their key.
//
// Security: only returns the key if the requesting machine ALREADY has an activation
// recorded against one of these fingerprints (i.e., this isn't a brute-force attack —
// you'd need to actually be on the machine that previously activated).
router.post('/recover-by-fingerprint', (req, res) => {
  const fingerprints = Array.isArray(req.body?.fingerprints) ? req.body.fingerprints : [];
  if (fingerprints.length === 0) return res.status(400).json({ error: 'fingerprints array required' });

  const data = db.getData();
  // Find ANY active activation matching any of the candidate fingerprints
  let match = null;
  for (const fp of fingerprints) {
    if (!fp || typeof fp !== 'string') continue;
    const act = data.activations.find(a => a.active && a.machine_fingerprint === fp);
    if (act) { match = act; break; }
  }
  if (!match) return res.status(404).json({ error: 'No active activation found for any of the provided fingerprints' });

  const lic = data.licenses.find(l => l.id === match.license_id);
  if (!lic) return res.status(404).json({ error: 'License record not found' });
  if (lic.status !== 'active') return res.status(403).json({ error: `License is ${lic.status}` });
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) return res.status(403).json({ error: 'License expired' });

  res.json({
    success: true,
    key: lic.key,
    customer_name: lic.customer_name,
    mill_name: lic.mill_name,
    plan: lic.plan,
    expires_at: lic.expires_at,
    is_master: !!lic.is_master,
    matched_fingerprint: match.machine_fingerprint,
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

// ============ OFFLINE ACTIVATION (.mlic) ============

// GET /api/license/public-key — returns the Ed25519 public key (PEM) used to verify .mlic files.
// This endpoint is INTENTIONALLY unauthenticated — desktop apps need to fetch it on first run
// if their embedded copy is missing/outdated.
router.get('/public-key', (req, res) => {
  const mlicSigner = require('../utils/mlic-signer');
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    public_key: mlicSigner.getPublicKey(),
    algorithm: 'ed25519',
    format: 'spki-pem',
  });
});

// POST /api/license/activate-mlic — bind a signed .mlic payload to a specific machine.
// Body: { mlic, machine_fingerprint, pc_info }
// The server authoritatively marks the license as "activated on this machine" in its DB,
// same as /activate but skips the key-entry step. Used when customer imports .mlic online.
router.post('/activate-mlic', (req, res) => {
  const { mlic, machine_fingerprint, pc_info } = req.body || {};
  if (!mlic || !machine_fingerprint) return res.status(400).json({ error: 'mlic payload and machine_fingerprint required' });
  const mlicSigner = require('../utils/mlic-signer');
  const verify = mlicSigner.verifyMlic(mlic);
  if (!verify.valid) return res.status(400).json({ error: 'Invalid .mlic signature: ' + verify.reason });
  const key = (mlic.license && mlic.license.key || '').trim().toUpperCase();
  if (!key) return res.status(400).json({ error: 'Malformed .mlic — no license key' });
  const data = db.getData();
  const lic = data.licenses.find(l => l.key === key);
  if (!lic) return res.status(404).json({ error: 'License no longer exists on central server' });
  if (lic.status !== 'active') {
    const body = { error: `License is ${lic.status}`, status: lic.status };
    if (lic.status === 'suspended' && lic.suspension_reason) body.suspension_reason = lic.suspension_reason;
    return res.status(403).json(body);
  }
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) return res.status(403).json({ error: 'License expired' });

  // Deactivate other machines (loose binding — .mlic gets priority, same as activate)
  (data.activations || []).forEach(a => {
    if (a.license_id === lic.id && a.machine_fingerprint !== machine_fingerprint) a.active = false;
  });
  let act = data.activations.find(a => a.license_id === lic.id && a.machine_fingerprint === machine_fingerprint);
  if (!act) {
    act = {
      id: require('uuid').v4(),
      license_id: lic.id,
      machine_fingerprint,
      pc_info: pc_info || {},
      activated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      active: true,
      via_mlic: true,
      mlic_id: mlic.mlic_id || null,
    };
    data.activations.push(act);
  } else {
    act.active = true;
    act.pc_info = pc_info || act.pc_info;
    act.last_seen_at = new Date().toISOString();
    act.via_mlic = true;
    act.mlic_id = mlic.mlic_id || act.mlic_id;
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

module.exports = router;
