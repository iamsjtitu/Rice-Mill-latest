const express = require('express');
const router = express.Router();

module.exports = function(database) {

// ============ AUTH ENDPOINTS ============
router.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = database.getUser(username);
  if (user && user.password === password) {
    return res.json({ success: true, username: user.username, role: user.role, message: 'Login successful' });
  }
  res.status(401).json({ detail: 'Invalid username or password' });
});

router.get('/api/auth/verify', (req, res) => {
  const { username, role } = req.query;
  const user = database.getUser(username);
  if (user && user.role === role) return res.json({ valid: true, username, role });
  res.json({ valid: false });
});

router.post('/api/auth/change-password', (req, res) => {
  const { username, current_password, new_password } = req.body;
  const user = database.getUser(username);
  if (!user || user.password !== current_password) {
    return res.status(401).json({ detail: 'Current password galat hai' });
  }
  database.updateUserPassword(username, new_password);
  res.json({ success: true, message: 'Password changed successfully' });
});

// ============ FY SETTINGS ============
router.get('/api/fy-settings', (req, res) => {
  if (!database.data.fy_settings) {
    const now = new Date();
    const y = now.getFullYear();
    const defaultFy = now.getMonth() < 9 ? `${y-1}-${y}` : `${y}-${y+1}`;
    database.data.fy_settings = { active_fy: defaultFy, season: '' };
  }
  res.json(database.data.fy_settings);
});

router.put('/api/fy-settings', (req, res) => {
  const active_fy = req.body.active_fy || '';
  const season = req.body.season || '';
  if (!active_fy) return res.status(400).json({ detail: 'active_fy is required' });
  database.data.fy_settings = { active_fy, season, updated_at: new Date().toISOString() };
  database.save();
  res.json(database.data.fy_settings);
});

// ============ BRANDING ============
router.get('/api/branding', (req, res) => res.json(database.getBranding()));

router.put('/api/branding', (req, res) => {
  const branding = database.updateBranding(req.body);
  res.json({ success: true, message: 'Branding update ho gaya', branding });
});



  return router;
};
