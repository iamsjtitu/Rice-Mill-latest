/**
 * Expiry Scheduler — scans all active licenses daily and fires WhatsApp
 * notifications via utils/notifier.js
 *
 * Rules (user-configured):
 *   - 7 days before expiry: send "Expiring Soon" warning (once)
 *   - On or after expiry date: send "Expired" message (once)
 *
 * Idempotency: each license stores `notified_7day` (ISO) and `notified_expired`
 * (ISO) so reminders never duplicate even if the server restarts multiple
 * times in a day.
 *
 * Schedule: first scan 60s after boot, then every 6 hours. Extra defensive
 * check at 09:00 local time daily.
 */
const db = require('../database');
const notifier = require('./notifier');

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_MIN_MS = 60 * 1000;

function daysUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms / (1000 * 60 * 60 * 24);
}

function shouldPersistFlag(r) {
  // Persist the notified flag when:
  //   - delivered successfully
  //   - license has no phone number (can't notify, no point retrying)
  //   - API responded with a non-retryable error (e.g. invalid number, 4xx)
  // Do NOT persist when NOTIFY_WA_API_KEY is unset (so once configured later,
  // backlog notifications fire) or on transient errors (network/timeout/5xx).
  if (!r) return false;
  if (r.success) return true;
  if (r.skipped && r.reason === 'NOTIFY_WA_API_KEY not set') return false;
  if (r.skipped) return true; // no_phone or other permanent skip
  if (r.error === 'timeout') return false;
  if (r.statusCode && r.statusCode >= 500) return false;
  // API returned a structured error → treat as permanent (wrong number etc.)
  if (r.statusCode && r.statusCode >= 400) return true;
  // Plain error without statusCode → treat as transient (retry next scan)
  return false;
}

async function runScan() {
  try {
    const data = db.getData();
    const licenses = data.licenses || [];
    let warnings = 0, expired = 0, skipped = 0;

    for (const lic of licenses) {
      if (lic.status !== 'active') continue;
      if (!lic.expires_at) continue; // lifetime license - nothing to do
      const left = daysUntil(lic.expires_at);
      if (left === null) continue;

      // CASE 1: Expired (today or past)
      if (left <= 0) {
        if (!lic.notified_expired) {
          const r = await notifier.notifyExpired(lic);
          if (shouldPersistFlag(r)) {
            lic.notified_expired = new Date().toISOString();
            db.saveImmediate();
          }
          if (r && r.success) expired++;
          else skipped++;
        }
        continue;
      }

      // CASE 2: 7-day warning window
      if (left <= 7.5 && left > 0) {
        if (!lic.notified_7day) {
          const r = await notifier.notifyExpiringSoon(lic, Math.max(1, Math.ceil(left)));
          if (shouldPersistFlag(r)) {
            lic.notified_7day = new Date().toISOString();
            db.saveImmediate();
          }
          if (r && r.success) warnings++;
          else skipped++;
        }
      }
    }

    if (warnings || expired || skipped) {
      console.log(`[expiry-scheduler] scan done — 7day-warnings:${warnings} expired:${expired} skipped:${skipped}`);
    }
    return { warnings, expired, skipped, scanned: licenses.length };
  } catch (e) {
    console.error('[expiry-scheduler] scan error:', e.message);
    return { error: e.message };
  }
}

function start() {
  // First scan after 60 seconds (server warm-up grace)
  setTimeout(() => {
    runScan();
    // Then every 6 hours
    setInterval(runScan, SIX_HOURS_MS);
  }, ONE_MIN_MS);

  // Extra defensive daily-at-09:00 local-time tick (covers case where server
  // was asleep/rebooted at scheduled interval).
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() === 0) runScan();
  }, ONE_MIN_MS);

  console.log('[expiry-scheduler] started (first scan in 60s, then every 6h + daily 09:00)');
}

module.exports = { start, runScan };
