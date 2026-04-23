require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 7000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[Warning] JWT_SECRET is weak/missing. Set a strong secret in .env (32+ chars) before production use.');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'insecure-default-please-change-me-now-32chars';
}

// Build version — regenerated on every boot. pm2 restart after self-update → new version → client auto-refreshes.
const PKG = (() => { try { return require('./package.json'); } catch { return { version: '1.0.0' }; } })();
const BUILD_VERSION = `${PKG.version}-${Date.now().toString(36)}`;
const BOOT_AT = new Date().toISOString();
console.log(`[boot] build_version=${BUILD_VERSION}`);

// Load DB
db.load();

// Start expiry notification scheduler (7-day warnings + expiry-day messages)
const expiryScheduler = require('./utils/expiry-scheduler');
expiryScheduler.start();

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

// Health / version probe (unauth, no-cache) — used by client to auto-refresh when server updates.
app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: BUILD_VERSION, boot_at: BOOT_AT, pkg_version: PKG.version });
});

// ========= CACHE-BUSTING MIDDLEWARE =========
// index.html is served dynamically with BUILD_VERSION injected into asset URLs,
// so every deploy invalidates the browser cache automatically.
function serveIndexHtml(req, res) {
  try {
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const v = encodeURIComponent(BUILD_VERSION);
    html = html
      .replace(/(href=)"\/styles\.css"/g, `$1"/styles.css?v=${v}"`)
      .replace(/(src=)"\/app\.js"/g, `$1"/app.js?v=${v}"`)
      .replace(/<\/head>/i, `  <meta name="build-version" content="${BUILD_VERSION}">\n</head>`);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.type('html').send(html);
  } catch (e) {
    res.status(500).send('Failed to render index.html: ' + e.message);
  }
}

app.get('/', serveIndexHtml);
app.get('/index.html', serveIndexHtml);

// Static admin dashboard — assets can be cached long because index.html references them with ?v=BUILD_VERSION
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    // HTML pages must never be cached (should not normally reach here, but belt-and-braces)
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/license', require('./routes/license'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: '1.0.0', build: BUILD_VERSION });
});

// Fallback: dashboard SPA (serves dynamic index.html for any unmatched GET)
app.get('*', serveIndexHtml);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`  MillEntry Central License Server`);
  console.log(`  Running on port ${PORT}`);
  console.log(`  Admin dashboard: http://localhost:${PORT}/`);
  console.log(`  API base: http://localhost:${PORT}/api/`);
  console.log(`  Build: ${BUILD_VERSION}`);
  console.log(`=================================================\n`);
});
