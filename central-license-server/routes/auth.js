const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim()); }

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const data = db.getData();
  const admin = (data.super_admins || []).find(a => a.email.toLowerCase() === String(email).toLowerCase());
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ sub: admin.id, email: admin.email, role: 'super_admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, email: admin.email, expires_in: 43200 });
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ email: decoded.email, role: decoded.role });
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// PUT /api/auth/change-credentials — update email and/or password.
// Always requires the CURRENT password as verification, even when only changing email.
// Returns a fresh JWT so the session stays logged in if email changed.
router.put('/change-credentials', requireSuperAdmin, async (req, res) => {
  const { current_password, new_email, new_password } = req.body || {};
  if (!current_password) return res.status(400).json({ error: 'Current password required' });
  if (!new_email && !new_password) return res.status(400).json({ error: 'Provide new email or new password' });

  const data = db.getData();
  const admin = (data.super_admins || []).find(a => a.id === req.user.sub);
  if (!admin) return res.status(404).json({ error: 'Admin account not found' });

  const ok = await bcrypt.compare(current_password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  if (new_email) {
    const email = String(new_email).trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    // Prevent duplicate emails across admins
    const dup = (data.super_admins || []).find(a => a.id !== admin.id && a.email.toLowerCase() === email);
    if (dup) return res.status(409).json({ error: 'This email is already in use by another admin' });
    admin.email = email;
  }

  if (new_password) {
    if (String(new_password).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    admin.password_hash = await bcrypt.hash(String(new_password), 10);
  }

  admin.updated_at = new Date().toISOString();
  db.saveImmediate();

  // Issue a fresh token with potentially-updated email so the session keeps working
  const token = jwt.sign({ sub: admin.id, email: admin.email, role: 'super_admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ success: true, email: admin.email, token });
});

module.exports = router;
