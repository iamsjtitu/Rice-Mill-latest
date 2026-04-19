const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database');

const router = express.Router();

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

module.exports = router;
