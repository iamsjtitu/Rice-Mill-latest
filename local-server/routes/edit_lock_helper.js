/**
 * Edit Lock helper — applied across all transactional modules.
 * Mirrors /app/backend/services/edit_lock.py
 *
 * Rules:
 * - Admin: always allowed
 * - Non-admin: must be the creator AND within configured duration if lock is enabled
 * - If lock disabled (Settings toggle OFF): only ownership check applies
 * - Default: enabled=true, duration=5 minutes
 */

const DEFAULT_DURATION_MIN = 5;

function getEditWindowSettings(database) {
  if (!database || !database.data) return { enabled: true, duration_minutes: DEFAULT_DURATION_MIN };
  const settings = database.data.app_settings || [];
  const doc = settings.find(s => s.setting_id === 'edit_window');
  if (!doc) return { enabled: true, duration_minutes: DEFAULT_DURATION_MIN };
  let dur = parseInt(doc.duration_minutes, 10);
  if (!Number.isFinite(dur) || dur < 1) dur = DEFAULT_DURATION_MIN;
  if (dur > 1440) dur = 1440;
  return { enabled: doc.enabled !== false, duration_minutes: dur };
}

function isEditLockEnabled(database) {
  return getEditWindowSettings(database).enabled;
}

function setEditWindowSettings(database, enabled, durationMinutes) {
  if (!database.data.app_settings) database.data.app_settings = [];
  const settings = database.data.app_settings;
  const existing = settings.find(s => s.setting_id === 'edit_window') || {};
  let dur = existing.duration_minutes || DEFAULT_DURATION_MIN;
  if (durationMinutes !== undefined && durationMinutes !== null) {
    const parsed = parseInt(durationMinutes, 10);
    if (Number.isFinite(parsed)) {
      dur = parsed;
      if (dur < 1) dur = 1;
      if (dur > 1440) dur = 1440;
    }
  }
  const idx = settings.findIndex(s => s.setting_id === 'edit_window');
  const doc = {
    setting_id: 'edit_window',
    enabled: !!enabled,
    duration_minutes: dur,
    updated_at: new Date().toISOString()
  };
  if (idx >= 0) settings[idx] = doc; else settings.push(doc);
  if (database.saveImmediate) database.saveImmediate(); else database.save();
  return { enabled: doc.enabled, duration_minutes: doc.duration_minutes };
}

// Back-compat alias
function setEditLockEnabled(database, enabled) {
  return setEditWindowSettings(database, enabled, undefined);
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

  const settings = getEditWindowSettings(database);
  if (!settings.enabled) {
    return { allowed: true, message: 'Edit lock disabled in Settings' };
  }
  const durationMs = settings.duration_minutes * 60 * 1000;

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
    if (elapsed > durationMs) {
      const mins = Math.floor(elapsed / 60000);
      return {
        allowed: false,
        message: `${settings.duration_minutes} minute se zyada ho gaye (${mins} min) — ab edit/delete nahi kar sakte. Admin se contact karein.`
      };
    }
  } catch (e) {
    return { allowed: true, message: 'Timestamp parse fail — lock skipped' };
  }

  return { allowed: true, message: 'Edit allowed' };
}

module.exports = { isEditLockEnabled, setEditLockEnabled, setEditWindowSettings, getEditWindowSettings, checkEditLock };
