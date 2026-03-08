const express = require('express');
const router = express.Router();

module.exports = function(database) {
  // Helper reference
  const ExcelJS = require('exceljs');
  const PDFDocument = require('pdfkit');

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

// ============ BRANDING ============
router.get('/api/branding', (req, res) => res.json(database.getBranding()));

router.put('/api/branding', (req, res) => {
  const branding = database.updateBranding(req.body);
  res.json({ success: true, message: 'Branding update ho gaya', branding });
});



  return router;
};
