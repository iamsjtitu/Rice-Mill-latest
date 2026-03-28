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
  router.post('/api/print', safeSync((req, res) => {
    const id = require('uuid').v4();
    printPages[id] = req.body.html;
    setTimeout(() => delete printPages[id], 300000);
    res.json({ id, url: `/api/print/${id}` });
  }));
  router.get('/api/print/:id', safeSync((req, res) => {
    const html = printPages[req.params.id];
    if (!html) return res.status(404).send('<h1>Page expired. Please try again.</h1>');
    delete printPages[req.params.id];
    res.type('html').send(html);
  }));

  // ===== AUTH =====
  router.post('/api/auth/login', safeSync((req, res) => {
    const { username, password } = req.body;
    const user = database.getUser(username);
    if (user && user.password === password) {
      res.json({ success: true, username: user.username, role: user.role, message: 'Login successful' });
    } else {
      res.status(401).json({ detail: 'Invalid username or password' });
    }
  }));

  router.post('/api/auth/change-password', safeSync((req, res) => {
    const { username, current_password, new_password } = req.body;
    const user = database.getUser(username);
    if (!user || user.password !== current_password) {
      return res.status(401).json({ detail: 'Current password galat hai' });
    }
    database.updateUserPassword(username, new_password);
    res.json({ success: true, message: 'Password change ho gaya' });
  }));

  router.get('/api/auth/verify', safeSync((req, res) => {
    const { username, role } = req.query;
    const user = database.getUser(username);
    if (user && user.role === role) {
      res.json({ valid: true, username, role });
    } else {
      res.json({ valid: false });
    }
  }));

  // ===== FY SETTINGS =====
  router.get('/api/fy-settings', safeSync((req, res) => {
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

  router.put('/api/fy-settings', safeSync((req, res) => {
    const active_fy = req.body.active_fy || '';
    const season = req.body.season || '';
    const financial_year = req.body.financial_year || '';
    if (!active_fy) return res.status(400).json({ detail: 'active_fy is required' });
    database.data.fy_settings = { active_fy, season, financial_year, updated_at: new Date().toISOString() };
    database.save();
    res.json(database.data.fy_settings);
  }));

  // ===== BRANDING =====
  router.get('/api/branding', safeSync((req, res) => {
    const branding = database.getBranding();
    if (!branding.custom_fields) branding.custom_fields = [];
    res.json(branding);
  }));

  router.put('/api/branding', safeSync((req, res) => {
    const custom_fields = (req.body.custom_fields || []).slice(0, 6).filter(f => f.label && f.value).map(f => ({
      label: String(f.label).trim(),
      value: String(f.value).trim(),
      position: ['left', 'center', 'right'].includes(f.position) ? f.position : 'center'
    }));
    const branding = database.updateBranding({ ...req.body, custom_fields });
    res.json({ success: true, message: 'Branding update ho gaya', branding });
  }));

  // ===== OPENING STOCK =====
  const STOCK_ITEMS = ['paddy', 'rice', 'bran', 'kunda', 'broken', 'kanki', 'husk', 'frk'];

  router.get('/api/opening-stock', safeSync((req, res) => {
    const kms_year = req.query.kms_year || '';
    const financial_year = req.query.financial_year || '';
    if (!database.data.opening_stock) database.data.opening_stock = [];
    const found = database.data.opening_stock.find(s => s.kms_year === kms_year || s.financial_year === financial_year);
    if (found) return res.json(found);
    const defaults = {};
    STOCK_ITEMS.forEach(i => defaults[i] = 0);
    res.json({ kms_year, financial_year, stocks: defaults });
  }));

  router.put('/api/opening-stock', safeSync((req, res) => {
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

  // ===== HEALTH CHECK =====
  router.get('/api/health', safeSync((req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  }));

  // ===== ERROR LOG =====
  router.get('/api/error-log', safeSync((req, res) => {
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

  router.delete('/api/error-log', safeSync((req, res) => {
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
