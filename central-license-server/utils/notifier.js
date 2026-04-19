/**
 * WhatsApp Notifier — uses 360Messenger API to send messages to customers.
 * Reads config from .env:
 *   NOTIFY_WA_API_KEY - 360Messenger API key (admin's account)
 *   NOTIFY_WA_FROM    - (optional) sender display name, e.g. "MillEntry Support"
 *   NOTIFY_WA_CC      - country code for phone numbers (default 91)
 * If NOTIFY_WA_API_KEY is not set, notifications are silently skipped (no errors).
 */
const https = require('https');
const { URLSearchParams } = require('url');
const db = require('../database');

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

function sendMessage(phonenumber, text) {
  return new Promise((resolve) => {
    const { apiKey, enabled } = getWaConfig();
    if (!apiKey) { resolve({ success: false, skipped: true, reason: 'WhatsApp API key not configured' }); return; }
    if (!enabled) { resolve({ success: false, skipped: true, reason: 'WhatsApp notifications disabled in settings' }); return; }
    if (!phonenumber) { resolve({ success: false, reason: 'no phone number' }); return; }
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
          resolve({ success: !!ok, statusCode: res.statusCode, response: j });
        } catch (e) { resolve({ success: false, error: body.slice(0, 200) }); }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ success: false, error: 'timeout' }); });
    req.write(postData);
    req.end();
  });
}

// ====== High-level notification helpers ======

async function notifyRevoked(license) {
  const phone = extractPhone(license.contact);
  if (!phone) return { skipped: true, reason: 'no_phone' };
  const text = `*MillEntry License Revoked*\n\nAapka license revoke kar diya gaya hai.\n\n` +
               `Mill: ${license.mill_name}\nKey: ${license.key}\n\n` +
               `Details ke liye contact karein: t2@host9x.com`;
  return sendMessage(phone, text);
}

async function notifyExpiringSoon(license, daysLeft) {
  const phone = extractPhone(license.contact);
  if (!phone) return { skipped: true, reason: 'no_phone' };
  const text = `*MillEntry License Expiring Soon*\n\nAapka MillEntry license ${daysLeft} din me expire hoga.\n\n` +
               `Mill: ${license.mill_name}\nKey: ${license.key}\n\n` +
               `Renewal karne ke liye contact karein: t2@host9x.com`;
  return sendMessage(phone, text);
}

async function notifyExpired(license) {
  const phone = extractPhone(license.contact);
  if (!phone) return { skipped: true, reason: 'no_phone' };
  const text = `*MillEntry License Expired*\n\nAapka license expire ho chuka hai. Software kaam band kar dega next heartbeat pe.\n\n` +
               `Mill: ${license.mill_name}\nKey: ${license.key}\n\n` +
               `Turant renewal ke liye contact karein: t2@host9x.com`;
  return sendMessage(phone, text);
}

async function notifyActivated(license) {
  const phone = extractPhone(license.contact);
  if (!phone) return { skipped: true, reason: 'no_phone' };
  const text = `*MillEntry License Activated* ✓\n\nAapka license successfully activate ho gaya hai.\n\n` +
               `Mill: ${license.mill_name}\nKey: ${license.key}\nPlan: ${license.plan}\n\n` +
               `Any support? Contact: t2@host9x.com`;
  return sendMessage(phone, text);
}

module.exports = { notifyRevoked, notifyExpiringSoon, notifyExpired, notifyActivated, sendMessage, extractPhone };
