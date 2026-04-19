require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 7000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[Warning] JWT_SECRET is weak/missing. Set a strong secret in .env (32+ chars) before production use.');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'insecure-default-please-change-me-now-32chars';
}

// Load DB
db.load();

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

// Static admin dashboard
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/license', require('./routes/license'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: '1.0.0' });
});

// Fallback: dashboard SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`  MillEntry Central License Server`);
  console.log(`  Running on port ${PORT}`);
  console.log(`  Admin dashboard: http://localhost:${PORT}/`);
  console.log(`  API base: http://localhost:${PORT}/api/`);
  console.log(`=================================================\n`);
});
