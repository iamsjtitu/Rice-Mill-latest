const express = require('express');
const { safeSync } = require('./safe_handler');
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
    const user = database.getUser(username);
    if (user) {
      if (user.active === false) return res.status(401).json({ detail: 'Account deactivated hai. Admin se baat karo.' });
      if (user.password === password) {
        return res.json({ success: true, username: user.username, role: user.role,
          display_name: user.display_name || user.username, permissions: getPerms(user), message: 'Login successful' });
      }
      return res.status(401).json({ detail: 'Password galat hai' });
    }
    if (DEFAULT_USERS[username] && DEFAULT_USERS[username].password === password) {
      const role = DEFAULT_USERS[username].role;
      return res.json({ success: true, username, role, display_name: username,
        permissions: { ...(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.admin) }, message: 'Login successful' });
    }
    res.status(401).json({ detail: `User "${username}" nahi mila` });
  }));

  router.post('/api/auth/change-password', safeSync(async (req, res) => {
    const { username, current_password, new_password } = req.body;
    const user = database.getUser(username);
    if (!user || user.password !== current_password) {
      return res.status(401).json({ detail: 'Current password galat hai' });
    }
    database.updateUserPassword(username, new_password);
    res.json({ success: true, message: 'Password change ho gaya' });
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
    res.json(database.data.govt_links || []);
  }));

  router.put('/api/govt-links', safeSync(async (req, res) => {
    const links = req.body || [];
    links.forEach((l, i) => { if (!l.id) l.id = require('crypto').randomUUID(); l.order = i; });
    database.data.govt_links = links;
    await database.save();
    res.json({ success: true, count: links.length });
  }));





  return router;
};
