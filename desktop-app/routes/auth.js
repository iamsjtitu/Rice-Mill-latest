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
  const DEFAULT_USERS = {
    'admin': { password: 'admin123', role: 'admin' },
    'staff': { password: 'staff123', role: 'staff' }
  };

  router.post('/api/auth/login', safeSync((req, res) => {
    const { username, password } = req.body;
    // Check database first (supports changed passwords)
    const user = database.getUser(username);
    if (user) {
      if (user.password === password) {
        return res.json({ success: true, username: user.username, role: user.role, message: 'Login successful' });
      }
      return res.status(401).json({ detail: 'Invalid username or password' });
    }
    // Fallback to defaults if user not in database
    if (DEFAULT_USERS[username] && DEFAULT_USERS[username].password === password) {
      return res.json({ success: true, username, role: DEFAULT_USERS[username].role, message: 'Login successful' });
    }
    res.status(401).json({ detail: 'Invalid username or password' });
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
      return res.json({ valid: true, username, role });
    }
    // Fallback to defaults
    if (DEFAULT_USERS[username] && DEFAULT_USERS[username].role === role) {
      return res.json({ valid: true, username, role });
    }
    res.json({ valid: false });
  }));

  // ===== FY SETTINGS =====
  router.get('/api/fy-settings', safeSync((req, res) => {
    if (!database.data.fy_settings) {
      const now = new Date();
      const y = now.getFullYear();
      const defaultFy = now.getMonth() < 9 ? `${y-1}-${y}` : `${y}-${y+1}`;
      database.data.fy_settings = { active_fy: defaultFy, season: '' };
    }
    res.json(database.data.fy_settings);
  }));

  router.put('/api/fy-settings', safeSync((req, res) => {
    const active_fy = req.body.active_fy || '';
    const season = req.body.season || '';
    if (!active_fy) return res.status(400).json({ detail: 'active_fy is required' });
    database.data.fy_settings = { active_fy, season, updated_at: new Date().toISOString() };
    database.save();
    res.json(database.data.fy_settings);
  }));

  // ===== BRANDING =====
  router.get('/api/branding', safeSync((req, res) => {
    res.json(database.getBranding());
  }));

  router.put('/api/branding', safeSync((req, res) => {
    const branding = database.updateBranding(req.body);
    res.json({ success: true, message: 'Branding update ho gaya', branding });
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
