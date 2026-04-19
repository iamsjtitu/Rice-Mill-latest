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
    // Ensure all required keys exist
    for (const k of Object.keys(defaultData)) {
      if (!data[k]) data[k] = Array.isArray(defaultData[k]) ? [] : defaultData[k];
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
