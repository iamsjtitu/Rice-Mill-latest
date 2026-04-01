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

  router.post('/api/auth/login', safeSync(async (req, res) => {
    const { username, password } = req.body;
    console.log(`[LOGIN] Attempt: username="${username}"`);
    // Check database first (supports changed passwords)
    const user = database.getUser(username);
    if (user) {
      console.log(`[LOGIN] User "${username}" found in DB, stored_pass_len=${(user.password||'').length}, entered_pass_len=${(password||'').length}, match=${user.password === password}`);
      if (user.password === password) {
        return res.json({ success: true, username: user.username, role: user.role, message: 'Login successful' });
      }
      return res.status(401).json({ detail: `Password galat hai (DB user found, stored=${(user.password||'').length} chars, entered=${(password||'').length} chars)` });
    }
    console.log(`[LOGIN] User "${username}" NOT in DB, total_users=${(database.data.users||[]).length}, checking defaults...`);
    // Fallback to defaults if user not in database
    if (DEFAULT_USERS[username] && DEFAULT_USERS[username].password === password) {
      return res.json({ success: true, username, role: DEFAULT_USERS[username].role, message: 'Login successful' });
    }
    res.status(401).json({ detail: `User "${username}" nahi mila (total users in DB: ${(database.data.users||[]).length})` });
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
      return res.json({ valid: true, username, role });
    }
    // Fallback to defaults
    if (DEFAULT_USERS[username] && DEFAULT_USERS[username].role === role) {
      return res.json({ valid: true, username, role });
    }
    res.json({ valid: false });
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

  // ===== OPENING STOCK =====
  const STOCK_ITEMS = ['paddy', 'rice_usna', 'rice_raw', 'bran', 'kunda', 'broken', 'kanki', 'husk', 'frk'];

  router.get('/api/opening-stock', safeSync(async (req, res) => {
    const kms_year = req.query.kms_year || '';
    const financial_year = req.query.financial_year || '';
    if (!database.data.opening_stock) database.data.opening_stock = [];
    const key = kms_year || financial_year;
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
    const obKanki = parseFloat(ob.kanki || 0);
    const obHusk = parseFloat(ob.husk || 0);
    const obFrk = parseFloat(ob.frk || 0);
    const bpObMap = { bran: obBran, kunda: obKunda, broken: obBroken, kanki: obKanki, husk: obHusk };

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

    const byProducts = ['bran', 'kunda', 'broken', 'kanki', 'husk'];
    const bpProduced = {};
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
      kanki: bpClosing.kanki || 0,
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

  return router;
};
