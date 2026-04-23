/**
 * Offline Activation File (.mlic) — Cryptographic Sign + Verify Layer
 *
 * Uses Ed25519 (native to Node.js >= 12) for signing offline activation files.
 *
 * Lifecycle:
 *   1. Server boots → if no keypair in settings, auto-generate & persist.
 *   2. Public key is PUBLICLY readable via GET /api/license/public-key.
 *   3. Private key NEVER leaves the server (never logged, never exposed via API).
 *   4. Admin generates .mlic for a customer → JSON blob signed with private key.
 *   5. Desktop app verifies blob with embedded public key → creates activation.
 *
 * Rotation: keys are meant to last forever; if compromised, rotate via
 *           DELETE /api/admin/settings/mlic-keys then server boots a new pair.
 *           All existing .mlic files become invalid (feature, not bug).
 */
const crypto = require('crypto');
const db = require('../database');

function ensureKeypair() {
  const data = db.getData();
  const s = data.settings || (data.settings = {});
  if (s.mlic_public_key && s.mlic_private_key) return { pub: s.mlic_public_key, priv: s.mlic_private_key };
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  s.mlic_public_key = publicKey.export({ type: 'spki', format: 'pem' });
  s.mlic_private_key = privateKey.export({ type: 'pkcs8', format: 'pem' });
  s.mlic_keys_generated_at = new Date().toISOString();
  db.saveImmediate();
  console.log('[mlic-signer] generated new Ed25519 keypair');
  return { pub: s.mlic_public_key, priv: s.mlic_private_key };
}

function getPublicKey() {
  return ensureKeypair().pub;
}

/**
 * Build a signed .mlic payload for a given license.
 * @param {Object} license - full license object from data.licenses[]
 * @param {Object} opts - { override_expires_at?, note? }
 * @returns {Object} payload JSON (serialize to file as-is)
 */
function signMlic(license, opts = {}) {
  const { priv } = ensureKeypair();
  const payload = {
    // What the customer is being given
    license: {
      key:            license.key,
      customer_name:  license.customer_name,
      mill_name:      license.mill_name,
      contact:        license.contact || null,
      plan:           license.plan,
      issued_at:      license.issued_at,
      expires_at:     opts.override_expires_at || license.expires_at || null,
      is_master:      !!license.is_master,
    },
    // Metadata
    mlic_version:   1,
    signed_at:      new Date().toISOString(),
    // Unique ID prevents replay / tracking
    mlic_id:        crypto.randomUUID(),
    // Bind-on-first-use — desktop app records the first machine fingerprint
    binding_mode:   'first_use',
    note:           opts.note || null,
  };
  const canonical = canonicalize(payload);
  const privKey = crypto.createPrivateKey(priv);
  const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), privKey);
  payload.signature = signature.toString('base64');
  payload.signature_alg = 'ed25519';
  return payload;
}

/** Produce a deterministic JSON string (recursively sorted keys) for signing. */
function canonicalize(obj) {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/**
 * Verify a payload. Returns { valid, reason? }.
 * Exposed mainly for server-side "regenerate" flow or debugging.
 */
function verifyMlic(payload, publicKeyPem) {
  try {
    if (!payload || !payload.signature || payload.signature_alg !== 'ed25519') {
      return { valid: false, reason: 'Missing signature or unsupported algorithm' };
    }
    const { signature, signature_alg, ...rest } = payload;
    const canonical = canonicalize(rest);
    const pub = crypto.createPublicKey(publicKeyPem || ensureKeypair().pub);
    const sigBuf = Buffer.from(signature, 'base64');
    const ok = crypto.verify(null, Buffer.from(canonical, 'utf8'), pub, sigBuf);
    return ok ? { valid: true } : { valid: false, reason: 'Signature mismatch' };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

/** Rotate the keypair (destructive — all prior .mlic files become invalid). */
function rotateKeypair() {
  const data = db.getData();
  const s = data.settings || (data.settings = {});
  delete s.mlic_public_key;
  delete s.mlic_private_key;
  delete s.mlic_keys_generated_at;
  db.saveImmediate();
  return ensureKeypair();
}

module.exports = { ensureKeypair, getPublicKey, signMlic, verifyMlic, rotateKeypair, canonicalize, sortKeys };
