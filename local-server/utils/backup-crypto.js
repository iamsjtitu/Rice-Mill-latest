/**
 * Backup file encryption (AES-256-GCM) keyed off the customer license key.
 *
 * Goal: if a backup JSON file leaks (USB stolen / cloud-drive sync mishap), the
 * data is unreadable without the original license key. Backup files written
 * with this module are themselves valid JSON wrappers carrying the ciphertext,
 * so they survive code-signed-zip transport but reveal nothing on inspection.
 *
 * Format:
 *   {
 *     "_encrypted": true,
 *     "_version": 1,
 *     "_algorithm": "aes-256-gcm",
 *     "_kdf": "scrypt",
 *     "_kdf_params": { "N": 16384, "r": 8, "p": 1, "key_len": 32 },
 *     "_salt": "<base64>",
 *     "_iv": "<base64>",
 *     "_auth_tag": "<base64>",
 *     "_ciphertext": "<base64>",
 *     "_created_at": "<ISO timestamp>",
 *     "_hint": "License key required to decrypt"
 *   }
 *
 * Decryption requires the original license key string. Wrong key throws.
 */
const crypto = require('crypto');

const VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;        // 256-bit key
const IV_LEN = 12;         // 96-bit IV recommended for GCM
const SALT_LEN = 16;       // 128-bit salt
const SCRYPT_N = 16384;    // CPU/memory cost factor
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;  // 64 MB

function deriveKey(licenseKey, salt) {
  if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.length < 4) {
    throw new Error('License key required for backup encryption');
  }
  // Domain-separated derivation so this key cannot collide with any other use of
  // the license key (e.g. license cache encryption, server signatures, etc.).
  const material = 'millentry-backup-v1\0' + licenseKey;
  return crypto.scryptSync(material, salt, KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM,
  });
}

/**
 * Encrypt a plaintext string with AES-256-GCM keyed off the license key.
 * Returns the JSON-stringified wrapper (write directly to disk as backup file).
 */
function encrypt(plaintext, licenseKey) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encrypt() expects plaintext string');
  }
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(licenseKey, salt);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ct1 = cipher.update(plaintext, 'utf8');
  const ct2 = cipher.final();
  const ciphertext = Buffer.concat([ct1, ct2]);
  const authTag = cipher.getAuthTag();

  const wrapper = {
    _encrypted: true,
    _version: VERSION,
    _algorithm: ALGORITHM,
    _kdf: 'scrypt',
    _kdf_params: { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, key_len: KEY_LEN },
    _salt: salt.toString('base64'),
    _iv: iv.toString('base64'),
    _auth_tag: authTag.toString('base64'),
    _ciphertext: ciphertext.toString('base64'),
    _created_at: new Date().toISOString(),
    _hint: 'License key required to decrypt',
  };
  return JSON.stringify(wrapper);
}

/**
 * Try to determine whether a string is a backup-crypto wrapper without parsing
 * the entire JSON (cheap heuristic for callers that only want to detect format).
 */
function isEncrypted(jsonStringOrParsed) {
  if (!jsonStringOrParsed) return false;
  if (typeof jsonStringOrParsed === 'object') {
    return jsonStringOrParsed._encrypted === true && typeof jsonStringOrParsed._ciphertext === 'string';
  }
  if (typeof jsonStringOrParsed === 'string') {
    // Quick contains-check; full validation happens in decrypt()
    return jsonStringOrParsed.includes('"_encrypted":true') &&
           jsonStringOrParsed.includes('"_ciphertext"');
  }
  return false;
}

/**
 * Decrypt a backup file JSON (string or already-parsed object) with the license key.
 * Returns the original plaintext (caller can JSON.parse it as the underlying database snapshot).
 * Throws on tampering, wrong key, or malformed input.
 */
function decrypt(jsonStringOrParsed, licenseKey) {
  let wrapper = jsonStringOrParsed;
  if (typeof jsonStringOrParsed === 'string') {
    try { wrapper = JSON.parse(jsonStringOrParsed); }
    catch (e) { throw new Error('Backup file is not valid JSON'); }
  }
  if (!wrapper || wrapper._encrypted !== true) {
    throw new Error('Backup file is not encrypted (or wrapper missing _encrypted flag)');
  }
  if (wrapper._version !== VERSION) {
    throw new Error(`Unsupported backup encryption version: ${wrapper._version}`);
  }
  if (wrapper._algorithm !== ALGORITHM) {
    throw new Error(`Unsupported backup algorithm: ${wrapper._algorithm}`);
  }
  let salt, iv, authTag, ciphertext;
  try {
    salt = Buffer.from(wrapper._salt, 'base64');
    iv = Buffer.from(wrapper._iv, 'base64');
    authTag = Buffer.from(wrapper._auth_tag, 'base64');
    ciphertext = Buffer.from(wrapper._ciphertext, 'base64');
  } catch (e) {
    throw new Error('Backup file fields are not valid base64');
  }
  const key = deriveKey(licenseKey, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let plain;
  try {
    const pt1 = decipher.update(ciphertext);
    const pt2 = decipher.final();  // throws if auth tag does not match
    plain = Buffer.concat([pt1, pt2]).toString('utf8');
  } catch (e) {
    // Hide internal crypto error details, return a clear domain message.
    throw new Error('Backup decryption failed — license key does not match the one used to create this backup, or the file is corrupted/tampered.');
  }
  return plain;
}

module.exports = { encrypt, decrypt, isEncrypted, VERSION, ALGORITHM };
