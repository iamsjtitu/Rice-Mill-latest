/**
 * WhatsApp Notifier — uses 360Messenger API to send messages to customers.
 * Reads config from .env:
 *   NOTIFY_WA_API_KEY - 360Messenger API key (admin's account)
 *   NOTIFY_WA_FROM    - (optional) sender display name, e.g. "MillEntry Support"
 *   NOTIFY_WA_CC      - country code for phone numbers (default 91)
 * If NOTIFY_WA_API_KEY is not set, notifications are silently skipped (no errors).
 *
 * Every send() call records a row in data.notifications[] for the admin log UI.
 */
const https = require('https');
const { URLSearchParams } = require('url');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');

// How many notifications to keep in the log — FIFO pruning (oldest drops first).
const MAX_LOG_ROWS = 5000;
// Retention window for automatic pruning (days)
const RETENTION_DAYS = 90;

function logNotification(row) {
  try {
    const data = db.getData();
    if (!Array.isArray(data.notifications)) data.notifications = [];
    const full = {
      id: uuidv4(),
      sent_at: new Date().toISOString(),
      ...row,
    };
    data.notifications.unshift(full); // newest first
    // Enforce hard cap
    if (data.notifications.length > MAX_LOG_ROWS) {
      data.notifications.length = MAX_LOG_ROWS;
    }
    // Enforce retention window (90 days)
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    data.notifications = data.notifications.filter(n => {
      const t = new Date(n.sent_at).getTime();
      return isFinite(t) && t >= cutoff;
    });
    db.save();
    return full;
  } catch (e) {
    console.error('[notifier] failed to log notification:', e.message);
  }
}

// Resolve config: DB settings take priority, fall back to .env
function getWaConfig() {
  let dbSettings = {};
  try { dbSettings = (db.getData().settings) || {}; } catch { /* DB not yet loaded */ }
  const apiKey = (dbSettings.whatsapp_api_key || process.env.NOTIFY_WA_API_KEY || '').trim();
  const cc = String(dbSettings.whatsapp_cc || process.env.NOTIFY_WA_CC || '91').trim();
  // Master switch: if DB has explicit whatsapp_enabled=false → disabled even if key present
  const enabled = dbSettings.whatsapp_enabled !== false && !!apiKey;
  return { apiKey, cc, enabled };
}

function cleanPhone(phone) {
  const CC = getWaConfig().cc;
  let p = String(phone || '').trim().replace(/[\s\-+]/g, '');
  if (!p) return '';
  if (p.startsWith('0')) p = p.substring(1);
  if (!p.startsWith(CC)) p = CC + p;
  return p;
}

function extractPhone(contact) {
  // Accept formats: "+91 98765 43210", "98765-43210", "name@example.com|9876543210", "9876543210"
  if (!contact) return '';
  const digits = String(contact).replace(/\D/g, '');
  if (digits.length >= 10) return cleanPhone(digits.slice(-12));
  return '';
}

function sendMessage(phonenumber, text, logCtx) {
  return new Promise((resolve) => {
    const { apiKey, enabled } = getWaConfig();
    const finish = (result) => {
      // Always log the attempt (if caller provided context), regardless of outcome
      if (logCtx) {
        logNotification({
          license_id: logCtx.license_id || null,
          license_key: logCtx.license_key || null,
          event: logCtx.event || 'custom',
          phone: phonenumber || '',
          status: result.success ? 'delivered' : (result.skipped ? 'skipped' : 'failed'),
          message_preview: String(text || '').slice(0, 200),
          response: result.response ? JSON.stringify(result.response).slice(0, 300) : null,
          error: result.error || result.reason || null,
          status_code: result.statusCode || null,
        });
      }
      resolve(result);
    };
    if (!apiKey)     { finish({ success: false, skipped: true, reason: 'WhatsApp API key not configured' }); return; }
    if (!enabled)    { finish({ success: false, skipped: true, reason: 'WhatsApp notifications disabled in settings' }); return; }
    if (!phonenumber){ finish({ success: false, reason: 'no phone number' }); return; }
    const form = new URLSearchParams({ phonenumber, text });
    const postData = form.toString();
    const opts = {
      hostname: 'api.360messenger.com', path: '/v2/sendMessage', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          const ok = j.success || res.statusCode === 201;
          finish({ success: !!ok, statusCode: res.statusCode, response: j });
        } catch (e) { finish({ success: false, error: body.slice(0, 200) }); }
      });
    });
    req.on('error', e => finish({ success: false, error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); finish({ success: false, error: 'timeout' }); });
    req.write(postData);
    req.end();
  });
}

// ====== High-level notification helpers ======

async function notifyRevoked(license) {
  const phone = extractPhone(license.contact);
  const ctx = { license_id: license.id, license_key: license.key, event: 'revoked' };
  if (!phone) { logNotification({ ...ctx, phone: '', status: 'skipped', error: 'no_phone', message_preview: '' }); return { skipped: true, reason: 'no_phone' }; }
  const text = `*MillEntry License Revoked*\n\nAapka license revoke kar diya gaya hai.\n\n` +
               `Mill: ${license.mill_name}\nKey: ${license.key}\n\n` +
               `Details ke liye contact karein: t2@host9x.com`;
  return sendMessage(phone, text, ctx);
}

async function notifyExpiringSoon(license, daysLeft) {
  const phone = extractPhone(license.contact);
  const ctx = { license_id: license.id, license_key: license.key, event: 'expiring' };
  if (!phone) { logNotification({ ...ctx, phone: '', status: 'skipped', error: 'no_phone', message_preview: '' }); return { skipped: true, reason: 'no_phone' }; }
  const text = `*MillEntry License Expiring Soon*\n\nAapka MillEntry license ${daysLeft} din me expire hoga.\n\n` +
               `Mill: ${license.mill_name}\nKey: ${license.key}\n\n` +
               `Renewal karne ke liye contact karein: t2@host9x.com`;
  return sendMessage(phone, text, ctx);
}

async function notifyExpired(license) {
  const phone = extractPhone(license.contact);
  const ctx = { license_id: license.id, license_key: license.key, event: 'expired' };
  if (!phone) { logNotification({ ...ctx, phone: '', status: 'skipped', error: 'no_phone', message_preview: '' }); return { skipped: true, reason: 'no_phone' }; }
  const text = `*MillEntry License Expired*\n\nAapka license expire ho chuka hai. Software kaam band kar dega next heartbeat pe.\n\n` +
               `Mill: ${license.mill_name}\nKey: ${license.key}\n\n` +
               `Turant renewal ke liye contact karein: t2@host9x.com`;
  return sendMessage(phone, text, ctx);
}

async function notifyActivated(license) {
  const phone = extractPhone(license.contact);
  const ctx = { license_id: license.id, license_key: license.key, event: 'activated' };
  if (!phone) { logNotification({ ...ctx, phone: '', status: 'skipped', error: 'no_phone', message_preview: '' }); return { skipped: true, reason: 'no_phone' }; }
  const text = `*MillEntry License Activated* ✓\n\nAapka license successfully activate ho gaya hai.\n\n` +
               `Mill: ${license.mill_name}\nKey: ${license.key}\nPlan: ${license.plan}\n\n` +
               `Any support? Contact: t2@host9x.com`;
  return sendMessage(phone, text, ctx);
}

async function notifySuspended(license, reason) {
  const phone = extractPhone(license.contact);
  const ctx = { license_id: license.id, license_key: license.key, event: 'suspended' };
  if (!phone) { logNotification({ ...ctx, phone: '', status: 'skipped', error: 'no_phone', message_preview: '' }); return { skipped: true, reason: 'no_phone' }; }
  const reasonLine = reason && String(reason).trim()
    ? String(reason).trim()
    : 'Admin ki taraf se suspend kiya gaya hai.';
  const text = `*MillEntry License Suspended* ⚠\n\n` +
               `Aapka license temporarily suspend kar diya gaya hai. Software next heartbeat pe kaam band kar dega.\n\n` +
               `Mill: ${license.mill_name}\nKey: ${license.key}\n` +
               `Reason: ${reasonLine}\n\n` +
               `License wapas chalu karwane ke liye contact karein: t2@host9x.com`;
  return sendMessage(phone, text, ctx);
}

async function notifyUnsuspended(license) {
  const phone = extractPhone(license.contact);
  const ctx = { license_id: license.id, license_key: license.key, event: 'unsuspended' };
  if (!phone) { logNotification({ ...ctx, phone: '', status: 'skipped', error: 'no_phone', message_preview: '' }); return { skipped: true, reason: 'no_phone' }; }
  const text = `*MillEntry License Restored* ✓\n\nAapka license wapas chalu kar diya gaya hai. Software agle heartbeat pe normal kaam karega.\n\n` +
               `Mill: ${license.mill_name}\nKey: ${license.key}\n\n` +
               `Dhanyavaad! — t2@host9x.com`;
  return sendMessage(phone, text, ctx);
}

module.exports = { notifyRevoked, notifyExpiringSoon, notifyExpired, notifyActivated, notifySuspended, notifyUnsuspended, sendMessage, extractPhone, logNotification };
