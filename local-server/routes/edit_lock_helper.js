/**
 * 5-Minute Edit Lock helper — applied across all transactional modules.
 * Mirrors /app/backend/services/edit_lock.py
 *
 * Rules:
 * - Admin: always allowed
 * - Non-admin: must be the creator AND within 5 min if lock is enabled
 * - If lock disabled (Settings toggle OFF): only ownership check applies
 * - Default: lock ENABLED
 */

const FIVE_MIN_MS = 5 * 60 * 1000;

function isEditLockEnabled(database) {
  if (!database || !database.data) return true;
  const settings = database.data.app_settings || [];
  const doc = settings.find(s => s.setting_id === 'edit_window');
  if (!doc) return true; // Default ON
  return doc.enabled !== false;
}

function setEditLockEnabled(database, enabled) {
  if (!database.data.app_settings) database.data.app_settings = [];
  const settings = database.data.app_settings;
  const idx = settings.findIndex(s => s.setting_id === 'edit_window');
  const doc = {
    setting_id: 'edit_window',
    enabled: !!enabled,
    updated_at: new Date().toISOString()
  };
  if (idx >= 0) settings[idx] = doc; else settings.push(doc);
  if (database.saveImmediate) database.saveImmediate(); else database.save();
  return doc;
}

/**
 * Returns { allowed: boolean, message: string }
 */
function checkEditLock(entry, username, role, database) {
  if ((role || '').toLowerCase() === 'admin') {
    return { allowed: true, message: 'Admin access' };
  }

  const createdBy = entry.created_by || entry.createdBy || '';
  if (createdBy && username && createdBy !== username) {
    return { allowed: false, message: 'Aap sirf apni entry edit/delete kar sakte hain' };
  }

  if (!isEditLockEnabled(database)) {
    return { allowed: true, message: 'Edit lock disabled in Settings' };
  }

  const createdAtRaw = entry.created_at || entry.createdAt || '';
  if (!createdAtRaw) {
    return { allowed: true, message: 'No creation timestamp — lock skipped' };
  }

  try {
    const createdAt = new Date(createdAtRaw);
    if (isNaN(createdAt.getTime())) {
      return { allowed: true, message: 'Invalid timestamp — lock skipped' };
    }
    const elapsed = Date.now() - createdAt.getTime();
    if (elapsed > FIVE_MIN_MS) {
      const mins = Math.floor(elapsed / 60000);
      return {
        allowed: false,
        message: `5 minute se zyada ho gaye (${mins} min) — ab edit/delete nahi kar sakte. Admin se contact karein.`
      };
    }
  } catch (e) {
    return { allowed: true, message: 'Timestamp parse fail — lock skipped' };
  }

  return { allowed: true, message: 'Edit allowed' };
}

module.exports = { isEditLockEnabled, setEditLockEnabled, checkEditLock };
