const express = require('express');
const { safeSync, safeAsync } = require('./safe_handler');
const router = express.Router();
const fs = require('fs');
const path = require('path');

let errorLogPath;
try {
  const { app } = require('electron');
  errorLogPath = path.join(app.getPath('userData'), 'mill-entry-error.log');
} catch (_) {
  errorLogPath = path.join(__dirname, '..', 'mill-entry-error.log');
}

module.exports = function(database) {

  // ===== PRINT PAGE =====
  const printPages = {};
  router.post('/api/print', safeSync(async (req, res) => {
    const id = require('uuid').v4();
    printPages[id] = req.body.html;
    setTimeout(() => delete printPages[id], 300000);
    res.json({ id, url: `/api/print/${id}` });
  }));
  router.get('/api/print/:id', safeSync(async (req, res) => {
    const html = printPages[req.params.id];
    if (!html) return res.status(404).send('<h1>Page expired. Please try again.</h1>');
    delete printPages[req.params.id];
    res.type('html').send(html);
  }));

  // ===== AUTH =====
  const DEFAULT_USERS = {
    'admin': { password: 'admin123', role: 'admin' },
    'staff': { password: 'staff123', role: 'staff' }
  };

  const ROLE_PERMISSIONS = {
    admin: { can_edit: true, can_delete: true, can_export: true, can_see_payments: true, can_see_cashbook: true, can_see_reports: true, can_edit_settings: true, can_manual_weight: true, can_edit_rst: true, can_change_date: true },
    entry_operator: { can_edit: true, can_delete: false, can_export: false, can_see_payments: false, can_see_cashbook: false, can_see_reports: false, can_edit_settings: false, can_manual_weight: false, can_edit_rst: false, can_change_date: false },
    accountant: { can_edit: true, can_delete: false, can_export: true, can_see_payments: true, can_see_cashbook: true, can_see_reports: true, can_edit_settings: false, can_manual_weight: false, can_edit_rst: false, can_change_date: false },
    viewer: { can_edit: false, can_delete: false, can_export: true, can_see_payments: true, can_see_cashbook: true, can_see_reports: true, can_edit_settings: false, can_manual_weight: false, can_edit_rst: false, can_change_date: false },
    staff: { can_edit: false, can_delete: false, can_export: false, can_see_payments: false, can_see_cashbook: false, can_see_reports: false, can_edit_settings: false, can_manual_weight: false, can_edit_rst: false, can_change_date: false },
  };

  const getPerms = (userDoc) => {
    const role = userDoc.role || 'viewer';
    const defaults = { ...(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer) };
    if (userDoc.permissions) Object.assign(defaults, userDoc.permissions);
    // Admin role: core permissions always true
    if (role === 'admin') {
      defaults.can_edit = true;
      defaults.can_delete = true;
      defaults.can_edit_settings = true;
    }
    return defaults;
  };

  router.post('/api/auth/login', safeSync(async (req, res) => {
    const { username, password } = req.body;
    // SECURITY: Ensure default users are seeded in DB on first ever login attempt.
    // After seeding, login uses ONLY DB users — no DEFAULT_USERS backdoor that
    // could revert custom passwords. This fixes the "admin password resets to admin123" bug.
    if (!Array.isArray(database.data.users)) database.data.users = [];
    let seeded = false;
    for (const [uname, udata] of Object.entries(DEFAULT_USERS)) {
      if (!database.data.users.find(u => u.username === uname)) {
        database.data.users.push({ id: `default_${uname}`, username: uname, password: udata.password, role: udata.role,
          display_name: uname, active: true, created_at: new Date().toISOString() });
        seeded = true;
      }
    }
    if (seeded && database.saveImmediate) database.saveImmediate(); else if (seeded) database.save();

    const user = database.getUser(username);
    if (user) {
      if (user.active === false) return res.status(401).json({ detail: 'Account deactivated hai. Admin se baat karo.' });
      if (user.password === password) {
        return res.json({ success: true, username: user.username, role: user.role,
          display_name: user.display_name || user.username, permissions: getPerms(user), message: 'Login successful' });
      }
      return res.status(401).json({ detail: 'Password galat hai' });
    }
    res.status(401).json({ detail: `User "${username}" nahi mila` });
  }));

  router.post('/api/auth/change-password', safeSync(async (req, res) => {
    const { username, current_password, new_password } = req.body;
    if (!new_password || String(new_password).length < 6) {
      return res.status(400).json({ detail: 'Naya password kam se kam 6 characters ka hona chahiye' });
    }
    const user = database.getUser(username);
    if (!user || user.password !== current_password) {
      return res.status(401).json({ detail: 'Current password galat hai' });
    }
    database.updateUserPassword(username, new_password);
    res.json({ success: true, message: 'Password change ho gaya' });
  }));

  // ============ PASSWORD RECOVERY: Recovery Code + WhatsApp OTP ============
  const crypto = require('crypto');
  const https = require('https');

  const _hashSecret = (s) => crypto.createHash('sha256').update(String(s).trim(), 'utf8').digest('hex');
  const _genRecoveryCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 16; i++) s += alphabet[crypto.randomInt(alphabet.length)];
    return `${s.slice(0,4)}-${s.slice(4,8)}-${s.slice(8,12)}-${s.slice(12,16)}`;
  };
  const _genOtp = () => String(crypto.randomInt(1000000)).padStart(6, '0');
  const _maskPhone = (phone) => {
    if (!phone) return '';
    const p = String(phone).replace(/\D/g, '');
    if (p.length < 4) return '*'.repeat(p.length);
    return '*'.repeat(p.length - 4) + p.slice(-4);
  };
  const _getWaApiKey = () => {
    const settings = (database.data.app_settings || []).find(s => s.setting_id === 'whatsapp_config');
    return { apiKey: settings?.api_key || '', countryCode: settings?.country_code || '91' };
  };
  const _cleanPhone = (phone, cc = '91') => {
    let p = String(phone).trim().replace(/[\s\-\+]/g, '');
    if (p.startsWith('0')) p = p.substring(1);
    if (!p.startsWith(cc)) p = cc + p;
    return p;
  };
  const _sendWhatsApp = (phone, text) => new Promise((resolve) => {
    const { apiKey, countryCode } = _getWaApiKey();
    if (!apiKey) return resolve({ success: false, error: 'WhatsApp API key set nahi hai. Settings → Messaging mein set karein.' });
    const cleaned = _cleanPhone(phone, countryCode);
    const postData = `phonenumber=${encodeURIComponent(cleaned)}&text=${encodeURIComponent(text)}`;
    const opts = {
      hostname: 'api.360messenger.com', path: '/v2/sendMessage', method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req2 = https.request(opts, (r) => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => {
        try { const result = JSON.parse(data || '{}'); resolve({ success: result.success || r.statusCode === 201, error: result.error || result.message || (r.statusCode >= 400 ? `HTTP ${r.statusCode}` : '') }); }
        catch (e) { resolve({ success: false, error: 'Invalid response from WhatsApp' }); }
      });
    });
    req2.on('error', (e) => resolve({ success: false, error: e.message }));
    req2.setTimeout(20000, () => { req2.destroy(); resolve({ success: false, error: 'WhatsApp API timeout' }); });
    req2.write(postData);
    req2.end();
  });

  router.post('/api/auth/recovery-code/generate', safeSync(async (req, res) => {
    const { username, current_password } = req.body || {};
    if (!username || !current_password) return res.status(400).json({ detail: 'Username aur current password zaruri hai' });
    const user = database.getUser(username);
    if (!user) return res.status(404).json({ detail: 'User not found' });
    if (user.password !== current_password) return res.status(401).json({ detail: 'Current password galat hai' });
    if (user.role !== 'admin') return res.status(403).json({ detail: 'Sirf admin recovery code generate kar sakta hai' });

    const code = _genRecoveryCode();
    user.recovery_code_hash = _hashSecret(code);
    user.recovery_code_set_at = new Date().toISOString();
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json({ success: true, code, message: 'Recovery code generated. Save it safely — it will not be shown again.' });
  }));

  router.get('/api/auth/recovery-code/status', safeSync(async (req, res) => {
    if (req.query.role !== 'admin') return res.status(403).json({ detail: 'Sirf admin' });
    const user = database.getUser(req.query.username);
    if (!user) return res.json({ has_code: false, set_at: '' });
    res.json({ has_code: !!user.recovery_code_hash, set_at: user.recovery_code_set_at || '' });
  }));

  router.put('/api/auth/recovery-whatsapp', safeSync(async (req, res) => {
    const { username, current_password, whatsapp } = req.body || {};
    if (!username || !current_password) return res.status(400).json({ detail: 'Username aur current password zaruri hai' });
    const user = database.getUser(username);
    if (!user) return res.status(404).json({ detail: 'User not found' });
    if (user.password !== current_password) return res.status(401).json({ detail: 'Current password galat hai' });
    if (user.role !== 'admin') return res.status(403).json({ detail: 'Sirf admin' });

    const num = String(whatsapp || '').trim();
    const cleaned = num.replace(/\D/g, '');
    if (num && cleaned.length < 10) return res.status(400).json({ detail: 'WhatsApp number invalid hai' });

    user.recovery_whatsapp = num;
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json({ success: true, whatsapp: num, masked: _maskPhone(num) });
  }));

  router.get('/api/auth/recovery-whatsapp', safeSync(async (req, res) => {
    if (req.query.role !== 'admin') return res.status(403).json({ detail: 'Sirf admin' });
    const user = database.getUser(req.query.username);
    const wa = user?.recovery_whatsapp || '';
    res.json({ whatsapp: wa, masked: _maskPhone(wa), has_number: !!wa });
  }));

  router.post('/api/auth/forgot-password/send-otp', safeAsync(async (req, res) => {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ detail: 'Username zaruri hai' });
    const user = database.getUser(username);
    if (!user || !user.recovery_whatsapp) {
      return res.status(404).json({ detail: 'Is account ke liye recovery WhatsApp set nahi hai. Pehle Settings → Account Recovery se number add karein.' });
    }
    if (user.reset_otp_sent_at) {
      const elapsed = (Date.now() - new Date(user.reset_otp_sent_at).getTime()) / 1000;
      if (elapsed < 60) return res.status(429).json({ detail: `Thoda ruko - ${Math.ceil(60 - elapsed)}s baad dobara try karein` });
    }
    const otp = _genOtp();
    user.reset_otp_hash = _hashSecret(otp);
    user.reset_otp_expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    user.reset_otp_attempts = 0;
    user.reset_otp_sent_at = new Date().toISOString();
    if (database.saveImmediate) database.saveImmediate(); else database.save();

    const text = `Mill Entry System - Password Reset OTP\n\nAapka OTP hai: ${otp}\n\nYe OTP 10 minutes ke liye valid hai. Kisi ke saath share na karein.\nAgar aapne reset request nahi kiya hai toh is message ko ignore karein.`;
    const result = await _sendWhatsApp(user.recovery_whatsapp, text);
    if (!result.success) return res.status(500).json({ detail: `OTP bhejne mein error: ${result.error || 'WhatsApp send failed'}` });
    res.json({ success: true, masked_phone: _maskPhone(user.recovery_whatsapp), message: `OTP bhej diya ${_maskPhone(user.recovery_whatsapp)} pe. 10 minutes ke andar enter karein.` });
  }));

  router.post('/api/auth/forgot-password/verify-otp', safeSync(async (req, res) => {
    const { username, otp, new_password } = req.body || {};
    if (!username || !otp || !new_password) return res.status(400).json({ detail: 'Username, OTP aur naya password zaruri hai' });
    if (String(new_password).length < 6) return res.status(400).json({ detail: 'Naya password kam se kam 6 characters ka hona chahiye' });

    const user = database.getUser(username);
    if (!user || !user.reset_otp_hash) return res.status(400).json({ detail: "Is account ke liye OTP request nahi mila. Pehle 'Send OTP' karein." });

    const expires = user.reset_otp_expires_at ? new Date(user.reset_otp_expires_at).getTime() : 0;
    if (Date.now() > expires) {
      delete user.reset_otp_hash; delete user.reset_otp_expires_at; delete user.reset_otp_attempts;
      database.save();
      return res.status(400).json({ detail: 'OTP expire ho gaya. Naya OTP request karein.' });
    }
    const attempts = parseInt(user.reset_otp_attempts || 0, 10);
    if (attempts >= 5) {
      delete user.reset_otp_hash; delete user.reset_otp_expires_at; delete user.reset_otp_attempts;
      database.save();
      return res.status(429).json({ detail: 'Bahut zyada galat OTP attempts. Naya OTP request karein.' });
    }
    if (user.reset_otp_hash !== _hashSecret(otp)) {
      user.reset_otp_attempts = attempts + 1;
      database.save();
      return res.status(401).json({ detail: `OTP galat hai. ${4 - attempts} attempts bache hain.` });
    }
    user.password = String(new_password);
    delete user.reset_otp_hash; delete user.reset_otp_expires_at; delete user.reset_otp_attempts; delete user.reset_otp_sent_at;
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json({ success: true, message: 'Password reset ho gaya! Ab new password se login karein.' });
  }));

  router.post('/api/auth/forgot-password/recovery-code', safeSync(async (req, res) => {
    const { username, code, new_password } = req.body || {};
    if (!username || !code || !new_password) return res.status(400).json({ detail: 'Username, recovery code aur naya password zaruri hai' });
    if (String(new_password).length < 6) return res.status(400).json({ detail: 'Naya password kam se kam 6 characters ka hona chahiye' });

    const user = database.getUser(username);
    if (!user || !user.recovery_code_hash) return res.status(404).json({ detail: 'Is account ke liye recovery code set nahi hai' });
    if (user.recovery_code_hash !== _hashSecret(String(code).trim().toUpperCase())) {
      return res.status(401).json({ detail: 'Recovery code galat hai' });
    }
    user.password = String(new_password);
    delete user.recovery_code_hash; delete user.recovery_code_set_at;
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json({ success: true, message: 'Password reset ho gaya! Naya recovery code Settings se generate karein.', code_invalidated: true });
  }));

  router.get('/api/auth/verify', safeSync(async (req, res) => {
    const { username, role } = req.query;
    const user = database.getUser(username);
    if (user && user.role === role) {
      return res.json({ valid: true, username, role, display_name: user.display_name || username, permissions: getPerms(user) });
    }
    if (DEFAULT_USERS[username] && DEFAULT_USERS[username].role === role) {
      return res.json({ valid: true, username, role, display_name: username, permissions: { ...(ROLE_PERMISSIONS[role] || {}) } });
    }
    res.json({ valid: false });
  }));

  // ===== USER MANAGEMENT (CRUD) =====
  router.get('/api/users', safeSync(async (req, res) => {
    if (req.query.role !== 'admin') return res.status(403).json({ detail: 'Sirf Admin users dekh sakta hai' });
    if (!database.data.users) database.data.users = [];
    // Ensure all DB users have an id field
    let needsSave = false;
    for (const u of database.data.users) {
      if (!u.id) {
        u.id = DEFAULT_USERS[u.username] ? `default_${u.username}` : require('crypto').randomUUID();
        needsSave = true;
      }
    }
    if (needsSave) database.save();
    const dbUsers = database.data.users.map(u => {
      const { password, ...rest } = u;
      rest.permissions = getPerms(u);
      return rest;
    });
    const dbUsernames = new Set(dbUsers.map(u => u.username));
    for (const [uname, udata] of Object.entries(DEFAULT_USERS)) {
      if (!dbUsernames.has(uname)) {
        dbUsers.push({ id: `default_${uname}`, username: uname, role: udata.role, display_name: uname, active: true, is_default: true,
          permissions: { ...(ROLE_PERMISSIONS[udata.role] || {}) } });
      }
    }
    const staffList = (database.data.staff || []).filter(s => s.active !== false);
    const linkedIds = new Set(database.data.users.filter(u => u.staff_id).map(u => u.staff_id));
    res.json({
      users: dbUsers,
      staff: staffList.map(s => ({ id: s.id, name: s.name, linked: linkedIds.has(s.id) }))
    });
  }));

  router.post('/api/users', safeSync(async (req, res) => {
    if (req.query.role !== 'admin') return res.status(403).json({ detail: 'Sirf Admin user create kar sakta hai' });
    if (!database.data.users) database.data.users = [];
    const d = req.body;
    const uname = (d.username || '').trim().toLowerCase();
    if (!uname || !d.password) return res.status(400).json({ detail: 'Username aur password zaruri hai' });
    if (d.password.length < 4) return res.status(400).json({ detail: 'Password kam se kam 4 characters' });
    const exists = database.data.users.some(u => u.username === uname) || DEFAULT_USERS[uname];
    if (exists) return res.status(400).json({ detail: 'Ye username already exist karta hai' });
    const doc = {
      id: require('crypto').randomUUID(), username: uname, password: d.password,
      display_name: d.display_name || uname, role: d.role || 'viewer',
      permissions: d.permissions || {}, staff_id: d.staff_id || '',
      active: true, created_by: req.query.username || '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    database.data.users.push(doc);
    database.save();
    const { password, ...safe } = doc;
    safe.permissions = getPerms(doc);
    res.json({ success: true, message: `User '${uname}' ban gaya`, user: safe });
  }));

  router.put('/api/users/:id', safeSync(async (req, res) => {
    if (req.query.role !== 'admin') return res.status(403).json({ detail: 'Sirf Admin user update kar sakta hai' });
    if (!database.data.users) database.data.users = [];
    const paramId = req.params.id;
    let idx = database.data.users.findIndex(u => u.id === paramId);
    // Handle default users that aren't in DB yet
    if (idx === -1 && paramId.startsWith('default_')) {
      const uname = paramId.replace('default_', '');
      const defUser = DEFAULT_USERS[uname];
      if (defUser) {
        // Create the default user in DB so it can be edited
        const newDoc = {
          id: paramId, username: uname, password: defUser.password,
          display_name: uname, role: defUser.role,
          permissions: {}, staff_id: '', active: true,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        };
        database.data.users.push(newDoc);
        idx = database.data.users.length - 1;
      }
    }
    if (idx === -1) return res.status(404).json({ detail: 'User nahi mila' });
    const d = req.body;
    if (d.display_name !== undefined) database.data.users[idx].display_name = d.display_name;
    if (d.role !== undefined) database.data.users[idx].role = d.role;
    if (d.permissions !== undefined) database.data.users[idx].permissions = d.permissions;
    if (d.active !== undefined) database.data.users[idx].active = d.active;
    if (d.staff_id !== undefined) database.data.users[idx].staff_id = d.staff_id;
    if (d.password && d.password.trim().length >= 4) database.data.users[idx].password = d.password;
    database.data.users[idx].updated_at = new Date().toISOString();
    database.save();
    const { password, ...safe } = database.data.users[idx];
    safe.permissions = getPerms(database.data.users[idx]);
    res.json({ success: true, message: 'User update ho gaya', user: safe });
  }));

  router.delete('/api/users/:id', safeSync(async (req, res) => {
    if (req.query.role !== 'admin') return res.status(403).json({ detail: 'Sirf Admin user delete kar sakta hai' });
    if (!database.data.users) return res.status(404).json({ detail: 'User nahi mila' });
    const idx = database.data.users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'User nahi mila' });
    if (database.data.users[idx].username === 'admin') return res.status(400).json({ detail: 'Admin user delete nahi ho sakta' });
    database.data.users[idx].active = false;
    database.data.users[idx].updated_at = new Date().toISOString();
    database.save();
    res.json({ success: true, message: 'User deactivate ho gaya' });
  }));

  // ===== FY SETTINGS =====
  router.get('/api/fy-settings', safeSync(async (req, res) => {
    if (!database.data.fy_settings) {
      const now = new Date();
      const y = now.getFullYear();
      const defaultFy = now.getMonth() < 9 ? `${y-1}-${y}` : `${y}-${y+1}`;
      const defaultFinancialYear = now.getMonth() < 3 ? `${y-1}-${y}` : `${y}-${y+1}`;
      database.data.fy_settings = { active_fy: defaultFy, season: '', financial_year: defaultFinancialYear };
    }
    if (!database.data.fy_settings.financial_year) {
      const now = new Date();
      const y = now.getFullYear();
      database.data.fy_settings.financial_year = now.getMonth() < 3 ? `${y-1}-${y}` : `${y}-${y+1}`;
    }
    res.json(database.data.fy_settings);
  }));

  router.put('/api/fy-settings', safeSync(async (req, res) => {
    const active_fy = req.body.active_fy || '';
    const season = req.body.season || '';
    const financial_year = req.body.financial_year || '';
    if (!active_fy) return res.status(400).json({ detail: 'active_fy is required' });
    database.data.fy_settings = { active_fy, season, financial_year, updated_at: new Date().toISOString() };
    database.save();
    res.json(database.data.fy_settings);
  }));

  // ===== BRANDING =====
  router.get('/api/branding', safeSync(async (req, res) => {
    const branding = database.getBranding();
    if (!branding.custom_fields) branding.custom_fields = [];
    res.json(branding);
  }));

  router.put('/api/branding', safeSync(async (req, res) => {
    const custom_fields = (req.body.custom_fields || []).slice(0, 6).filter(f => f.value).map(f => ({
      label: String(f.label || '').trim(),
      value: String(f.value).trim(),
      position: ['left', 'center', 'right'].includes(f.position) ? f.position : 'center',
      placement: ['above', 'below'].includes(f.placement) ? f.placement : 'below'
    }));
    const branding = database.updateBranding({ ...req.body, custom_fields });
    res.json({ success: true, message: 'Branding update ho gaya', branding });
  }));

  // ===== WATERMARK SETTINGS =====
  router.get('/api/settings/watermark', safeSync(async (req, res) => {
    if (!database.data.app_settings) database.data.app_settings = [];
    const wm = database.data.app_settings.find(s => s.setting_id === 'watermark');
    res.json(wm || { setting_id: 'watermark', enabled: false, type: 'text', text: '', image_path: '', opacity: 0.06 });
  }));

  router.put('/api/settings/watermark', safeSync(async (req, res) => {
    if (!database.data.app_settings) database.data.app_settings = [];
    const settings = {
      setting_id: 'watermark',
      enabled: !!req.body.enabled,
      type: req.body.type || 'text',
      text: (req.body.text || '').trim(),
      image_path: (req.body.image_path || '').trim(),
      opacity: Math.max(0.02, Math.min(0.20, parseFloat(req.body.opacity || 0.06))),
      font_size: Math.max(20, Math.min(120, parseInt(req.body.font_size || 52))),
      rotation: Math.max(0, Math.min(90, parseInt(req.body.rotation || 45))),
      updated_at: new Date().toISOString()
    };
    const idx = database.data.app_settings.findIndex(s => s.setting_id === 'watermark');
    if (idx >= 0) database.data.app_settings[idx] = settings;
    else database.data.app_settings.push(settings);
    database.save();
    res.json({ success: true, message: 'Watermark settings update ho gaya', settings });
  }));

  const multer = require('multer');
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const wmUploadDir = path.join(os.homedir(), '.mill-entry-system', 'watermark');
  try { if (!fs.existsSync(wmUploadDir)) fs.mkdirSync(wmUploadDir, { recursive: true }); } catch (e) { console.error('Watermark dir error:', e.message); }
  const wmStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, wmUploadDir),
    filename: (req, file, cb) => cb(null, 'watermark' + path.extname(file.originalname))
  });
  const wmUpload = multer({ storage: wmStorage, fileFilter: (req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  }});

  router.post('/api/settings/watermark/upload', wmUpload.single('file'), safeSync(async (req, res) => {
    if (!req.file) return res.status(400).json({ detail: 'Sirf image file upload karein' });
    const savePath = req.file.path;
    if (!database.data.app_settings) database.data.app_settings = [];
    const idx = database.data.app_settings.findIndex(s => s.setting_id === 'watermark');
    if (idx >= 0) {
      database.data.app_settings[idx].image_path = savePath;
      database.data.app_settings[idx].type = 'image';
    } else {
      database.data.app_settings.push({ setting_id: 'watermark', enabled: false, type: 'image', text: '', image_path: savePath, opacity: 0.06 });
    }
    database.save();
    res.json({ success: true, image_path: savePath });
  }));

  // ===== OPENING STOCK =====
  const STOCK_ITEMS = ['paddy', 'rice_usna', 'rice_raw', 'bran', 'kunda', 'broken', 'rejection_rice', 'pin_broken_rice', 'poll', 'husk', 'frk'];

  router.get('/api/opening-stock', safeSync(async (req, res) => {
    const kms_year = req.query.kms_year || '';
    const financial_year = req.query.financial_year || '';
    if (!database.data.opening_stock) database.data.opening_stock = [];
    const found = database.data.opening_stock.find(s => s.kms_year === kms_year || s.financial_year === financial_year);
    if (found) return res.json(found);
    const defaults = {};
    STOCK_ITEMS.forEach(i => defaults[i] = 0);
    res.json({ kms_year, financial_year, stocks: defaults });
  }));

  router.put('/api/opening-stock', safeSync(async (req, res) => {
    const { kms_year = '', financial_year = '', stocks = {} } = req.body;
    if (!database.data.opening_stock) database.data.opening_stock = [];
    const cleanStocks = {};
    STOCK_ITEMS.forEach(item => {
      const val = stocks[item];
      cleanStocks[item] = val ? parseFloat(val) || 0 : 0;
    });
    const doc = { kms_year, financial_year, stocks: cleanStocks, updated_at: new Date().toISOString() };
    const idx = database.data.opening_stock.findIndex(s => s.kms_year === kms_year);
    if (idx >= 0) database.data.opening_stock[idx] = doc;
    else database.data.opening_stock.push(doc);
    database.save();
    res.json({ success: true, message: 'Opening stock save ho gaya', data: doc });
  }));

  // ===== CARRY FORWARD OPENING STOCK =====
  router.post('/api/opening-stock/carry-forward', safeSync(async (req, res) => {
    const { source_kms_year, target_kms_year, target_financial_year } = req.body;
    if (!source_kms_year || !target_kms_year) {
      return res.status(400).json({ detail: 'Source and target FY years required' });
    }

    // Calculate stock summary for source KMS year (mirrors salebook.js stock-summary logic)
    const round2 = v => Math.round((v || 0) * 100) / 100;
    const filterByKms = (arr) => (arr || []).filter(e => e.kms_year === source_kms_year);

    // Fetch opening stock for source year
    const ob = {};
    if (database.data.opening_stock) {
      const obDoc = database.data.opening_stock.find(s => s.kms_year === source_kms_year);
      if (obDoc && obDoc.stocks) Object.assign(ob, obDoc.stocks);
    }
    const obPaddy = parseFloat(ob.paddy || 0);
    const obUsna = parseFloat(ob.rice_usna || ob.rice || 0);
    const obRaw = parseFloat(ob.rice_raw || 0);
    const obBran = parseFloat(ob.bran || 0);
    const obKunda = parseFloat(ob.kunda || 0);
    const obBroken = parseFloat(ob.broken || 0);
    const obRejectionRice = parseFloat(ob.rejection_rice || 0);
    const obPinBrokenRice = parseFloat(ob.pin_broken_rice || 0);
    const obPoll = parseFloat(ob.poll || 0);
    const obHusk = parseFloat(ob.husk || 0);
    const obFrk = parseFloat(ob.frk || 0);
    const bpObMap = { bran: obBran, kunda: obKunda, broken: obBroken, rejection_rice: obRejectionRice, pin_broken_rice: obPinBrokenRice, poll: obPoll, husk: obHusk };

    const milling = filterByKms(database.data.milling_entries);
    const dc = filterByKms(database.data.dc_entries);
    const pvtSales = filterByKms(database.data.rice_sales);
    const saleVouchers = filterByKms(database.data.sale_vouchers);
    const bpSales = filterByKms(database.data.byproduct_sales);
    const purchaseVouchers = filterByKms(database.data.purchase_vouchers);
    const millEntries = filterByKms(database.data.entries);
    const pvtPaddy = filterByKms(database.data.private_paddy).filter(e => e.source !== 'agent_extra');
    const frkPurchases = filterByKms(database.data.frk_purchases);

    const cmrPaddyIn = round2(millEntries.reduce((s, e) => s + (e.qntl || 0) - (e.bag || 0) / 100 - (e.p_pkt_cut || 0) / 100, 0));
    const pvtPaddyIn = round2(pvtPaddy.reduce((s, e) => s + ((e.final_qntl || 0) || ((e.qntl || 0) - (e.bag || 0) / 100)), 0));
    const paddyUsedMilling = round2(milling.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0));
    const usnaProduced = round2(milling.filter(e => ['usna', 'parboiled'].includes((e.rice_type || '').toLowerCase())).reduce((s, e) => s + (e.rice_qntl || 0), 0));
    const rawProduced = round2(milling.filter(e => (e.rice_type || '').toLowerCase() === 'raw').reduce((s, e) => s + (e.rice_qntl || 0), 0));
    const govtDelivered = round2(dc.reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const pvtSoldUsna = round2(pvtSales.filter(s => ['usna', 'parboiled'].includes((s.rice_type || '').toLowerCase())).reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const pvtSoldRaw = round2(pvtSales.filter(s => (s.rice_type || '').toLowerCase() === 'raw').reduce((s, e) => s + (e.quantity_qntl || 0), 0));

    const sbSold = {};
    saleVouchers.forEach(sv => (sv.items || []).forEach(i => { const n = i.item_name || ''; sbSold[n] = (sbSold[n] || 0) + (parseFloat(i.quantity) || 0); }));
    const pvBought = {};
    purchaseVouchers.forEach(pv => (pv.items || []).forEach(i => { const n = i.item_name || ''; pvBought[n] = (pvBought[n] || 0) + (parseFloat(i.quantity) || 0); }));

    const bpProduced = {};
    const byProducts = ['bran', 'kunda', 'broken', 'rejection_rice', 'pin_broken_rice', 'poll', 'husk'];
    byProducts.forEach(p => { bpProduced[p] = round2(milling.reduce((s, e) => s + (e[`${p}_qntl`] || 0), 0)); });
    const bpSoldMap = {};
    bpSales.forEach(s => { const p = s.product || ''; bpSoldMap[p] = (bpSoldMap[p] || 0) + (s.quantity_qntl || 0); });

    const frkIn = round2((frkPurchases || []).reduce((s, e) => s + (e.quantity_qntl || e.quantity || 0), 0));

    // Calculate available (closing) stock for each item
    const pvPaddy = round2(pvBought['Paddy'] || 0);
    const paddyTotalIn = round2(cmrPaddyIn + pvtPaddyIn + pvPaddy);
    const paddyAvail = round2(obPaddy + paddyTotalIn - paddyUsedMilling);

    const pvUsna = round2(pvBought['Rice (Usna)'] || 0);
    const usnaSoldTotal = round2(govtDelivered + pvtSoldUsna + (sbSold['Rice (Usna)'] || 0));
    const usnaAvail = round2(obUsna + usnaProduced + pvUsna - usnaSoldTotal);

    const pvRaw = round2(pvBought['Rice (Raw)'] || 0);
    const rawSoldTotal = round2(pvtSoldRaw + (sbSold['Rice (Raw)'] || 0));
    const rawAvail = round2(obRaw + rawProduced + pvRaw - rawSoldTotal);

    const bpClosing = {};
    byProducts.forEach(p => {
      const produced = bpProduced[p] || 0;
      const soldBp = round2(bpSoldMap[p] || 0);
      const soldSb = sbSold[p.charAt(0).toUpperCase() + p.slice(1)] || 0;
      const purchased = pvBought[p.charAt(0).toUpperCase() + p.slice(1)] || 0;
      const itemOb = bpObMap[p] || 0;
      bpClosing[p] = round2(itemOb + produced + purchased - soldBp - soldSb);
    });

    const frkPurchasedPv = pvBought['FRK'] || 0;
    const frkTotalIn = round2(frkIn + frkPurchasedPv);
    const frkSoldSb = sbSold['FRK'] || 0;
    const frkAvail = round2(obFrk + frkTotalIn - frkSoldSb);

    // Map closing stock to opening stock keys
    const closing = {
      paddy: paddyAvail,
      rice_usna: usnaAvail,
      rice_raw: rawAvail,
      bran: bpClosing.bran || 0,
      kunda: bpClosing.kunda || 0,
      broken: bpClosing.broken || 0,
      rejection_rice: bpClosing.rejection_rice || 0,
      pin_broken_rice: bpClosing.pin_broken_rice || 0,
      poll: bpClosing.poll || 0,
      husk: bpClosing.husk || 0,
      frk: frkAvail
    };

    // Ensure all keys exist
    STOCK_ITEMS.forEach(k => { if (!(k in closing)) closing[k] = 0; });

    const doc = {
      kms_year: target_kms_year,
      financial_year: target_financial_year || '',
      stocks: closing,
      auto_carried: true,
      carried_from: source_kms_year,
      updated_at: new Date().toISOString()
    };

    if (!database.data.opening_stock) database.data.opening_stock = [];
    const idx = database.data.opening_stock.findIndex(s => s.kms_year === target_kms_year);
    if (idx >= 0) database.data.opening_stock[idx] = doc;
    else database.data.opening_stock.push(doc);
    database.save();

    res.json({ success: true, message: `Closing stock ${source_kms_year} → Opening stock ${target_kms_year} carry forward ho gaya`, data: doc });
  }));

  // ===== HEALTH CHECK =====
  router.get('/api/health', safeSync(async (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  }));

  // ===== ERROR LOG =====
  router.get('/api/error-log', safeSync(async (req, res) => {
    try {
      if (fs.existsSync(errorLogPath)) {
        const content = fs.readFileSync(errorLogPath, 'utf8');
        const lines = content.split('\n');
        const lastLines = lines.slice(-200).join('\n');
        res.json({ content: lastLines || "Koi error nahi hai.", available: true });
      } else {
        res.json({ content: "Koi error log nahi hai. Sab sahi chal raha hai!", available: true });
      }
    } catch (err) {
      res.json({ content: "Error log read nahi ho paya: " + err.message, available: true });
    }
  }));

  router.delete('/api/error-log', safeSync(async (req, res) => {
    try {
      if (fs.existsSync(errorLogPath)) {
        fs.writeFileSync(errorLogPath, '');
      }
      res.json({ success: true, message: 'Error log clear ho gaya' });
    } catch (err) {
      res.status(500).json({ detail: 'Log clear nahi ho paya: ' + err.message });
    }
  }));

  // ===== AUDIT LOG =====
  router.get('/api/audit-log', safeSync(async (req, res) => {
    if (req.query.role !== 'admin') return res.status(403).json({ detail: 'Sirf Admin audit log dekh sakta hai' });
    if (!database.data.audit_log) database.data.audit_log = [];
    let logs = [...database.data.audit_log];
    if (req.query.filter_user) logs = logs.filter(l => l.username === req.query.filter_user);
    if (req.query.filter_collection) logs = logs.filter(l => l.collection === req.query.filter_collection);
    if (req.query.filter_date) logs = logs.filter(l => l.timestamp && l.timestamp.startsWith(req.query.filter_date));
    if (req.query.record_id) logs = logs.filter(l => l.record_id === req.query.record_id);
    logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.page_size) || 30;
    const start = (page - 1) * pageSize;
    res.json({ logs: logs.slice(start, start + pageSize), total: logs.length, page, page_size: pageSize });
  }));

  router.get('/api/audit-log/record/:recordId', safeSync(async (req, res) => {
    if (!database.data.audit_log) database.data.audit_log = [];
    const logs = database.data.audit_log
      .filter(l => l.record_id === req.params.recordId)
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    res.json({ logs });
  }));

  router.delete('/api/audit-log/clear', safeSync(async (req, res) => {
    if (req.query.role !== 'admin') return res.status(403).json({ detail: 'Sirf Admin audit log clear kar sakta hai' });
    if (!database.data.audit_log) database.data.audit_log = [];
    const days = parseInt(req.query.days) || 0;
    if (days > 0) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const before = database.data.audit_log.length;
      database.data.audit_log = database.data.audit_log.filter(l => (l.timestamp || '') >= cutoff);
      const deleted = before - database.data.audit_log.length;
      database.save();
      res.json({ deleted, message: `${days} din se purane ${deleted} logs delete ho gaye` });
    } else {
      const deleted = database.data.audit_log.length;
      database.data.audit_log = [];
      database.save();
      res.json({ deleted, message: `Sab ${deleted} audit logs clear ho gaye` });
    }
  }));

  // ============ GOVT USEFUL LINKS ============
  router.get('/api/govt-links', safeSync(async (req, res) => {
    // Store in app_settings for persistence
    const settings = database.data.app_settings || [];
    const linksSetting = settings.find(s => s.setting_id === 'govt_links');
    res.json(linksSetting?.value || []);
  }));

  router.put('/api/govt-links', safeSync(async (req, res) => {
    const links = Array.isArray(req.body) ? req.body : [];
    links.forEach((l, i) => { if (!l.id) l.id = require('crypto').randomUUID(); l.order = i; });
    if (!database.data.app_settings) database.data.app_settings = [];
    const idx = database.data.app_settings.findIndex(s => s.setting_id === 'govt_links');
    const setting = { setting_id: 'govt_links', value: links, updated_at: new Date().toISOString() };
    if (idx >= 0) database.data.app_settings[idx] = setting;
    else database.data.app_settings.push(setting);
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json({ success: true, count: links.length });
  }));

  router.post('/api/govt-links', safeSync(async (req, res) => {
    const links = Array.isArray(req.body) ? req.body : [];
    links.forEach((l, i) => { if (!l.id) l.id = require('crypto').randomUUID(); l.order = i; });
    if (!database.data.app_settings) database.data.app_settings = [];
    const idx = database.data.app_settings.findIndex(s => s.setting_id === 'govt_links');
    const setting = { setting_id: 'govt_links', value: links, updated_at: new Date().toISOString() };
    if (idx >= 0) database.data.app_settings[idx] = setting;
    else database.data.app_settings.push(setting);
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json({ success: true, count: links.length });
  }));

  // ============ VERIFICATION METER SETTINGS (FCI Weekly Verification Report) ============
  router.get('/api/settings/verification-meter', safeSync(async (req, res) => {
    const settings = database.data.app_settings || [];
    const s = settings.find(x => x.setting_id === 'verification_meter');
    if (!s) return res.json({ last_meter_reading: 0, last_verification_date: '', units_per_qtl: 6.0, rice_recovery: 0.67,
                              electricity_kw: 0, electricity_kv: 0, milling_capacity_mt: 0, variety: 'Boiled',
                              whatsapp_number: '', whatsapp_group_link: '' });
    res.json({
      last_meter_reading: +(s.last_meter_reading || 0),
      last_verification_date: s.last_verification_date || '',
      units_per_qtl: +(s.units_per_qtl || 6.0),
      rice_recovery: +(s.rice_recovery || 0.67),
      electricity_kw: +(s.electricity_kw || 0),
      electricity_kv: +(s.electricity_kv || 0),
      milling_capacity_mt: +(s.milling_capacity_mt || 0),
      variety: s.variety || 'Boiled',
      whatsapp_number: s.whatsapp_number || '',
      whatsapp_group_link: s.whatsapp_group_link || '',
    });
  }));

  router.put('/api/settings/verification-meter', safeSync(async (req, res) => {
    const d = req.body || {};
    if (!database.data.app_settings) database.data.app_settings = [];
    const payload = {
      setting_id: 'verification_meter',
      last_meter_reading: +(d.last_meter_reading || 0),
      last_verification_date: String(d.last_verification_date || ''),
      units_per_qtl: +(d.units_per_qtl || 6.0),
      rice_recovery: +(d.rice_recovery || 0.67),
      electricity_kw: +(d.electricity_kw || 0),
      electricity_kv: +(d.electricity_kv || 0),
      milling_capacity_mt: +(d.milling_capacity_mt || 0),
      variety: String(d.variety || 'Boiled'),
      whatsapp_number: String(d.whatsapp_number || '').trim(),
      whatsapp_group_link: String(d.whatsapp_group_link || '').trim(),
      updated_at: new Date().toISOString(),
    };
    const idx = database.data.app_settings.findIndex(x => x.setting_id === 'verification_meter');
    if (idx >= 0) database.data.app_settings[idx] = payload;
    else database.data.app_settings.push(payload);
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    const { setting_id, ...rest } = payload;
    res.json({ success: true, ...rest });
  }));




  return router;
};
