/**
 * Simple file-based JSON database — portable, zero-setup on any VPS.
 * Good for up to a few thousand licenses. Switch to MongoDB later if needed.
 */
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'database.json');

const defaultData = {
  super_admins: [],     // {id, email, password_hash, created_at}
  licenses: [],         // {id, key, customer_name, mill_name, contact, plan, status, issued_at, expires_at, notes, revoked_at}
  activations: [],      // {id, license_id, machine_fingerprint, pc_info, activated_at, last_seen_at, active}
  settings: {           // Server-wide config (editable from admin dashboard)
    whatsapp_api_key: '',     // 360Messenger API key
    whatsapp_cc: '91',        // default country code
    whatsapp_enabled: false,  // master switch (auto-true when key present)
    cloudflare_api_token: '', // Cloudflare API token (scoped: Tunnel Edit + DNS Edit)
    cloudflare_account_id: '',// auto-discovered on first token save
    cloudflare_zone_id: '',   // auto-discovered on first token save
    cloudflare_tunnel_domain: '9x.design',
    cloudflare_enabled: false,// master switch for tunnel auto-provisioning
    updated_at: null,
  },
  meta: { version: 1, created_at: new Date().toISOString() },
};

let data = null;
let saveTimer = null;

function load() {
  if (!fs.existsSync(DB_FILE)) {
    data = JSON.parse(JSON.stringify(defaultData));
    save();
    return data;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    data = JSON.parse(raw);
    // Ensure all required keys exist (migration for older DB files)
    for (const k of Object.keys(defaultData)) {
      if (data[k] === undefined) {
        data[k] = Array.isArray(defaultData[k]) ? [] : JSON.parse(JSON.stringify(defaultData[k]));
      }
    }
    // settings: back-fill any missing individual keys (when DB was created with partial settings)
    if (data.settings && typeof data.settings === 'object') {
      for (const k of Object.keys(defaultData.settings)) {
        if (data.settings[k] === undefined) data.settings[k] = defaultData.settings[k];
      }
    }
    return data;
  } catch (e) {
    console.error('[DB] Failed to parse DB file, creating fresh:', e.message);
    data = JSON.parse(JSON.stringify(defaultData));
    save();
    return data;
  }
}

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB] Save failed:', e.message);
    }
  }, 100);
}

function saveImmediate() {
  if (saveTimer) clearTimeout(saveTimer);
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getData() {
  if (!data) load();
  return data;
}

module.exports = { load, save, saveImmediate, getData };
