/**
 * License Key Generator: 9X-XXXX-XXXX-XXXX-XXXX
 * Uses crypto-secure random + checksum in last segment.
 */
const crypto = require('crypto');

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous (no 0/O/1/I)

function segment(len = 4) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHA[bytes[i] % ALPHA.length];
  return out;
}

function checksum(prefix, blocks) {
  const h = crypto.createHash('sha256').update(prefix + blocks.join('')).digest();
  let out = '';
  for (let i = 0; i < 4; i++) out += ALPHA[h[i] % ALPHA.length];
  return out;
}

function generateLicenseKey() {
  const prefix = '9X';
  const b1 = segment(4);
  const b2 = segment(4);
  const b3 = segment(4);
  const b4 = checksum(prefix, [b1, b2, b3]);
  return `${prefix}-${b1}-${b2}-${b3}-${b4}`;
}

function verifyLicenseFormat(key) {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim().toUpperCase();
  const parts = clean.split('-');
  if (parts.length !== 5) return false;
  if (parts[0] !== '9X') return false;
  if (parts.some(p => !/^[A-Z0-9]+$/.test(p))) return false;
  const [, b1, b2, b3, b4] = parts;
  if ([b1, b2, b3, b4].some(p => p.length !== 4)) return false;
  const expected = checksum('9X', [b1, b2, b3]);
  return expected === b4;
}

module.exports = { generateLicenseKey, verifyLicenseFormat };
