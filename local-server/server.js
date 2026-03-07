/**
 * Mill Entry System - Standalone Local Server
 * Same web version, runs on localhost, data saved locally
 * Usage: node server.js
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const PORT = 8080;
const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BACKUPS = 7;

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ============ JSON DATABASE CLASS ============
class JsonDatabase {
  constructor(dataFolder) {
    this.dataFolder = dataFolder;
    this.dbFile = path.join(dataFolder, 'millentry-data.json');
    this.data = this.load();
    this.autoSaveInterval = setInterval(() => this.save(), 30000); // Auto-save every 30s
  }

  load() {
    try {
      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf8');
        console.log(`[DB] Data loaded from ${this.dbFile}`);
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[DB] Load error:', e.message);
    }
    
    console.log('[DB] Creating new database...');
    return {
      branding: {
        company_name: 'NAVKAR AGRO',
        tagline: 'JOLKO, KESINGA - Mill Entry System',
        updated_at: new Date().toISOString()
      },
      users: [
        { username: 'admin', password: 'admin123', role: 'admin' },
        { username: 'staff', password: 'staff123', role: 'staff' }
      ],
      entries: [],
      mandi_targets: [],
      truck_payments: [],
      agent_payments: [],
      milling_entries: []
    };
  }

  save() {
    try {
      fs.writeFileSync(this.dbFile, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('[DB] Save error:', e.message);
    }
  }

  // ---- Branding ----
  getBranding() {
    return this.data.branding || { company_name: 'NAVKAR AGRO', tagline: 'JOLKO, KESINGA - Mill Entry System' };
  }

  updateBranding(branding) {
    this.data.branding = { ...this.data.branding, ...branding, updated_at: new Date().toISOString() };
    this.save();
    return this.data.branding;
  }

  // ---- Users ----
  getUser(username) {
    return this.data.users.find(u => u.username === username);
  }

  updateUserPassword(username, newPassword) {
    const user = this.data.users.find(u => u.username === username);
    if (user) {
      user.password = newPassword;
      this.save();
    }
    return user;
  }

  // ---- Entries ----
  getEntries(filters = {}) {
    let entries = [...this.data.entries];
    
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);
    if (filters.truck_no) entries = entries.filter(e => e.truck_no?.toLowerCase().includes(filters.truck_no.toLowerCase()));
    if (filters.rst_no) entries = entries.filter(e => e.rst_no?.toLowerCase().includes(filters.rst_no.toLowerCase()));
    if (filters.tp_no) entries = entries.filter(e => e.tp_no?.toLowerCase().includes(filters.tp_no.toLowerCase()));
    if (filters.agent_name) entries = entries.filter(e => e.agent_name?.toLowerCase().includes(filters.agent_name.toLowerCase()));
    if (filters.mandi_name) entries = entries.filter(e => e.mandi_name?.toLowerCase().includes(filters.mandi_name.toLowerCase()));
    if (filters.date_from) entries = entries.filter(e => e.date >= filters.date_from);
    if (filters.date_to) entries = entries.filter(e => e.date <= filters.date_to);
    
    return entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  addEntry(entry) {
    const calculated = this.calculateFields(entry);
    const newEntry = {
      id: uuidv4(),
      ...entry,
      ...calculated,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.data.entries.push(newEntry);
    this.save();
    return newEntry;
  }

  updateEntry(id, updates) {
    const index = this.data.entries.findIndex(e => e.id === id);
    if (index === -1) return null;
    
    const merged = { ...this.data.entries[index], ...updates };
    const calculated = this.calculateFields(merged);
    this.data.entries[index] = {
      ...merged,
      ...calculated,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.entries[index];
  }

  deleteEntry(id) {
    const len = this.data.entries.length;
    this.data.entries = this.data.entries.filter(e => e.id !== id);
    if (this.data.entries.length < len) { this.save(); return true; }
    return false;
  }

  bulkDeleteEntries(ids) {
    this.data.entries = this.data.entries.filter(e => !ids.includes(e.id));
    this.save();
  }

  calculateFields(data) {
    const kg = parseFloat(data.kg) || 0;
    const gbw_cut = parseFloat(data.gbw_cut) || 0;
    const plastic_bag = parseInt(data.plastic_bag) || 0;
    const cutting_percent = parseFloat(data.cutting_percent) || 0;
    const moisture = parseFloat(data.moisture) || 0;
    const disc_dust_poll = parseFloat(data.disc_dust_poll) || 0;

    const qntl = Math.round((kg / 100) * 100) / 100;
    const mill_w = kg - gbw_cut;
    const mill_w_qntl = mill_w / 100;
    const p_pkt_cut = Math.round(plastic_bag * 0.5 * 100) / 100;

    const moisture_cut_percent = Math.max(0, moisture - 17);
    const moisture_cut_qntl = Math.round((mill_w_qntl * moisture_cut_percent / 100) * 100) / 100;
    const moisture_cut = Math.round(moisture_cut_qntl * 100 * 100) / 100;

    const cutting_qntl = Math.round((mill_w_qntl * cutting_percent / 100) * 100) / 100;
    const cutting = Math.round(cutting_qntl * 100 * 100) / 100;

    const p_pkt_cut_qntl = p_pkt_cut / 100;
    const disc_dust_poll_qntl = disc_dust_poll / 100;
    const final_w_qntl = mill_w_qntl - p_pkt_cut_qntl - moisture_cut_qntl - cutting_qntl - disc_dust_poll_qntl;
    const final_w = Math.round(final_w_qntl * 100 * 100) / 100;

    return { qntl, mill_w, p_pkt_cut, moisture_cut, moisture_cut_percent, moisture_cut_qntl, cutting, cutting_qntl, final_w };
  }

  getTotals(filters = {}) {
    const entries = this.getEntries(filters);
    return entries.reduce((acc, e) => ({
      total_kg: acc.total_kg + (e.kg || 0),
      total_qntl: acc.total_qntl + (e.qntl || 0),
      total_bag: acc.total_bag + (e.bag || 0),
      total_g_deposite: acc.total_g_deposite + (e.g_deposite || 0),
      total_gbw_cut: acc.total_gbw_cut + (e.gbw_cut || 0),
      total_mill_w: acc.total_mill_w + (e.mill_w || 0),
      total_p_pkt_cut: acc.total_p_pkt_cut + (e.p_pkt_cut || 0),
      total_cutting: acc.total_cutting + (e.cutting || 0),
      total_disc_dust_poll: acc.total_disc_dust_poll + (e.disc_dust_poll || 0),
      total_final_w: acc.total_final_w + (e.final_w || 0),
      total_g_issued: acc.total_g_issued + (e.g_issued || 0),
      total_cash_paid: acc.total_cash_paid + (e.cash_paid || 0),
      total_diesel_paid: acc.total_diesel_paid + (e.diesel_paid || 0)
    }), {
      total_kg: 0, total_qntl: 0, total_bag: 0, total_g_deposite: 0,
      total_gbw_cut: 0, total_mill_w: 0, total_p_pkt_cut: 0, total_cutting: 0,
      total_disc_dust_poll: 0, total_final_w: 0, total_g_issued: 0,
      total_cash_paid: 0, total_diesel_paid: 0
    });
  }

  // ---- Suggestions ----
  getSuggestions(field) {
    const values = new Set();
    this.data.entries.forEach(e => { if (e[field]) values.add(e[field]); });
    return Array.from(values);
  }

  // ---- Mandi Targets ----
  getMandiTargets(filters = {}) {
    let targets = [...this.data.mandi_targets];
    if (filters.kms_year) targets = targets.filter(t => t.kms_year === filters.kms_year);
    if (filters.season) targets = targets.filter(t => t.season === filters.season);
    return targets;
  }

  addMandiTarget(target) {
    const existing = this.data.mandi_targets.find(t =>
      t.mandi_name === target.mandi_name && t.kms_year === target.kms_year && t.season === target.season
    );
    if (existing) return { error: `${target.mandi_name} ka target already set hai is KMS Year aur Season ke liye` };

    const newTarget = {
      id: uuidv4(),
      ...target,
      expected_total: Math.round((target.target_qntl + (target.target_qntl * target.cutting_percent / 100)) * 100) / 100,
      created_at: new Date().toISOString()
    };
    this.data.mandi_targets.push(newTarget);
    this.save();
    return newTarget;
  }

  updateMandiTarget(id, updates) {
    const index = this.data.mandi_targets.findIndex(t => t.id === id);
    if (index === -1) return null;
    const merged = { ...this.data.mandi_targets[index], ...updates };
    merged.expected_total = Math.round((merged.target_qntl + (merged.target_qntl * merged.cutting_percent / 100)) * 100) / 100;
    this.data.mandi_targets[index] = merged;
    this.save();
    return merged;
  }

  deleteMandiTarget(id) {
    this.data.mandi_targets = this.data.mandi_targets.filter(t => t.id !== id);
    this.save();
  }

  // ---- Truck Payments ----
  getTruckPayment(entryId) {
    const found = this.data.truck_payments.find(p => p.entry_id === entryId);
    if (found) {
      return { rate_per_qntl: 32, paid_amount: 0, status: 'pending', payments_history: [], ...found };
    }
    return {
      entry_id: entryId, rate_per_qntl: 32, paid_amount: 0, status: 'pending', payments_history: []
    };
  }

  updateTruckPayment(entryId, payment) {
    const index = this.data.truck_payments.findIndex(p => p.entry_id === entryId);
    if (index !== -1) {
      this.data.truck_payments[index] = { ...this.data.truck_payments[index], ...payment, updated_at: new Date().toISOString() };
    } else {
      this.data.truck_payments.push({ entry_id: entryId, rate_per_qntl: 32, paid_amount: 0, payments_history: [], ...payment, updated_at: new Date().toISOString() });
    }
    this.save();
    return this.getTruckPayment(entryId);
  }

  // ---- Agent Payments ----
  getAgentPayment(mandiName, kmsYear, season) {
    return this.data.agent_payments.find(p =>
      p.mandi_name === mandiName && p.kms_year === kmsYear && p.season === season
    ) || {
      mandi_name: mandiName, kms_year: kmsYear, season: season,
      paid_amount: 0, status: 'pending', payments_history: []
    };
  }

  updateAgentPayment(mandiName, kmsYear, season, payment) {
    const index = this.data.agent_payments.findIndex(p =>
      p.mandi_name === mandiName && p.kms_year === kmsYear && p.season === season
    );
    if (index !== -1) {
      this.data.agent_payments[index] = { ...this.data.agent_payments[index], ...payment, updated_at: new Date().toISOString() };
    } else {
      this.data.agent_payments.push({
        id: uuidv4(), mandi_name: mandiName, kms_year: kmsYear, season: season,
        paid_amount: 0, payments_history: [], ...payment, updated_at: new Date().toISOString()
      });
    }
    this.save();
    return this.getAgentPayment(mandiName, kmsYear, season);
  }

  // ---- Milling Entries ----
  calculateMillingFields(data) {
    const paddy = data.paddy_input_qntl || 0;
    const ricePct = data.rice_percent || 0;
    const branPct = data.bran_percent || 0;
    const kundaPct = data.kunda_percent || 0;
    const brokenPct = data.broken_percent || 0;
    const kankiPct = data.kanki_percent || 0;
    const usedPct = ricePct + branPct + kundaPct + brokenPct + kankiPct;
    const huskPct = Math.max(0, +(100 - usedPct).toFixed(2));
    const frkUsed = data.frk_used_qntl || 0;
    const riceQntl = +(paddy * ricePct / 100).toFixed(2);

    return {
      ...data,
      husk_percent: huskPct,
      rice_qntl: riceQntl,
      bran_qntl: +(paddy * branPct / 100).toFixed(2),
      kunda_qntl: +(paddy * kundaPct / 100).toFixed(2),
      broken_qntl: +(paddy * brokenPct / 100).toFixed(2),
      kanki_qntl: +(paddy * kankiPct / 100).toFixed(2),
      husk_qntl: +(paddy * huskPct / 100).toFixed(2),
      cmr_delivery_qntl: +(riceQntl + frkUsed).toFixed(2),
      outturn_ratio: paddy > 0 ? +((riceQntl + frkUsed) / paddy * 100).toFixed(2) : 0
    };
  }

  getMillingEntries(filters = {}) {
    if (!this.data.milling_entries) this.data.milling_entries = [];
    let entries = [...this.data.milling_entries];
    if (filters.rice_type) entries = entries.filter(e => e.rice_type === filters.rice_type);
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);
    if (filters.date_from) entries = entries.filter(e => e.date >= filters.date_from);
    if (filters.date_to) entries = entries.filter(e => e.date <= filters.date_to);
    return entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  createMillingEntry(data) {
    if (!this.data.milling_entries) this.data.milling_entries = [];
    const calculated = this.calculateMillingFields(data);
    const entry = {
      id: uuidv4(),
      date: calculated.date || new Date().toISOString().split('T')[0],
      rice_type: calculated.rice_type || 'parboiled',
      paddy_input_qntl: calculated.paddy_input_qntl || 0,
      rice_percent: calculated.rice_percent || 0,
      bran_percent: calculated.bran_percent || 0, kunda_percent: calculated.kunda_percent || 0,
      broken_percent: calculated.broken_percent || 0, kanki_percent: calculated.kanki_percent || 0,
      husk_percent: calculated.husk_percent, rice_qntl: calculated.rice_qntl,
      bran_qntl: calculated.bran_qntl,
      kunda_qntl: calculated.kunda_qntl, broken_qntl: calculated.broken_qntl,
      kanki_qntl: calculated.kanki_qntl, husk_qntl: calculated.husk_qntl,
      frk_used_qntl: calculated.frk_used_qntl || 0,
      cmr_delivery_qntl: calculated.cmr_delivery_qntl, outturn_ratio: calculated.outturn_ratio,
      kms_year: calculated.kms_year || '', season: calculated.season || '',
      note: calculated.note || '', created_by: calculated.created_by || '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    this.data.milling_entries.push(entry);
    this.save();
    return entry;
  }

  updateMillingEntry(id, data) {
    if (!this.data.milling_entries) this.data.milling_entries = [];
    const index = this.data.milling_entries.findIndex(e => e.id === id);
    if (index === -1) return null;
    const calculated = this.calculateMillingFields(data);
    this.data.milling_entries[index] = {
      ...this.data.milling_entries[index], ...calculated,
      updated_at: new Date().toISOString()
    };
    this.save();
    return this.data.milling_entries[index];
  }

  deleteMillingEntry(id) {
    if (!this.data.milling_entries) this.data.milling_entries = [];
    const len = this.data.milling_entries.length;
    this.data.milling_entries = this.data.milling_entries.filter(e => e.id !== id);
    if (this.data.milling_entries.length < len) { this.save(); return true; }
    return false;
  }

  getMillingSummary(filters = {}) {
    const entries = this.getMillingEntries(filters);
    const totalPaddy = entries.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0);
    const totalRice = entries.reduce((s, e) => s + (e.rice_qntl || 0), 0);
    const totalFrk = entries.reduce((s, e) => s + (e.frk_used_qntl || 0), 0);
    const totalBran = entries.reduce((s, e) => s + (e.bran_qntl || 0), 0);
    const totalKunda = entries.reduce((s, e) => s + (e.kunda_qntl || 0), 0);
    const totalBroken = entries.reduce((s, e) => s + (e.broken_qntl || 0), 0);
    const totalKanki = entries.reduce((s, e) => s + (e.kanki_qntl || 0), 0);
    const totalHusk = entries.reduce((s, e) => s + (e.husk_qntl || 0), 0);
    const totalCmr = entries.reduce((s, e) => s + (e.cmr_delivery_qntl || 0), 0);
    const avgOutturn = totalPaddy > 0 ? +((totalCmr) / totalPaddy * 100).toFixed(2) : 0;

    const typeSummary = (list) => {
      const tp = list.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0);
      const tr = list.reduce((s, e) => s + (e.rice_qntl || 0), 0);
      const tf = list.reduce((s, e) => s + (e.frk_used_qntl || 0), 0);
      const tc = list.reduce((s, e) => s + (e.cmr_delivery_qntl || 0), 0);
      return { count: list.length, total_paddy_qntl: +tp.toFixed(2), total_rice_qntl: +tr.toFixed(2),
        total_frk_qntl: +tf.toFixed(2), total_cmr_qntl: +tc.toFixed(2),
        avg_outturn: tp > 0 ? +(tc / tp * 100).toFixed(2) : 0 };
    };

    return {
      total_entries: entries.length, total_paddy_qntl: +totalPaddy.toFixed(2),
      total_rice_qntl: +totalRice.toFixed(2), total_frk_qntl: +totalFrk.toFixed(2),
      total_bran_qntl: +totalBran.toFixed(2), total_kunda_qntl: +totalKunda.toFixed(2),
      total_broken_qntl: +totalBroken.toFixed(2), total_kanki_qntl: +totalKanki.toFixed(2),
      total_husk_qntl: +totalHusk.toFixed(2), total_cmr_qntl: +totalCmr.toFixed(2),
      avg_outturn_ratio: avgOutturn,
      parboiled: typeSummary(entries.filter(e => e.rice_type === 'parboiled')),
      raw: typeSummary(entries.filter(e => e.rice_type === 'raw'))
    };
  }
}

// ============ CREATE DATABASE ============
const database = new JsonDatabase(DATA_DIR);

// ============ BACKUP SYSTEM ============
function createBackup(label = 'auto') {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `backup_${label}_${dateStr}.json`;
  const backupPath = path.join(BACKUP_DIR, filename);
  
  try {
    const data = fs.readFileSync(database.dbFile, 'utf8');
    fs.writeFileSync(backupPath, data);
    console.log(`[Backup] Created: ${filename}`);
    cleanupOldBackups();
    return { success: true, filename, size: data.length, created_at: now.toISOString() };
  } catch (e) {
    console.error('[Backup] Error:', e.message);
    return { success: false, error: e.message };
  }
}

function getBackupsList() {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup_') && f.endsWith('.json'));
    return files.map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        filename: f,
        size: stat.size,
        created_at: stat.mtime.toISOString(),
        size_readable: (stat.size / 1024).toFixed(1) + ' KB'
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (e) {
    return [];
  }
}

function restoreBackup(filename) {
  const backupPath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(backupPath)) return { success: false, error: 'Backup file not found' };
  
  try {
    // Create safety backup before restore
    createBackup('pre-restore');
    const data = fs.readFileSync(backupPath, 'utf8');
    JSON.parse(data); // Validate JSON
    fs.writeFileSync(database.dbFile, data);
    database.data = database.load(); // Reload database
    return { success: true, message: 'Data restore ho gaya! Page refresh karein.' };
  } catch (e) {
    return { success: false, error: 'Restore failed: ' + e.message };
  }
}

function cleanupOldBackups() {
  const backups = getBackupsList();
  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    toDelete.forEach(b => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, b.filename)); } catch (e) {}
    });
    if (toDelete.length > 0) console.log(`[Backup] Cleaned up ${toDelete.length} old backups`);
  }
}

function hasTodayBackup() {
  const today = new Date().toISOString().substring(0, 10);
  const backups = getBackupsList();
  return backups.some(b => b.created_at.substring(0, 10) === today);
}

// Auto-backup on startup
if (!hasTodayBackup() && fs.existsSync(database.dbFile)) {
  createBackup('startup');
}

// Daily auto-backup (every 24 hours)
setInterval(() => {
  if (!hasTodayBackup()) createBackup('daily');
}, 60 * 60 * 1000); // Check every hour

// ============ EXPRESS APP ============
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ============ PRINT PAGE (Server-side for Electron/browser compatibility) ============
const printPages = {};
app.post('/api/print', (req, res) => {
  const id = require('uuid').v4();
  printPages[id] = req.body.html;
  setTimeout(() => delete printPages[id], 300000);
  res.json({ id, url: `/api/print/${id}` });
});
app.get('/api/print/:id', (req, res) => {
  const html = printPages[req.params.id];
  if (!html) return res.status(404).send('<h1>Page expired. Please try again.</h1>');
  delete printPages[req.params.id];
  res.type('html').send(html);
});

// ============ AUTH ENDPOINTS ============
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = database.getUser(username);
  if (user && user.password === password) {
    return res.json({ success: true, username: user.username, role: user.role, message: 'Login successful' });
  }
  res.status(401).json({ detail: 'Invalid username or password' });
});

app.get('/api/auth/verify', (req, res) => {
  const { username, role } = req.query;
  const user = database.getUser(username);
  if (user && user.role === role) return res.json({ valid: true, username, role });
  res.json({ valid: false });
});

app.post('/api/auth/change-password', (req, res) => {
  const { username, current_password, new_password } = req.body;
  const user = database.getUser(username);
  if (!user || user.password !== current_password) {
    return res.status(401).json({ detail: 'Current password galat hai' });
  }
  database.updateUserPassword(username, new_password);
  res.json({ success: true, message: 'Password changed successfully' });
});

// ============ BRANDING ============
app.get('/api/branding', (req, res) => res.json(database.getBranding()));

app.put('/api/branding', (req, res) => {
  const branding = database.updateBranding(req.body);
  res.json({ success: true, message: 'Branding update ho gaya', branding });
});

// ============ ENTRIES CRUD ============
app.get('/api/', (req, res) => res.json({ message: 'Mill Entry API - Local Server' }));

app.get('/api/entries', (req, res) => res.json(database.getEntries(req.query)));

app.get('/api/entries/:id', (req, res) => {
  const entry = database.data.entries.find(e => e.id === req.params.id);
  if (entry) return res.json(entry);
  res.status(404).json({ detail: 'Entry not found' });
});

app.post('/api/entries', (req, res) => {
  const entry = database.addEntry({ ...req.body, created_by: req.query.username || 'admin' });
  res.json(entry);
});

app.put('/api/entries/:id', (req, res) => {
  // Permission check
  const existing = database.data.entries.find(e => e.id === req.params.id);
  if (!existing) return res.status(404).json({ detail: 'Entry not found' });
  
  const role = req.query.role || '';
  const username = req.query.username || '';
  if (role !== 'admin') {
    if (existing.created_by !== username) {
      return res.status(403).json({ detail: 'Aap sirf apni entry edit kar sakte hain' });
    }
    const created = new Date(existing.created_at);
    if ((Date.now() - created.getTime()) > 5 * 60 * 1000) {
      return res.status(403).json({ detail: '5 minute se zyada ho gaye, ab edit nahi ho sakta' });
    }
  }
  
  const entry = database.updateEntry(req.params.id, req.body);
  if (entry) return res.json(entry);
  res.status(404).json({ detail: 'Entry not found' });
});

app.delete('/api/entries/:id', (req, res) => {
  const existing = database.data.entries.find(e => e.id === req.params.id);
  if (!existing) return res.status(404).json({ detail: 'Entry not found' });
  
  const role = req.query.role || '';
  const username = req.query.username || '';
  if (role !== 'admin') {
    if (existing.created_by !== username) {
      return res.status(403).json({ detail: 'Aap sirf apni entry delete kar sakte hain' });
    }
    const created = new Date(existing.created_at);
    if ((Date.now() - created.getTime()) > 5 * 60 * 1000) {
      return res.status(403).json({ detail: '5 minute se zyada ho gaye, ab delete nahi ho sakta' });
    }
  }
  
  database.deleteEntry(req.params.id);
  res.json({ message: 'Entry deleted successfully' });
});

app.post('/api/entries/bulk-delete', (req, res) => {
  const ids = req.body.entry_ids || req.body;
  database.bulkDeleteEntries(Array.isArray(ids) ? ids : []);
  res.json({ message: 'Entries deleted', deleted_count: Array.isArray(ids) ? ids.length : 0 });
});

// ============ TOTALS ============
app.get('/api/totals', (req, res) => res.json(database.getTotals(req.query)));

// ============ SUGGESTIONS ============
app.get('/api/suggestions/trucks', (req, res) => {
  let suggestions = database.getSuggestions('truck_no');
  const q = req.query.q || '';
  if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
  res.json({ suggestions });
});

app.get('/api/suggestions/agents', (req, res) => {
  let suggestions = database.getSuggestions('agent_name');
  const q = req.query.q || '';
  if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
  res.json({ suggestions });
});

app.get('/api/suggestions/mandis', (req, res) => {
  let suggestions = database.getSuggestions('mandi_name');
  const q = req.query.q || '';
  const agent_name = req.query.agent_name || '';
  if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
  if (agent_name) {
    const agentMandis = new Set();
    database.data.entries.filter(e => e.agent_name === agent_name).forEach(e => { if (e.mandi_name) agentMandis.add(e.mandi_name); });
    suggestions = suggestions.filter(s => agentMandis.has(s));
  }
  res.json({ suggestions });
});

app.get('/api/suggestions/kms_years', (req, res) => {
  res.json({ suggestions: database.getSuggestions('kms_year') });
});

// ============ MANDI TARGETS ============
app.get('/api/mandi-targets', (req, res) => res.json(database.getMandiTargets(req.query)));

app.post('/api/mandi-targets', (req, res) => {
  const result = database.addMandiTarget({ ...req.body, created_by: req.query.username || 'admin' });
  if (result.error) return res.status(400).json({ detail: result.error });
  res.json(result);
});

app.put('/api/mandi-targets/:id', (req, res) => {
  const target = database.updateMandiTarget(req.params.id, req.body);
  if (target) return res.json(target);
  res.status(404).json({ detail: 'Target not found' });
});

app.delete('/api/mandi-targets/:id', (req, res) => {
  database.deleteMandiTarget(req.params.id);
  res.json({ message: 'Target deleted successfully' });
});

app.get('/api/mandi-targets/summary', (req, res) => {
  const targets = database.getMandiTargets(req.query);
  const entries = database.getEntries(req.query);
  
  const summary = targets.map(target => {
    const mandiEntries = entries.filter(e => e.mandi_name === target.mandi_name);
    const achieved_qntl = Math.round(mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0) * 100) / 100;
    const cutting_qntl = Math.round(target.target_qntl * target.cutting_percent / 100 * 100) / 100;
    const base_rate = target.base_rate ?? 10;
    const cutting_rate = target.cutting_rate ?? 5;
    const target_amount = Math.round(target.target_qntl * base_rate * 100) / 100;
    const cutting_amount = Math.round(cutting_qntl * cutting_rate * 100) / 100;
    
    return {
      ...target,
      achieved_qntl,
      pending_qntl: Math.round(Math.max(0, target.expected_total - achieved_qntl) * 100) / 100,
      progress_percent: Math.round(Math.min(100, (achieved_qntl / (target.expected_total || 1)) * 100) * 10) / 10,
      cutting_qntl,
      base_rate,
      cutting_rate,
      target_amount,
      cutting_amount,
      total_agent_amount: Math.round((target_amount + cutting_amount) * 100) / 100
    };
  });
  
  res.json(summary);
});

// ============ DASHBOARD ============
app.get('/api/dashboard/agent-totals', (req, res) => {
  const entries = database.getEntries(req.query);
  const agentMap = {};
  
  entries.forEach(e => {
    if (!e.agent_name) return;
    if (!agentMap[e.agent_name]) {
      agentMap[e.agent_name] = { agent_name: e.agent_name, total_qntl: 0, total_final_w: 0, total_entries: 0, total_bag: 0 };
    }
    agentMap[e.agent_name].total_qntl += (e.qntl || 0);
    agentMap[e.agent_name].total_final_w += (e.final_w || 0) / 100;
    agentMap[e.agent_name].total_entries += 1;
    agentMap[e.agent_name].total_bag += (e.bag || 0);
  });
  
  const agent_totals = Object.values(agentMap).map(a => ({
    ...a,
    total_qntl: Math.round(a.total_qntl * 100) / 100,
    total_final_w: Math.round(a.total_final_w * 100) / 100
  })).sort((a, b) => b.total_final_w - a.total_final_w);
  
  res.json({ agent_totals });
});

app.get('/api/dashboard/date-range-totals', (req, res) => {
  const entries = database.getEntries(req.query);
  const totals = entries.reduce((acc, e) => ({
    total_kg: acc.total_kg + (e.kg || 0),
    total_qntl: acc.total_qntl + (e.qntl || 0),
    total_bag: acc.total_bag + (e.bag || 0),
    total_final_w: acc.total_final_w + (e.final_w || 0) / 100,
    total_entries: acc.total_entries + 1
  }), { total_kg: 0, total_qntl: 0, total_bag: 0, total_final_w: 0, total_entries: 0 });
  
  res.json({
    total_kg: Math.round(totals.total_kg * 100) / 100,
    total_qntl: Math.round(totals.total_qntl * 100) / 100,
    total_bag: totals.total_bag,
    total_final_w: Math.round(totals.total_final_w * 100) / 100,
    total_entries: totals.total_entries,
    start_date: req.query.start_date || null,
    end_date: req.query.end_date || null
  });
});

app.get('/api/dashboard/monthly-trend', (req, res) => {
  const entries = database.getEntries(req.query);
  const monthMap = {};
  
  entries.forEach(e => {
    const month = (e.date || '').substring(0, 7);
    if (!month) return;
    if (!monthMap[month]) monthMap[month] = { month, total_qntl: 0, total_final_w: 0, total_entries: 0, total_bag: 0 };
    monthMap[month].total_qntl += (e.qntl || 0);
    monthMap[month].total_final_w += (e.final_w || 0) / 100;
    monthMap[month].total_entries += 1;
    monthMap[month].total_bag += (e.bag || 0);
  });
  
  const monthly_data = Object.values(monthMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({ ...m, total_qntl: Math.round(m.total_qntl * 100) / 100, total_final_w: Math.round(m.total_final_w * 100) / 100 }));
  
  res.json({ monthly_data });
});

// ============ TRUCK PAYMENTS ============
app.get('/api/truck-payments', (req, res) => {
  const entries = database.getEntries(req.query);
  const payments = entries.map(entry => {
    const payment = database.getTruckPayment(entry.id);
    const final_qntl = Math.round((entry.final_w || 0) / 100 * 100) / 100;
    const cash_taken = entry.cash_paid || 0;
    const diesel_taken = entry.diesel_paid || 0;
    const gross_amount = Math.round(final_qntl * payment.rate_per_qntl * 100) / 100;
    const deductions = Math.round((cash_taken + diesel_taken) * 100) / 100;
    const net_amount = Math.round((gross_amount - deductions) * 100) / 100;
    const balance_amount = Math.round(Math.max(0, net_amount - payment.paid_amount) * 100) / 100;
    
    let status = 'pending';
    if (balance_amount < 0.10) status = 'paid';
    else if (payment.paid_amount > 0) status = 'partial';
    
    return {
      entry_id: entry.id, truck_no: entry.truck_no || '', date: entry.date || '',
      agent_name: entry.agent_name || '', mandi_name: entry.mandi_name || '',
      total_qntl: Math.round((entry.qntl || 0) * 100) / 100, total_bag: entry.bag || 0,
      final_qntl, cash_taken, diesel_taken, rate_per_qntl: payment.rate_per_qntl,
      gross_amount, deductions, net_amount, paid_amount: payment.paid_amount,
      balance_amount, status, kms_year: entry.kms_year || '', season: entry.season || ''
    };
  });
  res.json(payments);
});

app.put('/api/truck-payments/:entryId/rate', (req, res) => {
  const entry = database.data.entries.find(e => e.id === req.params.entryId);
  let updatedCount = 1;
  
  if (entry && entry.truck_no && entry.mandi_name) {
    // Auto-update all entries with same truck_no + same mandi_name
    const matching = database.data.entries.filter(e => 
      e.truck_no === entry.truck_no && e.mandi_name === entry.mandi_name
    );
    matching.forEach(m => {
      database.updateTruckPayment(m.id, { rate_per_qntl: req.body.rate_per_qntl });
    });
    updatedCount = matching.length;
  } else {
    database.updateTruckPayment(req.params.entryId, { rate_per_qntl: req.body.rate_per_qntl });
  }
  
  res.json({ success: true, message: `Rate ₹${req.body.rate_per_qntl}/QNTL set for ${updatedCount} entries`, updated_count: updatedCount, truck_no: entry?.truck_no, mandi_name: entry?.mandi_name });
});

app.post('/api/truck-payments/:entryId/pay', (req, res) => {
  const current = database.getTruckPayment(req.params.entryId);
  const newPaid = current.paid_amount + req.body.amount;
  const history = current.payments_history || [];
  history.push({ amount: req.body.amount, date: new Date().toISOString(), note: req.body.note || '', by: req.query.username || 'admin' });
  database.updateTruckPayment(req.params.entryId, { paid_amount: newPaid, payments_history: history });
  res.json({ success: true, message: `Rs.${req.body.amount} payment recorded`, total_paid: newPaid });
});

app.post('/api/truck-payments/:entryId/mark-paid', (req, res) => {
  const entry = database.data.entries.find(e => e.id === req.params.entryId);
  if (!entry) return res.status(404).json({ detail: 'Entry not found' });
  
  const current = database.getTruckPayment(req.params.entryId);
  const final_qntl = (entry.final_w || 0) / 100;
  const net = (final_qntl * current.rate_per_qntl) - (entry.cash_paid || 0) - (entry.diesel_paid || 0);
  const history = current.payments_history || [];
  history.push({ amount: net, date: new Date().toISOString(), note: 'Full payment - marked as paid', by: req.query.username || 'admin' });
  database.updateTruckPayment(req.params.entryId, { paid_amount: net, status: 'paid', payments_history: history });
  res.json({ success: true, message: 'Truck payment cleared' });
});

app.post('/api/truck-payments/:entryId/undo-paid', (req, res) => {
  const current = database.getTruckPayment(req.params.entryId);
  const history = current.payments_history || [];
  history.push({ amount: -(current.paid_amount || 0), date: new Date().toISOString(), note: 'UNDO - Payment reversed', by: req.query.username || 'admin' });
  database.updateTruckPayment(req.params.entryId, { paid_amount: 0, status: 'pending', payments_history: history });
  res.json({ success: true, message: 'Payment undo ho gaya - status reset to pending' });
});

app.get('/api/truck-payments/:entryId/history', (req, res) => {
  const payment = database.getTruckPayment(req.params.entryId);
  res.json({ history: payment.payments_history || [], total_paid: payment.paid_amount || 0 });
});

// ============ AGENT PAYMENTS ============
app.get('/api/agent-payments', (req, res) => {
  const targets = database.getMandiTargets(req.query);
  const entries = database.getEntries(req.query);
  
  const payments = targets.map(target => {
    const payment = database.getAgentPayment(target.mandi_name, target.kms_year, target.season);
    const mandiEntries = entries.filter(e => e.mandi_name === target.mandi_name);
    const achieved_qntl = Math.round(mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0) * 100) / 100;
    const cutting_qntl = Math.round(target.target_qntl * target.cutting_percent / 100 * 100) / 100;
    const base_rate = target.base_rate ?? 10;
    const cutting_rate = target.cutting_rate ?? 5;
    const target_amount = Math.round(target.target_qntl * base_rate * 100) / 100;
    const cutting_amount = Math.round(cutting_qntl * cutting_rate * 100) / 100;
    const total_amount = Math.round((target_amount + cutting_amount) * 100) / 100;
    const balance_amount = Math.round(Math.max(0, total_amount - payment.paid_amount) * 100) / 100;
    
    // Get agent name from entries
    const agentEntry = mandiEntries.find(e => e.agent_name);
    const agent_name = agentEntry ? agentEntry.agent_name : target.mandi_name;
    
    let status = 'pending';
    if (balance_amount < 0.01) status = 'paid';
    else if (payment.paid_amount > 0) status = 'partial';
    
    return {
      mandi_name: target.mandi_name, agent_name,
      target_qntl: target.target_qntl, cutting_percent: target.cutting_percent, cutting_qntl,
      base_rate, cutting_rate, target_amount, cutting_amount, total_amount,
      achieved_qntl, is_target_complete: achieved_qntl >= target.expected_total,
      paid_amount: payment.paid_amount, balance_amount, status,
      kms_year: target.kms_year, season: target.season
    };
  });
  res.json(payments);
});

app.post('/api/agent-payments/:mandiName/pay', (req, res) => {
  const { kms_year, season } = req.query;
  const mandiName = decodeURIComponent(req.params.mandiName);
  const current = database.getAgentPayment(mandiName, kms_year, season);
  const newPaid = current.paid_amount + req.body.amount;
  const history = current.payments_history || [];
  history.push({ amount: req.body.amount, date: new Date().toISOString(), note: req.body.note || '', by: req.query.username || 'admin' });
  database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: newPaid, payments_history: history });
  res.json({ success: true, message: `Rs.${req.body.amount} payment recorded`, total_paid: newPaid });
});

app.post('/api/agent-payments/:mandiName/mark-paid', (req, res) => {
  const { kms_year, season } = req.query;
  const mandiName = decodeURIComponent(req.params.mandiName);
  const target = database.getMandiTargets({ kms_year, season }).find(t => t.mandi_name === mandiName);
  if (!target) return res.status(404).json({ detail: 'Mandi target not found' });
  
  const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
  const total_amount = (target.target_qntl * (target.base_rate ?? 10)) + (cutting_qntl * (target.cutting_rate ?? 5));
  const current = database.getAgentPayment(mandiName, kms_year, season);
  const history = current.payments_history || [];
  history.push({ amount: total_amount, date: new Date().toISOString(), note: 'Full payment - marked as paid', by: req.query.username || 'admin' });
  database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: total_amount, status: 'paid', payments_history: history });
  res.json({ success: true, message: 'Agent/Mandi payment cleared' });
});

app.post('/api/agent-payments/:mandiName/undo-paid', (req, res) => {
  const { kms_year, season } = req.query;
  const mandiName = decodeURIComponent(req.params.mandiName);
  const current = database.getAgentPayment(mandiName, kms_year, season);
  const history = current.payments_history || [];
  history.push({ amount: -(current.paid_amount || 0), date: new Date().toISOString(), note: 'UNDO - Payment reversed', by: req.query.username || 'admin' });
  database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: 0, status: 'pending', payments_history: history });
  res.json({ success: true, message: 'Payment undo ho gaya - status reset to pending' });
});

app.get('/api/agent-payments/:mandiName/history', (req, res) => {
  const { kms_year, season } = req.query;
  const mandiName = decodeURIComponent(req.params.mandiName);
  const payment = database.getAgentPayment(mandiName, kms_year, season);
  res.json({ history: payment.payments_history || [], total_paid: payment.paid_amount || 0 });
});

// ============ MILLING ENTRIES ============
app.get('/api/milling-entries', (req, res) => {
  const entries = database.getMillingEntries(req.query);
  res.json(entries);
});

app.get('/api/milling-summary', (req, res) => {
  res.json(database.getMillingSummary(req.query));
});

app.post('/api/milling-entries', (req, res) => {
  const entry = database.createMillingEntry({ ...req.body, created_by: req.query.username || '' });
  res.json(entry);
});

app.get('/api/milling-entries/:id', (req, res) => {
  const entries = database.getMillingEntries({});
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ detail: 'Milling entry not found' });
  res.json(entry);
});

app.put('/api/milling-entries/:id', (req, res) => {
  const updated = database.updateMillingEntry(req.params.id, req.body);
  if (!updated) return res.status(404).json({ detail: 'Milling entry not found' });
  res.json(updated);
});

app.delete('/api/milling-entries/:id', (req, res) => {
  const deleted = database.deleteMillingEntry(req.params.id);
  if (!deleted) return res.status(404).json({ detail: 'Milling entry not found' });
  res.json({ message: 'Milling entry deleted', id: req.params.id });
});

app.get('/api/paddy-stock', (req, res) => {
  const filters = req.query;
  let entries = [...database.data.entries];
  if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
  if (filters.season) entries = entries.filter(e => e.season === filters.season);
  const totalIn = +(entries.reduce((s, e) => s + (e.mill_w || 0), 0) / 100).toFixed(2);
  const millingEntries = database.getMillingEntries(filters);
  const totalUsed = +millingEntries.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0).toFixed(2);
  res.json({ total_paddy_in_qntl: totalIn, total_paddy_used_qntl: totalUsed, available_paddy_qntl: +(totalIn - totalUsed).toFixed(2) });
});

app.get('/api/byproduct-stock', (req, res) => {
  if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
  const millingEntries = database.getMillingEntries(req.query);
  let sales = [...database.data.byproduct_sales];
  if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
  if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
  const products = ['bran', 'kunda', 'broken', 'kanki', 'husk'];
  const stock = {};
  products.forEach(p => {
    const produced = +millingEntries.reduce((s, e) => s + (e[`${p}_qntl`] || 0), 0).toFixed(2);
    const pSales = sales.filter(s => s.product === p);
    const sold = +pSales.reduce((s, e) => s + (e.quantity_qntl || 0), 0).toFixed(2);
    const revenue = +pSales.reduce((s, e) => s + (e.total_amount || 0), 0).toFixed(2);
    stock[p] = { produced_qntl: produced, sold_qntl: sold, available_qntl: +(produced - sold).toFixed(2), total_revenue: revenue };
  });
  res.json(stock);
});

app.post('/api/byproduct-sales', (req, res) => {
  if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
  const sale = {
    id: uuidv4(), ...req.body,
    total_amount: +((req.body.quantity_qntl || 0) * (req.body.rate_per_qntl || 0)).toFixed(2),
    created_by: req.query.username || '',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  database.data.byproduct_sales.push(sale);
  database.save();
  res.json(sale);
});

app.get('/api/byproduct-sales', (req, res) => {
  if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
  let sales = [...database.data.byproduct_sales];
  if (req.query.product) sales = sales.filter(s => s.product === req.query.product);
  if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
  if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
  res.json(sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

app.delete('/api/byproduct-sales/:id', (req, res) => {
  if (!database.data.byproduct_sales) return res.status(404).json({ detail: 'Sale not found' });
  const len = database.data.byproduct_sales.length;
  database.data.byproduct_sales = database.data.byproduct_sales.filter(s => s.id !== req.params.id);
  if (database.data.byproduct_sales.length < len) { database.save(); return res.json({ message: 'Sale deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Sale not found' });
});

// ============ FRK PURCHASES ============
app.post('/api/frk-purchases', (req, res) => {
  if (!database.data.frk_purchases) database.data.frk_purchases = [];
  const d = req.body;
  const sale = { id: uuidv4(), date: d.date, party_name: d.party_name || '', quantity_qntl: d.quantity_qntl || 0, rate_per_qntl: d.rate_per_qntl || 0, total_amount: +((d.quantity_qntl || 0) * (d.rate_per_qntl || 0)).toFixed(2), note: d.note || '', kms_year: d.kms_year || '', season: d.season || '', created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  database.data.frk_purchases.push(sale); database.save(); res.json(sale);
});
app.get('/api/frk-purchases', (req, res) => {
  if (!database.data.frk_purchases) database.data.frk_purchases = [];
  let p = [...database.data.frk_purchases];
  if (req.query.kms_year) p = p.filter(x => x.kms_year === req.query.kms_year);
  if (req.query.season) p = p.filter(x => x.season === req.query.season);
  res.json(p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});
app.delete('/api/frk-purchases/:id', (req, res) => {
  if (!database.data.frk_purchases) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.frk_purchases.length;
  database.data.frk_purchases = database.data.frk_purchases.filter(x => x.id !== req.params.id);
  if (database.data.frk_purchases.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});
app.get('/api/frk-stock', (req, res) => {
  if (!database.data.frk_purchases) database.data.frk_purchases = [];
  let purchases = [...database.data.frk_purchases];
  if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
  if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
  const totalPurchased = +purchases.reduce((s, p) => s + (p.quantity_qntl || 0), 0).toFixed(2);
  const totalCost = +purchases.reduce((s, p) => s + (p.total_amount || 0), 0).toFixed(2);
  const millingEntries = database.getMillingEntries(req.query);
  const totalUsed = +millingEntries.reduce((s, e) => s + (e.frk_used_qntl || 0), 0).toFixed(2);
  res.json({ total_purchased_qntl: totalPurchased, total_used_qntl: totalUsed, available_qntl: +(totalPurchased - totalUsed).toFixed(2), total_cost: totalCost });
});

// ============ PADDY CUSTODY REGISTER ============
app.get('/api/paddy-custody-register', (req, res) => {
  const filters = req.query;
  let entries = [...database.data.entries];
  if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
  if (filters.season) entries = entries.filter(e => e.season === filters.season);
  const millingEntries = database.getMillingEntries(filters);
  const rows = [];
  entries.forEach(e => rows.push({ date: e.date || '', type: 'received', description: `Truck: ${e.truck_no || ''} | Agent: ${e.agent_name || ''} | Mandi: ${e.mandi_name || ''}`, received_qntl: +((e.mill_w || 0) / 100).toFixed(2), issued_qntl: 0, source_id: e.id || '' }));
  millingEntries.forEach(e => rows.push({ date: e.date || '', type: 'issued', description: `Milling (${(e.rice_type || 'parboiled').charAt(0).toUpperCase() + (e.rice_type || '').slice(1)}) | Rice: ${e.rice_qntl || 0}Q`, received_qntl: 0, issued_qntl: e.paddy_input_qntl || 0, source_id: e.id || '' }));
  rows.sort((a, b) => a.date.localeCompare(b.date));
  let balance = 0;
  rows.forEach(r => { balance += r.received_qntl - r.issued_qntl; r.balance_qntl = +balance.toFixed(2); });
  res.json({ rows, total_received: +rows.reduce((s, r) => s + r.received_qntl, 0).toFixed(2), total_issued: +rows.reduce((s, r) => s + r.issued_qntl, 0).toFixed(2), final_balance: +balance.toFixed(2) });
});

// ============ BACKUP ENDPOINTS ============
app.get('/api/backups', (req, res) => {
  const backups = getBackupsList();
  const today = new Date().toISOString().substring(0, 10);
  const hasTodayBkp = backups.some(b => b.created_at.substring(0, 10) === today);
  res.json({ backups, has_today_backup: hasTodayBkp, max_backups: MAX_BACKUPS, backup_dir: path.resolve(BACKUP_DIR) });
});

app.post('/api/backups', (req, res) => {
  const result = createBackup('manual');
  if (result.success) return res.json({ success: true, message: 'Backup ban gaya!', backup: result });
  res.status(500).json({ detail: result.error });
});

app.post('/api/backups/restore', (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ detail: 'Filename required' });
  const result = restoreBackup(filename);
  if (result.success) return res.json(result);
  res.status(400).json({ detail: result.error });
});

app.delete('/api/backups/:filename', (req, res) => {
  const filepath = path.join(BACKUP_DIR, req.params.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ detail: 'File not found' });
  try {
    fs.unlinkSync(filepath);
    res.json({ success: true, message: 'Backup delete ho gaya' });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

app.get('/api/backups/status', (req, res) => {
  const backups = getBackupsList();
  const today = new Date().toISOString().substring(0, 10);
  res.json({
    has_today_backup: backups.some(b => b.created_at.substring(0, 10) === today),
    last_backup: backups.length > 0 ? backups[0] : null,
    total_backups: backups.length
  });
});

// ============ EXPORT ENDPOINTS (Excel & PDF) ============
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Helper: Style Excel header row
function styleExcelHeader(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0D3B66' } },
      bottom: { style: 'thin', color: { argb: 'FF0D3B66' } },
      left: { style: 'thin', color: { argb: 'FF0D3B66' } },
      right: { style: 'thin', color: { argb: 'FF0D3B66' } }
    };
  });
  sheet.columns.forEach(col => { col.width = Math.max(col.width || 14, 14); });
  // A4 page setup for printing
  sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
}

function styleExcelData(sheet, startRow) {
  const lastRow = sheet.rowCount;
  const colCount = sheet.columnCount;
  for (let r = startRow; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const isEven = (r - startRow) % 2 === 0;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= colCount) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF0F7FF' : 'FFFFFFFF' } };
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          bottom: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          left: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          right: { style: 'hair', color: { argb: 'FFD0D5DD' } }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { size: 10 };
      }
    });
    row.eachCell((cell) => {
      if (cell.value === 'Paid') {
        cell.font = { bold: true, size: 10, color: { argb: 'FF16A34A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      } else if (cell.value === 'Pending') {
        cell.font = { bold: true, size: 10, color: { argb: 'FFDC2626' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      } else if (cell.value === 'Partial') {
        cell.font = { bold: true, size: 10, color: { argb: 'FFD97706' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      }
    });
  }
}

// Helper: Add branding title row to Excel
function addExcelTitle(sheet, title, colCount) {
  const branding = database.getBranding();
  sheet.insertRow(1, []); sheet.insertRow(1, []); sheet.insertRow(1, []);
  sheet.mergeCells(1, 1, 1, colCount); sheet.mergeCells(2, 1, 2, colCount); sheet.mergeCells(3, 1, 3, colCount);
  const tc = sheet.getCell('A1'); tc.value = branding.company_name;
  tc.font = { bold: true, size: 18, color: { argb: 'FF1B4F72' } }; tc.alignment = { horizontal: 'center', vertical: 'middle' };
  tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  sheet.getRow(1).height = 32;
  const sc = sheet.getCell('A2'); sc.value = branding.tagline;
  sc.font = { size: 10, italic: true, color: { argb: 'FF666666' } }; sc.alignment = { horizontal: 'center' };
  const dc = sheet.getCell('A3'); dc.value = `${title} | ${new Date().toLocaleDateString('en-IN')}`;
  dc.font = { bold: true, size: 12, color: { argb: 'FFD97706' } }; dc.alignment = { horizontal: 'center' };
  dc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
  sheet.getRow(3).height = 24;
}

// Helper: PDF header
function addPdfHeader(doc, title) {
  const branding = database.getBranding();
  doc.fontSize(18).font('Helvetica-Bold').text(branding.company_name, { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(branding.tagline, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(8).text(`Date: ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke('#1E3A5F');
  doc.moveDown(0.5);
}

// Helper: PDF table
function addPdfTable(doc, headers, rows, colWidths) {
  const startX = 40;
  const pageWidth = doc.page.width - 80;
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  const scale = pageWidth / totalW;
  const widths = colWidths.map(w => w * scale);
  
  // Header
  let x = startX;
  doc.fontSize(7).font('Helvetica-Bold');
  const headerY = doc.y;
  doc.rect(startX, headerY - 2, pageWidth, 16).fill('#1E3A5F');
  headers.forEach((h, i) => {
    doc.fillColor('#FFFFFF').text(h, x + 2, headerY, { width: widths[i] - 4, align: 'center' });
    x += widths[i];
  });
  doc.y = headerY + 16;
  
  // Rows
  doc.font('Helvetica').fontSize(7).fillColor('#333333');
  rows.forEach((row, ri) => {
    if (doc.y > doc.page.height - 60) {
      doc.addPage();
      doc.y = 40;
    }
    x = startX;
    const rowY = doc.y;
    if (ri % 2 === 0) doc.rect(startX, rowY - 1, pageWidth, 13).fill('#F0F4F8').fillColor('#333333');
    else doc.fillColor('#333333');
    row.forEach((cell, i) => {
      doc.text(String(cell ?? ''), x + 2, rowY, { width: widths[i] - 4, align: i === 0 ? 'left' : 'right' });
      x += widths[i];
    });
    doc.y = rowY + 13;
  });
}

// ---- ENTRIES EXCEL ----
app.get('/api/export/excel', async (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mill Entries');
    
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Truck No', key: 'truck_no', width: 14 },
      { header: 'RST No', key: 'rst_no', width: 10 },
      { header: 'TP No', key: 'tp_no', width: 10 },
      { header: 'Agent', key: 'agent_name', width: 14 },
      { header: 'Mandi', key: 'mandi_name', width: 14 },
      { header: 'QNTL', key: 'qntl', width: 10 },
      { header: 'BAG', key: 'bag', width: 8 },
      { header: 'G.Dep', key: 'g_deposite', width: 8 },
      { header: 'GBW Cut', key: 'gbw_cut', width: 10 },
      { header: 'Mill W (QNTL)', key: 'mill_w', width: 13 },
      { header: 'Moist%', key: 'moisture', width: 9 },
      { header: 'M.Cut', key: 'moisture_cut', width: 9 },
      { header: 'Cut%', key: 'cutting_percent', width: 8 },
      { header: 'D/D/P', key: 'disc_dust_poll', width: 8 },
      { header: 'Final W (QNTL)', key: 'final_w', width: 14 },
      { header: 'G.Issued', key: 'g_issued', width: 10 },
      { header: 'Cash', key: 'cash_paid', width: 10 },
      { header: 'Diesel', key: 'diesel_paid', width: 10 }
    ];
    
    entries.forEach(e => {
      ws.addRow({
        date: e.date, truck_no: e.truck_no, rst_no: e.rst_no || '', tp_no: e.tp_no || '',
        agent_name: e.agent_name, mandi_name: e.mandi_name,
        qntl: +(e.qntl || 0).toFixed(2), bag: e.bag || 0, g_deposite: e.g_deposite || 0,
        gbw_cut: +(e.gbw_cut || 0).toFixed(2), mill_w: +((e.mill_w || 0) / 100).toFixed(2),
        moisture: e.moisture || 0, moisture_cut: +((e.moisture_cut || 0) / 100).toFixed(2),
        cutting_percent: e.cutting_percent || 0, disc_dust_poll: e.disc_dust_poll || 0,
        final_w: +((e.final_w || 0) / 100).toFixed(2), g_issued: e.g_issued || 0,
        cash_paid: e.cash_paid || 0, diesel_paid: e.diesel_paid || 0
      });
    });
    
    addExcelTitle(ws, 'Mill Entries Report', 19);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ detail: 'Export failed: ' + err.message });
  }
});

// ---- ENTRIES PDF ----
app.get('/api/export/pdf', (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.pdf`);
    doc.pipe(res);
    
    addPdfHeader(doc, 'Mill Entries Report');
    const headers = ['Date', 'Truck', 'Agent', 'Mandi', 'QNTL', 'BAG', 'Mill W', 'Cut%', 'Final W', 'Cash', 'Diesel'];
    const rows = entries.map(e => [
      e.date || '', e.truck_no || '', e.agent_name || '', e.mandi_name || '',
      (e.qntl || 0).toFixed(2), e.bag || 0, ((e.mill_w || 0) / 100).toFixed(2),
      e.cutting_percent || 0, ((e.final_w || 0) / 100).toFixed(2),
      e.cash_paid || 0, e.diesel_paid || 0
    ]);
    const colWidths = [55, 60, 60, 60, 40, 35, 45, 35, 50, 45, 45];
    addPdfTable(doc, headers, rows, colWidths);
    doc.end();
  } catch (err) {
    res.status(500).json({ detail: 'PDF failed: ' + err.message });
  }
});

// ---- TRUCK PAYMENTS EXCEL ----
app.get('/api/export/truck-payments-excel', async (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Truck Payments');
    
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Truck No', key: 'truck_no', width: 14 },
      { header: 'Mandi', key: 'mandi', width: 14 },
      { header: 'Final QNTL', key: 'final_qntl', width: 12 },
      { header: 'Rate', key: 'rate', width: 8 },
      { header: 'Gross', key: 'gross', width: 12 },
      { header: 'Cash', key: 'cash', width: 10 },
      { header: 'Diesel', key: 'diesel', width: 10 },
      { header: 'Deductions', key: 'ded', width: 12 },
      { header: 'Net Amount', key: 'net', width: 12 },
      { header: 'Paid', key: 'paid', width: 10 },
      { header: 'Balance', key: 'balance', width: 12 },
      { header: 'Status', key: 'status', width: 10 }
    ];
    
    entries.forEach(entry => {
      const p = database.getTruckPayment(entry.id);
      const fq = (entry.final_w || 0) / 100;
      const gross = fq * p.rate_per_qntl;
      const ded = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
      const net = gross - ded;
      const bal = Math.max(0, net - p.paid_amount);
      ws.addRow({
        date: entry.date, truck_no: entry.truck_no, mandi: entry.mandi_name,
        final_qntl: +fq.toFixed(2), rate: p.rate_per_qntl, gross: +gross.toFixed(2),
        cash: entry.cash_paid || 0, diesel: entry.diesel_paid || 0, ded: +ded.toFixed(2),
        net: +net.toFixed(2), paid: p.paid_amount, balance: +bal.toFixed(2),
        status: bal < 0.10 ? 'Paid' : (p.paid_amount > 0 ? 'Partial' : 'Pending')
      });
    });
    
    addExcelTitle(ws, 'Truck Payments Report', 13);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ detail: 'Export failed: ' + err.message });
  }
});

// ---- TRUCK PAYMENTS PDF ----
app.get('/api/export/truck-payments-pdf', (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.pdf`);
    doc.pipe(res);
    
    addPdfHeader(doc, 'Truck Payments Report');
    const headers = ['Date', 'Truck', 'Mandi', 'Final QNTL', 'Rate', 'Gross', 'Deductions', 'Net', 'Paid', 'Balance', 'Status'];
    const rows = entries.map(e => {
      const p = database.getTruckPayment(e.id);
      const fq = (e.final_w || 0) / 100;
      const gross = fq * p.rate_per_qntl;
      const ded = (e.cash_paid || 0) + (e.diesel_paid || 0);
      const net = gross - ded;
      const bal = Math.max(0, net - p.paid_amount);
      return [e.date, e.truck_no, e.mandi_name, fq.toFixed(2), p.rate_per_qntl, gross.toFixed(2), ded.toFixed(2), net.toFixed(2), p.paid_amount, bal.toFixed(2), bal < 0.10 ? 'Paid' : (p.paid_amount > 0 ? 'Partial' : 'Pending')];
    });
    addPdfTable(doc, headers, rows, [50, 55, 55, 45, 35, 50, 50, 50, 45, 50, 40]);
    doc.end();
  } catch (err) {
    res.status(500).json({ detail: 'PDF failed: ' + err.message });
  }
});

// ---- AGENT PAYMENTS EXCEL ----
app.get('/api/export/agent-payments-excel', async (req, res) => {
  try {
    const targets = database.getMandiTargets(req.query);
    const entries = database.getEntries(req.query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Agent Payments');
    
    ws.columns = [
      { header: 'Mandi', key: 'mandi', width: 14 },
      { header: 'Agent', key: 'agent', width: 14 },
      { header: 'Target QNTL', key: 'target', width: 12 },
      { header: 'Cutting QNTL', key: 'cutting', width: 12 },
      { header: 'Base Rate', key: 'base_rate', width: 10 },
      { header: 'Cut Rate', key: 'cut_rate', width: 10 },
      { header: 'Total Amount', key: 'total', width: 12 },
      { header: 'Achieved', key: 'achieved', width: 10 },
      { header: 'Paid', key: 'paid', width: 10 },
      { header: 'Balance', key: 'balance', width: 12 },
      { header: 'Status', key: 'status', width: 10 }
    ];
    
    targets.forEach(target => {
      const me = entries.filter(e => e.mandi_name === target.mandi_name);
      const achieved = me.reduce((s, e) => s + (e.final_w || 0) / 100, 0);
      const cq = target.target_qntl * target.cutting_percent / 100;
      const total = (target.target_qntl * (target.base_rate ?? 10)) + (cq * (target.cutting_rate ?? 5));
      const p = database.getAgentPayment(target.mandi_name, target.kms_year, target.season);
      const bal = Math.max(0, total - p.paid_amount);
      const ae = me.find(e => e.agent_name);
      ws.addRow({
        mandi: target.mandi_name, agent: ae ? ae.agent_name : '',
        target: target.target_qntl, cutting: +cq.toFixed(2),
        base_rate: target.base_rate ?? 10, cut_rate: target.cutting_rate ?? 5,
        total: +total.toFixed(2), achieved: +achieved.toFixed(2),
        paid: p.paid_amount, balance: +bal.toFixed(2),
        status: bal < 0.01 ? 'Paid' : (p.paid_amount > 0 ? 'Partial' : 'Pending')
      });
    });
    
    addExcelTitle(ws, 'Agent Payments Report', 11);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=agent_payments_${Date.now()}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ detail: 'Export failed: ' + err.message });
  }
});

// ---- AGENT PAYMENTS PDF ----
app.get('/api/export/agent-payments-pdf', (req, res) => {
  try {
    const targets = database.getMandiTargets(req.query);
    const entries = database.getEntries(req.query);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=agent_payments_${Date.now()}.pdf`);
    doc.pipe(res);
    
    addPdfHeader(doc, 'Agent Payments Report');
    const headers = ['Mandi', 'Agent', 'Target', 'Cutting', 'B.Rate', 'C.Rate', 'Total', 'Achieved', 'Paid', 'Balance', 'Status'];
    const rows = targets.map(t => {
      const me = entries.filter(e => e.mandi_name === t.mandi_name);
      const ach = me.reduce((s, e) => s + (e.final_w || 0) / 100, 0);
      const cq = t.target_qntl * t.cutting_percent / 100;
      const tot = (t.target_qntl * (t.base_rate ?? 10)) + (cq * (t.cutting_rate ?? 5));
      const p = database.getAgentPayment(t.mandi_name, t.kms_year, t.season);
      const bal = Math.max(0, tot - p.paid_amount);
      const ae = me.find(e => e.agent_name);
      return [t.mandi_name, ae ? ae.agent_name : '', t.target_qntl, cq.toFixed(2), t.base_rate ?? 10, t.cutting_rate ?? 5, tot.toFixed(2), ach.toFixed(2), p.paid_amount, bal.toFixed(2), bal < 0.01 ? 'Paid' : (p.paid_amount > 0 ? 'Partial' : 'Pending')];
    });
    addPdfTable(doc, headers, rows, [55, 55, 40, 40, 35, 35, 50, 45, 45, 50, 40]);
    doc.end();
  } catch (err) {
    res.status(500).json({ detail: 'PDF failed: ' + err.message });
  }
});

// ---- SUMMARY REPORT PDF ----
app.get('/api/export/summary-report-pdf', (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const totals = database.getTotals(req.query);
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=summary_report_${Date.now()}.pdf`);
    doc.pipe(res);
    
    addPdfHeader(doc, 'Summary Report');
    
    doc.fontSize(10).font('Helvetica-Bold').text('Overview:', { underline: true });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    doc.text(`Total Entries: ${entries.length}`);
    doc.text(`Total QNTL: ${(totals.total_qntl || 0).toFixed(2)}`);
    doc.text(`Total BAG: ${totals.total_bag || 0}`);
    doc.text(`Total Mill W (QNTL): ${((totals.total_mill_w || 0) / 100).toFixed(2)}`);
    doc.text(`Total Final W (QNTL): ${((totals.total_final_w || 0) / 100).toFixed(2)}`);
    doc.text(`Total Cash Paid: Rs.${totals.total_cash_paid || 0}`);
    doc.text(`Total Diesel Paid: Rs.${totals.total_diesel_paid || 0}`);
    doc.text(`Total G.Issued: ${totals.total_g_issued || 0}`);
    doc.moveDown(1);
    
    // Agent-wise summary
    doc.fontSize(10).font('Helvetica-Bold').text('Agent-wise Summary:', { underline: true });
    doc.moveDown(0.3);
    const agentMap = {};
    entries.forEach(e => {
      if (!e.agent_name) return;
      if (!agentMap[e.agent_name]) agentMap[e.agent_name] = { entries: 0, qntl: 0, final_w: 0 };
      agentMap[e.agent_name].entries++;
      agentMap[e.agent_name].qntl += e.qntl || 0;
      agentMap[e.agent_name].final_w += (e.final_w || 0) / 100;
    });
    const agentHeaders = ['Agent', 'Entries', 'QNTL', 'Final W (QNTL)'];
    const agentRows = Object.entries(agentMap).map(([name, data]) => [name, data.entries, data.qntl.toFixed(2), data.final_w.toFixed(2)]);
    addPdfTable(doc, agentHeaders, agentRows, [120, 50, 60, 80]);
    
    doc.end();
  } catch (err) {
    res.status(500).json({ detail: 'PDF failed: ' + err.message });
  }
});

// ---- TRUCK OWNER EXCEL ----
app.get('/api/export/truck-owner-excel', async (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const truckData = {};
    entries.forEach(entry => {
      const tn = entry.truck_no || 'Unknown';
      const p = database.getTruckPayment(entry.id);
      const fq = (entry.final_w || 0) / 100;
      const gross = fq * p.rate_per_qntl;
      const ded = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
      const net = gross - ded;
      const bal = Math.max(0, net - p.paid_amount);
      if (!truckData[tn]) truckData[tn] = { truck_no: tn, trips: 0, total_qntl: 0, total_gross: 0, total_deductions: 0, total_net: 0, total_paid: 0, total_balance: 0 };
      truckData[tn].trips++; truckData[tn].total_qntl += fq; truckData[tn].total_gross += gross;
      truckData[tn].total_deductions += ded; truckData[tn].total_net += net; truckData[tn].total_paid += p.paid_amount; truckData[tn].total_balance += bal;
    });
    
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Truck Owner');
    ws.columns = [
      { header: 'Truck No', key: 'truck_no', width: 14 },
      { header: 'Trips', key: 'trips', width: 8 },
      { header: 'Total QNTL', key: 'qntl', width: 12 },
      { header: 'Gross', key: 'gross', width: 12 },
      { header: 'Deductions', key: 'ded', width: 12 },
      { header: 'Net Payable', key: 'net', width: 12 },
      { header: 'Paid', key: 'paid', width: 12 },
      { header: 'Balance', key: 'balance', width: 12 },
      { header: 'Status', key: 'status', width: 10 }
    ];
    
    Object.values(truckData).forEach(t => {
      ws.addRow({
        truck_no: t.truck_no, trips: t.trips, qntl: +t.total_qntl.toFixed(2),
        gross: +t.total_gross.toFixed(2), ded: +t.total_deductions.toFixed(2),
        net: +t.total_net.toFixed(2), paid: +t.total_paid.toFixed(2),
        balance: +t.total_balance.toFixed(2),
        status: t.total_balance < 0.10 ? 'Paid' : (t.total_paid > 0 ? 'Partial' : 'Pending')
      });
    });
    
    addExcelTitle(ws, 'Truck Owner Report', 9);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=truck_owner_${Date.now()}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ detail: 'Export failed: ' + err.message });
  }
});

// ---- TRUCK OWNER PDF ----
app.get('/api/export/truck-owner-pdf', (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const truckData = {};
    entries.forEach(entry => {
      const tn = entry.truck_no || 'Unknown';
      const p = database.getTruckPayment(entry.id);
      const fq = (entry.final_w || 0) / 100;
      const gross = fq * p.rate_per_qntl;
      const ded = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
      const net = gross - ded;
      const bal = Math.max(0, net - p.paid_amount);
      if (!truckData[tn]) truckData[tn] = { truck_no: tn, trips: 0, total_qntl: 0, total_gross: 0, total_deductions: 0, total_net: 0, total_paid: 0, total_balance: 0 };
      truckData[tn].trips++; truckData[tn].total_qntl += fq; truckData[tn].total_gross += gross;
      truckData[tn].total_deductions += ded; truckData[tn].total_net += net; truckData[tn].total_paid += p.paid_amount; truckData[tn].total_balance += bal;
    });
    
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=truck_owner_${Date.now()}.pdf`);
    doc.pipe(res);
    
    addPdfHeader(doc, 'Truck Owner Consolidated Report');
    const headers = ['Truck No', 'Trips', 'Total QNTL', 'Gross', 'Deductions', 'Net Payable', 'Paid', 'Balance', 'Status'];
    const rows = Object.values(truckData).map(t => [
      t.truck_no, t.trips, t.total_qntl.toFixed(2), t.total_gross.toFixed(2),
      t.total_deductions.toFixed(2), t.total_net.toFixed(2), t.total_paid.toFixed(2),
      t.total_balance.toFixed(2), t.total_balance < 0.10 ? 'Paid' : (t.total_paid > 0 ? 'Partial' : 'Pending')
    ]);
    addPdfTable(doc, headers, rows, [55, 35, 50, 50, 50, 55, 50, 50, 40]);
    doc.end();
  } catch (err) {
    res.status(500).json({ detail: 'PDF failed: ' + err.message });
  }
});

// ============ CMR EXPORT ENDPOINTS ============

// ============ CASH BOOK ============
app.post('/api/cash-book', (req, res) => {
  if (!database.data.cash_transactions) database.data.cash_transactions = [];
  const d = req.body;
  const txn = {
    id: uuidv4(), date: d.date, account: d.account || 'cash', txn_type: d.txn_type || 'jama',
    category: d.category || '', description: d.description || '', amount: +(d.amount || 0),
    reference: d.reference || '', kms_year: d.kms_year || '', season: d.season || '',
    created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  database.data.cash_transactions.push(txn); database.save(); res.json(txn);
});

app.get('/api/cash-book', (req, res) => {
  if (!database.data.cash_transactions) database.data.cash_transactions = [];
  let txns = [...database.data.cash_transactions];
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
  if (req.query.date_from) txns = txns.filter(t => t.date >= req.query.date_from);
  if (req.query.date_to) txns = txns.filter(t => t.date <= req.query.date_to);
  res.json(txns.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
});

app.delete('/api/cash-book/:id', (req, res) => {
  if (!database.data.cash_transactions) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.cash_transactions.length;
  database.data.cash_transactions = database.data.cash_transactions.filter(t => t.id !== req.params.id);
  if (database.data.cash_transactions.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});

app.get('/api/cash-book/categories', (req, res) => {
  if (!database.data.cash_book_categories) database.data.cash_book_categories = [];
  res.json([...database.data.cash_book_categories]);
});
app.post('/api/cash-book/categories', (req, res) => {
  if (!database.data.cash_book_categories) database.data.cash_book_categories = [];
  const name = (req.body.name || '').trim();
  const type = req.body.type || '';
  if (!name || !type) return res.status(400).json({ detail: 'Name and type required' });
  if (database.data.cash_book_categories.find(c => c.name === name && c.type === type)) return res.status(400).json({ detail: 'Category already exists' });
  const cat = { id: uuidv4(), name, type, created_at: new Date().toISOString() };
  database.data.cash_book_categories.push(cat); database.save(); res.json(cat);
});
app.delete('/api/cash-book/categories/:id', (req, res) => {
  if (!database.data.cash_book_categories) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.cash_book_categories.length;
  database.data.cash_book_categories = database.data.cash_book_categories.filter(c => c.id !== req.params.id);
  if (database.data.cash_book_categories.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});

app.get('/api/cash-book/summary', (req, res) => {
  let txns = [...database.data.cash_transactions];
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  const cashIn = +txns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
  const cashOut = +txns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
  const bankIn = +txns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
  const bankOut = +txns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
  res.json({
    cash_in: cashIn, cash_out: cashOut, cash_balance: +(cashIn - cashOut).toFixed(2),
    bank_in: bankIn, bank_out: bankOut, bank_balance: +(bankIn - bankOut).toFixed(2),
    total_balance: +((cashIn - cashOut) + (bankIn - bankOut)).toFixed(2), total_transactions: txns.length
  });
});

app.get('/api/cash-book/excel', async (req, res) => {
  try {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
    txns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cash Book');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Account', key: 'account', width: 10 },
      { header: 'Type', key: 'type', width: 10 }, { header: 'Category', key: 'category', width: 18 },
      { header: 'Description', key: 'description', width: 24 }, { header: 'Jama (₹)', key: 'jama', width: 14 },
      { header: 'Nikasi (₹)', key: 'nikasi', width: 14 }, { header: 'Reference', key: 'reference', width: 16 }
    ];
    txns.forEach(t => ws.addRow({
      date: t.date, account: t.account === 'cash' ? 'Cash' : 'Bank',
      type: t.txn_type === 'jama' ? 'Jama' : 'Nikasi', category: t.category || '',
      description: t.description || '',
      jama: t.txn_type === 'jama' ? t.amount : '', nikasi: t.txn_type === 'nikasi' ? t.amount : '',
      reference: t.reference || ''
    }));
    const totalRow = ws.addRow({
      date: 'TOTAL', account: '', type: '', category: '', description: '',
      jama: +txns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
      nikasi: +txns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
      reference: ''
    });
    totalRow.font = { bold: true };
    addExcelTitle(ws, 'Daily Cash Book', 8);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cash_book_${Date.now()}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
});

app.get('/api/cash-book/pdf', (req, res) => {
  try {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
    txns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cash_book_${Date.now()}.pdf`);
    doc.pipe(res);
    addPdfHeader(doc, 'Daily Cash Book');
    const headers = ['Date', 'Account', 'Type', 'Category', 'Description', 'Jama(₹)', 'Nikasi(₹)', 'Ref'];
    const rows = txns.map(t => [t.date || '', t.account === 'cash' ? 'Cash' : 'Bank',
      t.txn_type === 'jama' ? 'Jama' : 'Nikasi', (t.category || '').substring(0, 15),
      (t.description || '').substring(0, 20),
      t.txn_type === 'jama' ? t.amount : '-', t.txn_type === 'nikasi' ? t.amount : '-',
      (t.reference || '').substring(0, 12)]);
    const tj = +txns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const tn = +txns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    rows.push(['TOTAL', '', '', '', '', tj, tn, '']);
    addPdfTable(doc, headers, rows, [50, 45, 40, 70, 100, 55, 55, 60]);
    doc.end();
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});

// ============ DC MANAGEMENT ============
app.post('/api/dc-entries', (req, res) => {
  if (!database.data.dc_entries) database.data.dc_entries = [];
  const d = req.body;
  const entry = { id: uuidv4(), dc_number: d.dc_number||'', date: d.date||'', quantity_qntl: +(d.quantity_qntl||0), rice_type: d.rice_type||'parboiled', godown_name: d.godown_name||'', deadline: d.deadline||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
  database.data.dc_entries.push(entry); database.save(); res.json(entry);
});
app.get('/api/dc-entries', (req, res) => {
  if (!database.data.dc_entries) database.data.dc_entries = [];
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  let entries = [...database.data.dc_entries];
  if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
  entries.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  entries.forEach(e => {
    const dels = database.data.dc_deliveries.filter(d => d.dc_id === e.id);
    const delivered = +dels.reduce((s,d) => s+(d.quantity_qntl||0), 0).toFixed(2);
    e.delivered_qntl = delivered; e.pending_qntl = +(e.quantity_qntl - delivered).toFixed(2); e.delivery_count = dels.length;
    e.status = delivered >= e.quantity_qntl ? 'completed' : (delivered > 0 ? 'partial' : 'pending');
  });
  res.json(entries);
});
app.delete('/api/dc-entries/:id', (req, res) => {
  if (!database.data.dc_entries) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.dc_entries.length;
  database.data.dc_entries = database.data.dc_entries.filter(e => e.id !== req.params.id);
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  database.data.dc_deliveries = database.data.dc_deliveries.filter(d => d.dc_id !== req.params.id);
  if (database.data.dc_entries.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});
app.post('/api/dc-deliveries', (req, res) => {
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  const d = req.body;
  const del = { id: uuidv4(), dc_id: d.dc_id||'', date: d.date||'', quantity_qntl: +(d.quantity_qntl||0), vehicle_no: d.vehicle_no||'', driver_name: d.driver_name||'', slip_no: d.slip_no||'', godown_name: d.godown_name||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
  database.data.dc_deliveries.push(del); database.save(); res.json(del);
});
app.get('/api/dc-deliveries', (req, res) => {
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  let dels = [...database.data.dc_deliveries];
  if (req.query.dc_id) dels = dels.filter(d => d.dc_id === req.query.dc_id);
  if (req.query.kms_year) dels = dels.filter(d => d.kms_year === req.query.kms_year);
  if (req.query.season) dels = dels.filter(d => d.season === req.query.season);
  res.json(dels.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
});
app.delete('/api/dc-deliveries/:id', (req, res) => {
  if (!database.data.dc_deliveries) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.dc_deliveries.length;
  database.data.dc_deliveries = database.data.dc_deliveries.filter(d => d.id !== req.params.id);
  if (database.data.dc_deliveries.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});
app.get('/api/dc-summary', (req, res) => {
  if (!database.data.dc_entries) database.data.dc_entries = [];
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  let dcs = [...database.data.dc_entries]; let dels = [...database.data.dc_deliveries];
  if (req.query.kms_year) { dcs = dcs.filter(e => e.kms_year === req.query.kms_year); dels = dels.filter(d => d.kms_year === req.query.kms_year); }
  if (req.query.season) { dcs = dcs.filter(e => e.season === req.query.season); dels = dels.filter(d => d.season === req.query.season); }
  const ta = +dcs.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2);
  const td = +dels.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2);
  let comp=0,part=0,pend=0;
  dcs.forEach(dc => { const d = dels.filter(x=>x.dc_id===dc.id).reduce((s,x)=>s+(x.quantity_qntl||0),0); if(d>=dc.quantity_qntl)comp++;else if(d>0)part++;else pend++; });
  res.json({ total_dc: dcs.length, total_allotted_qntl: ta, total_delivered_qntl: td, total_pending_qntl: +(ta-td).toFixed(2), completed: comp, partial: part, pending: pend, total_deliveries: dels.length });
});

// ============ MSP PAYMENTS ============
app.post('/api/msp-payments', (req, res) => {
  if (!database.data.msp_payments) database.data.msp_payments = [];
  const d = req.body;
  const pay = { id: uuidv4(), date: d.date||'', dc_id: d.dc_id||'', amount: +(d.amount||0), quantity_qntl: +(d.quantity_qntl||0), rate_per_qntl: +(d.rate_per_qntl||0), payment_mode: d.payment_mode||'', reference: d.reference||'', bank_name: d.bank_name||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
  database.data.msp_payments.push(pay); database.save(); res.json(pay);
});
app.get('/api/msp-payments', (req, res) => {
  if (!database.data.msp_payments) database.data.msp_payments = [];
  if (!database.data.dc_entries) database.data.dc_entries = [];
  let pays = [...database.data.msp_payments];
  if (req.query.kms_year) pays = pays.filter(p => p.kms_year === req.query.kms_year);
  if (req.query.season) pays = pays.filter(p => p.season === req.query.season);
  const dcMap = Object.fromEntries(database.data.dc_entries.map(d => [d.id, d.dc_number||'']));
  pays.forEach(p => { p.dc_number = dcMap[p.dc_id] || ''; });
  res.json(pays.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
});
app.delete('/api/msp-payments/:id', (req, res) => {
  if (!database.data.msp_payments) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.msp_payments.length;
  database.data.msp_payments = database.data.msp_payments.filter(p => p.id !== req.params.id);
  if (database.data.msp_payments.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});
app.get('/api/msp-payments/summary', (req, res) => {
  if (!database.data.msp_payments) database.data.msp_payments = [];
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  let pays = [...database.data.msp_payments]; let dels = [...database.data.dc_deliveries];
  if (req.query.kms_year) { pays = pays.filter(p=>p.kms_year===req.query.kms_year); dels = dels.filter(d=>d.kms_year===req.query.kms_year); }
  if (req.query.season) { pays = pays.filter(p=>p.season===req.query.season); dels = dels.filter(d=>d.season===req.query.season); }
  const tpa = +pays.reduce((s,p)=>s+(p.amount||0),0).toFixed(2);
  const tpq = +pays.reduce((s,p)=>s+(p.quantity_qntl||0),0).toFixed(2);
  const tdq = +dels.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2);
  res.json({ total_payments: pays.length, total_paid_amount: tpa, total_paid_qty: tpq, avg_rate: tpq>0?+(tpa/tpq).toFixed(2):0, total_delivered_qntl: tdq, pending_payment_qty: +(tdq-tpq).toFixed(2) });
});

// ============ GUNNY BAGS ============
app.post('/api/gunny-bags', (req, res) => {
  if (!database.data.gunny_bags) database.data.gunny_bags = [];
  const d = req.body;
  const entry = { id: uuidv4(), date: d.date||'', bag_type: d.bag_type||'new', txn_type: d.txn_type||'in', quantity: +(d.quantity||0), source: d.source||'', rate: +(d.rate||0), amount: +((d.quantity||0)*(d.rate||0)).toFixed(2), reference: d.reference||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
  database.data.gunny_bags.push(entry); database.save(); res.json(entry);
});
app.get('/api/gunny-bags', (req, res) => {
  if (!database.data.gunny_bags) database.data.gunny_bags = [];
  let entries = [...database.data.gunny_bags];
  if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
  if (req.query.bag_type) entries = entries.filter(e => e.bag_type === req.query.bag_type);
  res.json(entries.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
});
app.delete('/api/gunny-bags/:id', (req, res) => {
  if (!database.data.gunny_bags) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.gunny_bags.length;
  database.data.gunny_bags = database.data.gunny_bags.filter(e => e.id !== req.params.id);
  if (database.data.gunny_bags.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});
app.get('/api/gunny-bags/summary', (req, res) => {
  if (!database.data.gunny_bags) database.data.gunny_bags = [];
  let entries = [...database.data.gunny_bags];
  if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
  const result = {};
  ['new','old'].forEach(bt => {
    const items = entries.filter(e => e.bag_type === bt);
    result[bt] = { total_in: items.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.quantity||0),0), total_out: items.filter(e=>e.txn_type==='out').reduce((s,e)=>s+(e.quantity||0),0), balance: 0, total_cost: +items.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.amount||0),0).toFixed(2) };
    result[bt].balance = result[bt].total_in - result[bt].total_out;
  });
  // Paddy-received bags from truck entries
  let paddyEntries = [...database.data.entries];
  if (req.query.kms_year) paddyEntries = paddyEntries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) paddyEntries = paddyEntries.filter(e => e.season === req.query.season);
  result.paddy_bags = { total: paddyEntries.reduce((s,e)=>s+(e.bag||0),0), label: 'Paddy Receive Bags' };
  result.ppkt = { total: paddyEntries.reduce((s,e)=>s+(e.plastic_bag||0),0), label: 'P.Pkt (Plastic Bags)' };
  result.g_issued = { total: paddyEntries.reduce((s,e)=>s+(e.g_issued||0),0), label: 'Govt Bags Issued (g)' };
  result.grand_total = result.old.balance + result.paddy_bags.total + result.ppkt.total;
  res.json(result);
});

// ============ CMR EXPORT ENDPOINTS (continued) ============

// ---- MILLING REPORT EXCEL ----
app.get('/api/milling-report/excel', async (req, res) => {
  try {
    const entries = database.getMillingEntries(req.query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Milling Report');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Type', key: 'rice_type', width: 10 },
      { header: 'Paddy (Q)', key: 'paddy', width: 12 }, { header: 'Rice %', key: 'rice_pct', width: 9 },
      { header: 'Rice (Q)', key: 'rice', width: 10 }, { header: 'FRK (Q)', key: 'frk', width: 9 },
      { header: 'CMR (Q)', key: 'cmr', width: 10 }, { header: 'Outturn %', key: 'outturn', width: 10 },
      { header: 'Bran (Q)', key: 'bran', width: 9 }, { header: 'Kunda (Q)', key: 'kunda', width: 9 },
      { header: 'Husk %', key: 'husk_pct', width: 9 }, { header: 'Note', key: 'note', width: 14 }
    ];
    entries.forEach(e => {
      ws.addRow({ date: e.date, rice_type: (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1),
        paddy: e.paddy_input_qntl||0, rice_pct: e.rice_percent||0, rice: e.rice_qntl||0,
        frk: e.frk_used_qntl||0, cmr: e.cmr_delivery_qntl||0, outturn: e.outturn_ratio||0,
        bran: e.bran_qntl||0, kunda: e.kunda_qntl||0, husk_pct: e.husk_percent||0, note: e.note||'' });
    });
    addExcelTitle(ws, 'Milling Report', 12);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=milling_report_${Date.now()}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
});

// ---- MILLING REPORT PDF ----
app.get('/api/milling-report/pdf', (req, res) => {
  try {
    const entries = database.getMillingEntries(req.query);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=milling_report_${Date.now()}.pdf`);
    doc.pipe(res);
    addPdfHeader(doc, 'Milling Report');
    const headers = ['Date','Type','Paddy(Q)','Rice%','Rice(Q)','FRK(Q)','CMR(Q)','Outturn%','Bran(Q)','Husk%','Note'];
    const rows = entries.map(e => [e.date||'', (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1),
      (e.paddy_input_qntl||0), (e.rice_percent||0)+'%', (e.rice_qntl||0), (e.frk_used_qntl||0),
      (e.cmr_delivery_qntl||0), (e.outturn_ratio||0)+'%', (e.bran_qntl||0), (e.husk_percent||0)+'%', (e.note||'').substring(0,15)]);
    addPdfTable(doc, headers, rows, [50,45,45,35,40,35,40,40,35,35,60]);
    doc.end();
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});

// ---- FRK PURCHASES EXCEL ----
app.get('/api/frk-purchases/excel', async (req, res) => {
  try {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    let purchases = [...database.data.frk_purchases];
    if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
    if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
    purchases.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('FRK Purchases');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Party Name', key: 'party', width: 18 },
      { header: 'Qty (QNTL)', key: 'qty', width: 12 }, { header: 'Rate (₹/Q)', key: 'rate', width: 12 },
      { header: 'Amount (₹)', key: 'amount', width: 14 }, { header: 'Note', key: 'note', width: 16 }
    ];
    purchases.forEach(p => ws.addRow({ date: p.date, party: p.party_name||'', qty: p.quantity_qntl||0, rate: p.rate_per_qntl||0, amount: p.total_amount||0, note: p.note||'' }));
    const totalRow = ws.addRow({ date: 'TOTAL', party: '', qty: +purchases.reduce((s,p)=>s+(p.quantity_qntl||0),0).toFixed(2), rate: '', amount: +purchases.reduce((s,p)=>s+(p.total_amount||0),0).toFixed(2), note: '' });
    totalRow.font = { bold: true };
    addExcelTitle(ws, 'FRK Purchase Register', 6);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=frk_purchases_${Date.now()}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
});

// ---- FRK PURCHASES PDF ----
app.get('/api/frk-purchases/pdf', (req, res) => {
  try {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    let purchases = [...database.data.frk_purchases];
    if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
    if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
    purchases.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=frk_purchases_${Date.now()}.pdf`);
    doc.pipe(res);
    addPdfHeader(doc, 'FRK Purchase Register');
    const tq = +purchases.reduce((s,p)=>s+(p.quantity_qntl||0),0).toFixed(2);
    const ta = +purchases.reduce((s,p)=>s+(p.total_amount||0),0).toFixed(2);
    const headers = ['Date','Party','Qty(Q)','Rate(₹)','Amount(₹)','Note'];
    const rows = purchases.map(p => [p.date||'', (p.party_name||'').substring(0,25), p.quantity_qntl||0, p.rate_per_qntl||0, p.total_amount||0, (p.note||'').substring(0,20)]);
    rows.push(['TOTAL', '', tq, '', ta, '']);
    addPdfTable(doc, headers, rows, [60, 120, 55, 55, 70, 80]);
    doc.end();
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});

// ---- BYPRODUCT SALES EXCEL ----
app.get('/api/byproduct-sales/excel', async (req, res) => {
  try {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    let sales = [...database.data.byproduct_sales];
    if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
    if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
    sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const millingEntries = database.getMillingEntries(req.query);
    const products = ['bran','kunda','broken','kanki','husk'];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('By-Product Sales');
    // Stock summary
    ws.columns = [
      { header: 'Product', key: 'product', width: 14 }, { header: 'Produced (Q)', key: 'produced', width: 14 },
      { header: 'Sold (Q)', key: 'sold', width: 12 }, { header: 'Available (Q)', key: 'available', width: 14 },
      { header: 'Revenue (₹)', key: 'revenue', width: 14 }
    ];
    products.forEach(p => {
      const produced = +millingEntries.reduce((s,e)=>s+(e[`${p}_qntl`]||0),0).toFixed(2);
      const pSales = sales.filter(s => s.product === p);
      const sold = +pSales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
      const revenue = +pSales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
      ws.addRow({ product: p.charAt(0).toUpperCase()+p.slice(1), produced, sold, available: +(produced-sold).toFixed(2), revenue });
    });
    // Add gap + sales detail
    ws.addRow({});
    const detailHeaderRow = ws.addRow({ product: 'Date', produced: 'Product', sold: 'Qty (Q)', available: 'Rate (₹/Q)', revenue: 'Amount (₹)' });
    detailHeaderRow.font = { bold: true };
    sales.forEach(s => ws.addRow({ product: s.date||'', produced: (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), sold: s.quantity_qntl||0, available: s.rate_per_qntl||0, revenue: s.total_amount||0 }));
    const totalRow = ws.addRow({ product: 'TOTAL', produced: '', sold: +sales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2), available: '', revenue: +sales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2) });
    totalRow.font = { bold: true };
    addExcelTitle(ws, 'By-Product Stock & Sales Report', 5);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=byproduct_sales_${Date.now()}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
});

// ---- BYPRODUCT SALES PDF ----
app.get('/api/byproduct-sales/pdf', (req, res) => {
  try {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    let sales = [...database.data.byproduct_sales];
    if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
    if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
    sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const millingEntries = database.getMillingEntries(req.query);
    const products = ['bran','kunda','broken','kanki','husk'];
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=byproduct_sales_${Date.now()}.pdf`);
    doc.pipe(res);
    addPdfHeader(doc, 'By-Product Stock & Sales Report');
    // Stock summary
    const sHeaders = ['Product','Produced(Q)','Sold(Q)','Available(Q)','Revenue(₹)'];
    const sRows = products.map(p => {
      const produced = +millingEntries.reduce((s,e)=>s+(e[`${p}_qntl`]||0),0).toFixed(2);
      const pSales = sales.filter(s => s.product === p);
      const sold = +pSales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
      const revenue = +pSales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
      return [p.charAt(0).toUpperCase()+p.slice(1), produced, sold, +(produced-sold).toFixed(2), revenue];
    });
    addPdfTable(doc, sHeaders, sRows, [70, 70, 60, 70, 70]);
    doc.moveDown(1);
    // Sales detail
    doc.fontSize(11).font('Helvetica-Bold').text('Sales Detail', { align: 'left' });
    doc.moveDown(0.3);
    const headers = ['Date','Product','Qty(Q)','Rate(₹)','Amount(₹)','Buyer'];
    const tq = +sales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
    const ta = +sales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
    const rows = sales.map(s => [s.date||'', (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), s.quantity_qntl||0, s.rate_per_qntl||0, s.total_amount||0, (s.buyer_name||'').substring(0,20)]);
    rows.push(['TOTAL', '', tq, '', ta, '']);
    addPdfTable(doc, headers, rows, [55, 55, 45, 50, 60, 90]);
    doc.end();
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});

// ---- PADDY CUSTODY REGISTER EXCEL ----
app.get('/api/paddy-custody-register/excel', async (req, res) => {
  try {
    const filters = req.query;
    let entries = [...database.data.entries];
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);
    const millingEntries = database.getMillingEntries(filters);
    const rows = [];
    entries.forEach(e => rows.push({ date: e.date||'', type: 'received', description: `Truck: ${e.truck_no||''} | Agent: ${e.agent_name||''} | Mandi: ${e.mandi_name||''}`, received_qntl: +((e.mill_w||0)/100).toFixed(2), released_qntl: 0 }));
    millingEntries.forEach(e => rows.push({ date: e.date||'', type: 'released', description: `Milling (${(e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1)}) | Rice: ${e.rice_qntl||0}Q`, received_qntl: 0, released_qntl: e.paddy_input_qntl||0 }));
    rows.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    let balance = 0;
    rows.forEach(r => { balance += r.received_qntl - r.released_qntl; r.balance_qntl = +balance.toFixed(2); });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Paddy Custody Register');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Description', key: 'description', width: 40 },
      { header: 'Received (QNTL)', key: 'received', width: 16 }, { header: 'Released (QNTL)', key: 'released', width: 16 },
      { header: 'Balance (QNTL)', key: 'balance', width: 16 }
    ];
    rows.forEach(r => ws.addRow({ date: r.date, description: r.description, received: r.received_qntl > 0 ? r.received_qntl : '', released: r.released_qntl > 0 ? r.released_qntl : '', balance: r.balance_qntl }));
    const totalRow = ws.addRow({ date: 'TOTAL', description: '', received: +rows.reduce((s,r)=>s+r.received_qntl,0).toFixed(2), released: +rows.reduce((s,r)=>s+r.released_qntl,0).toFixed(2), balance: +balance.toFixed(2) });
    totalRow.font = { bold: true };
    addExcelTitle(ws, 'Paddy Custody Register', 5);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=paddy_custody_${Date.now()}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
});

// ---- PADDY CUSTODY REGISTER PDF ----
app.get('/api/paddy-custody-register/pdf', (req, res) => {
  try {
    const filters = req.query;
    let entries = [...database.data.entries];
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);
    const millingEntries = database.getMillingEntries(filters);
    const rows = [];
    entries.forEach(e => rows.push({ date: e.date||'', type: 'received', description: `Truck: ${e.truck_no||''} | Agent: ${e.agent_name||''} | Mandi: ${e.mandi_name||''}`, received_qntl: +((e.mill_w||0)/100).toFixed(2), released_qntl: 0 }));
    millingEntries.forEach(e => rows.push({ date: e.date||'', type: 'released', description: `Milling (${(e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1)}) | Rice: ${e.rice_qntl||0}Q`, received_qntl: 0, released_qntl: e.paddy_input_qntl||0 }));
    rows.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    let balance = 0;
    rows.forEach(r => { balance += r.received_qntl - r.released_qntl; r.balance_qntl = +balance.toFixed(2); });
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=paddy_custody_${Date.now()}.pdf`);
    doc.pipe(res);
    addPdfHeader(doc, 'Paddy Custody Register');
    const headers = ['Date','Description','Received(Q)','Released(Q)','Balance(Q)'];
    const pdfRows = rows.map(r => [r.date, r.description.substring(0,35), r.received_qntl > 0 ? r.received_qntl : '-', r.released_qntl > 0 ? r.released_qntl : '-', r.balance_qntl]);
    pdfRows.push(['TOTAL', '', +rows.reduce((s,r)=>s+r.received_qntl,0).toFixed(2), +rows.reduce((s,r)=>s+r.released_qntl,0).toFixed(2), +balance.toFixed(2)]);
    addPdfTable(doc, headers, pdfRows, [50, 180, 60, 60, 60]);
    doc.end();
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});

// ============ PHASE 5: CONSOLIDATED LEDGERS ============

app.get('/api/reports/outstanding', (req, res) => {
  const { kms_year, season } = req.query;
  // DC pending deliveries
  const dcEntries = (database.data.dc_entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
  const allDels = (database.data.dc_deliveries || []).filter(d => (!kms_year || d.kms_year === kms_year) && (!season || d.season === season));
  const dcOutstanding = [];
  for (const dc of dcEntries) {
    const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl || 0), 0) * 100) / 100;
    const pending = Math.round((dc.quantity_qntl - delivered) * 100) / 100;
    if (pending > 0) dcOutstanding.push({ dc_number: dc.dc_number || '', allotted: dc.quantity_qntl, delivered, pending, deadline: dc.deadline || '', rice_type: dc.rice_type || '' });
  }
  const dcPendingTotal = Math.round(dcOutstanding.reduce((s, d) => s + d.pending, 0) * 100) / 100;

  // MSP payment pending
  const mspPayments = (database.data.msp_payments || []).filter(p => (!kms_year || p.kms_year === kms_year) && (!season || p.season === season));
  const totalDeliveredQntl = Math.round(allDels.reduce((s, d) => s + (d.quantity_qntl || 0), 0) * 100) / 100;
  const totalMspPaidQty = Math.round(mspPayments.reduce((s, p) => s + (p.quantity_qntl || 0), 0) * 100) / 100;
  const totalMspPaidAmt = Math.round(mspPayments.reduce((s, p) => s + (p.amount || 0), 0) * 100) / 100;
  const mspPendingQty = Math.round((totalDeliveredQntl - totalMspPaidQty) * 100) / 100;

  // Truck summary
  const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
  const truckMap = {};
  for (const e of entries) {
    const truck = e.truck_no || 'Unknown';
    if (!truckMap[truck]) truckMap[truck] = { truck_no: truck, total_trips: 0, total_qty_qntl: 0, total_cash_paid: 0, total_diesel_paid: 0 };
    truckMap[truck].total_trips++;
    truckMap[truck].total_qty_qntl = Math.round((truckMap[truck].total_qty_qntl + (e.mill_w || 0) / 100) * 100) / 100;
    truckMap[truck].total_cash_paid = Math.round((truckMap[truck].total_cash_paid + (e.cash_paid || 0)) * 100) / 100;
    truckMap[truck].total_diesel_paid = Math.round((truckMap[truck].total_diesel_paid + (e.diesel_paid || 0)) * 100) / 100;
  }

  // Agent summary
  const agentMap = {};
  for (const e of entries) {
    const agent = e.agent_name || 'Unknown';
    if (!agentMap[agent]) agentMap[agent] = { agent_name: agent, total_entries: 0, total_qty_qntl: 0 };
    agentMap[agent].total_entries++;
    agentMap[agent].total_qty_qntl = Math.round((agentMap[agent].total_qty_qntl + (e.mill_w || 0) / 100) * 100) / 100;
  }

  // FRK purchase summary
  const frkPurchases = (database.data.frk_purchases || []).filter(p => (!kms_year || p.kms_year === kms_year) && (!season || p.season === season));
  const frkPartyMap = {};
  for (const p of frkPurchases) {
    const party = p.party_name || 'Unknown';
    if (!frkPartyMap[party]) frkPartyMap[party] = { party_name: party, total_qty: 0, total_amount: 0 };
    frkPartyMap[party].total_qty = Math.round((frkPartyMap[party].total_qty + (p.quantity_qntl || 0)) * 100) / 100;
    frkPartyMap[party].total_amount = Math.round((frkPartyMap[party].total_amount + (p.total_amount || 0)) * 100) / 100;
  }

  res.json({
    dc_outstanding: { items: dcOutstanding, total_pending_qntl: dcPendingTotal, count: dcOutstanding.length },
    msp_outstanding: { total_delivered_qntl: totalDeliveredQntl, total_paid_qty: totalMspPaidQty, total_paid_amount: totalMspPaidAmt, pending_qty: mspPendingQty },
    trucks: Object.values(truckMap),
    agents: Object.values(agentMap),
    frk_parties: Object.values(frkPartyMap)
  });
});

app.get('/api/reports/party-ledger', (req, res) => {
  const { party_name, party_type, kms_year, season } = req.query;
  const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
  const ledger = [];

  // Paddy entries (Agent)
  if (!party_type || party_type === 'agent') {
    for (const e of entries) {
      const agent = e.agent_name || ''; if (!agent) continue;
      if (party_name && agent.toLowerCase() !== party_name.toLowerCase()) continue;
      ledger.push({ date: e.date || '', party_name: agent, party_type: 'Agent',
        description: `Paddy: ${Math.round((e.mill_w || 0) / 100 * 100) / 100}Q | Truck: ${e.truck_no || ''}`,
        debit: 0, credit: Math.round(((e.cash_paid || 0) + (e.diesel_paid || 0)) * 100) / 100, ref: (e.id || '').substring(0, 8) });
    }
  }
  // Paddy entries (Truck)
  if (!party_type || party_type === 'truck') {
    for (const e of entries) {
      const truck = e.truck_no || ''; if (!truck) continue;
      if (party_name && truck.toLowerCase() !== party_name.toLowerCase()) continue;
      ledger.push({ date: e.date || '', party_name: truck, party_type: 'Truck',
        description: `Paddy: ${Math.round((e.mill_w || 0) / 100 * 100) / 100}Q | Agent: ${e.agent_name || ''}`,
        debit: 0, credit: Math.round(((e.cash_paid || 0) + (e.diesel_paid || 0)) * 100) / 100, ref: (e.id || '').substring(0, 8) });
    }
  }
  // FRK purchases
  if (!party_type || party_type === 'frk_party') {
    const frkPurchases = (database.data.frk_purchases || []).filter(p => (!kms_year || p.kms_year === kms_year) && (!season || p.season === season));
    for (const p of frkPurchases) {
      const party = p.party_name || ''; if (!party) continue;
      if (party_name && party.toLowerCase() !== party_name.toLowerCase()) continue;
      ledger.push({ date: p.date || '', party_name: party, party_type: 'FRK Seller',
        description: `FRK: ${p.quantity_qntl || 0}Q @ ₹${p.rate_per_qntl || 0}/Q`,
        debit: Math.round((p.total_amount || 0) * 100) / 100, credit: 0, ref: (p.id || '').substring(0, 8) });
    }
  }
  // By-product sales
  if (!party_type || party_type === 'buyer') {
    const bpSales = (database.data.byproduct_sales || []).filter(s => (!kms_year || s.kms_year === kms_year) && (!season || s.season === season));
    for (const s of bpSales) {
      const buyer = s.buyer_name || ''; if (!buyer) continue;
      if (party_name && buyer.toLowerCase() !== party_name.toLowerCase()) continue;
      ledger.push({ date: s.date || '', party_name: buyer, party_type: 'Buyer',
        description: `${(s.product || '').charAt(0).toUpperCase() + (s.product || '').slice(1)}: ${s.quantity_qntl || 0}Q @ ₹${s.rate_per_qntl || 0}/Q`,
        debit: 0, credit: Math.round((s.total_amount || 0) * 100) / 100, ref: (s.id || '').substring(0, 8) });
    }
  }

  ledger.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const partySet = new Set();
  for (const item of ledger) partySet.add(JSON.stringify({ name: item.party_name, type: item.party_type }));
  const partyList = [...partySet].map(s => JSON.parse(s)).sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    ledger, party_list: partyList,
    total_debit: Math.round(ledger.reduce((s, l) => s + l.debit, 0) * 100) / 100,
    total_credit: Math.round(ledger.reduce((s, l) => s + l.credit, 0) * 100) / 100
  });
});

app.get('/api/reports/outstanding/excel', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { kms_year, season } = req.query;
    // Reuse outstanding logic inline
    const dcEntries = (database.data.dc_entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    const allDels = (database.data.dc_deliveries || []).filter(d => (!kms_year || d.kms_year === kms_year) && (!season || d.season === season));
    const dcOutstanding = [];
    for (const dc of dcEntries) {
      const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl || 0), 0) * 100) / 100;
      const pending = Math.round((dc.quantity_qntl - delivered) * 100) / 100;
      if (pending > 0) dcOutstanding.push({ dc_number: dc.dc_number || '', allotted: dc.quantity_qntl, delivered, pending, deadline: dc.deadline || '', rice_type: dc.rice_type || '' });
    }
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Outstanding');
    ws.mergeCells('A1:F1'); ws.getCell('A1').value = 'Outstanding Report'; ws.getCell('A1').font = { bold: true, size: 14 };
    let row = 3; ws.getCell(`A${row}`).value = 'DC PENDING DELIVERIES'; ws.getCell(`A${row}`).font = { bold: true, size: 11 }; row++;
    ['DC No', 'Allotted(Q)', 'Delivered(Q)', 'Pending(Q)', 'Deadline', 'Type'].forEach((h, i) => { ws.getCell(row, i + 1).value = h; ws.getCell(row, i + 1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getCell(row, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }; }); row++;
    for (const d of dcOutstanding) { [d.dc_number, d.allotted, d.delivered, d.pending, d.deadline, d.rice_type].forEach((v, i) => { ws.getCell(row, i + 1).value = v; }); row++; }
    const buf = await wb.xlsx.writeBuffer();
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename=outstanding_${Date.now()}.xlsx` });
    res.send(Buffer.from(buf));
  } catch (err) { res.status(500).json({ detail: 'Excel export failed: ' + err.message }); }
});

app.get('/api/reports/outstanding/pdf', (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=outstanding_${Date.now()}.pdf`);
    doc.pipe(res);
    doc.fontSize(18).text('Outstanding Report', { align: 'center' }); doc.moveDown();
    doc.fontSize(12).text('DC Pending Deliveries', { underline: true }); doc.moveDown(0.5);
    const { kms_year, season } = req.query;
    const dcEntries = (database.data.dc_entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    const allDels = (database.data.dc_deliveries || []).filter(d => (!kms_year || d.kms_year === kms_year) && (!season || d.season === season));
    for (const dc of dcEntries) {
      const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl || 0), 0) * 100) / 100;
      const pending = Math.round((dc.quantity_qntl - delivered) * 100) / 100;
      if (pending > 0) doc.fontSize(9).text(`${dc.dc_number || '-'} | Allotted: ${dc.quantity_qntl}Q | Delivered: ${delivered}Q | Pending: ${pending}Q`);
    }
    doc.end();
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});

app.get('/api/reports/party-ledger/excel', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { party_name, party_type, kms_year, season } = req.query;
    // Build ledger inline
    const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    const ledger = [];
    if (!party_type || party_type === 'agent') entries.forEach(e => { const a = e.agent_name || ''; if (!a) return; if (party_name && a.toLowerCase() !== party_name.toLowerCase()) return; ledger.push({ date: e.date, party_name: a, party_type: 'Agent', description: `Paddy: ${Math.round((e.mill_w||0)/100*100)/100}Q`, debit: 0, credit: Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100, ref: (e.id||'').substring(0,8) }); });
    if (!party_type || party_type === 'truck') entries.forEach(e => { const t = e.truck_no || ''; if (!t) return; if (party_name && t.toLowerCase() !== party_name.toLowerCase()) return; ledger.push({ date: e.date, party_name: t, party_type: 'Truck', description: `Paddy: ${Math.round((e.mill_w||0)/100*100)/100}Q`, debit: 0, credit: Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100, ref: (e.id||'').substring(0,8) }); });
    if (!party_type || party_type === 'frk_party') (database.data.frk_purchases||[]).filter(p => (!kms_year || p.kms_year === kms_year) && (!season || p.season === season)).forEach(p => { const n = p.party_name||''; if (!n) return; if (party_name && n.toLowerCase() !== party_name.toLowerCase()) return; ledger.push({ date: p.date, party_name: n, party_type: 'FRK Seller', description: `FRK: ${p.quantity_qntl||0}Q`, debit: Math.round((p.total_amount||0)*100)/100, credit: 0, ref: (p.id||'').substring(0,8) }); });
    if (!party_type || party_type === 'buyer') (database.data.byproduct_sales||[]).filter(s => (!kms_year || s.kms_year === kms_year) && (!season || s.season === season)).forEach(s => { const b = s.buyer_name||''; if (!b) return; if (party_name && b.toLowerCase() !== party_name.toLowerCase()) return; ledger.push({ date: s.date, party_name: b, party_type: 'Buyer', description: `${(s.product||'')}`, debit: 0, credit: Math.round((s.total_amount||0)*100)/100, ref: (s.id||'').substring(0,8) }); });
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Party Ledger');
    ws.mergeCells('A1:G1'); ws.getCell('A1').value = `Party Ledger${party_name ? ' - ' + party_name : ''}`; ws.getCell('A1').font = { bold: true, size: 14 };
    ['Date', 'Party', 'Type', 'Description', 'Debit(₹)', 'Credit(₹)', 'Ref'].forEach((h, i) => { ws.getCell(3, i + 1).value = h; ws.getCell(3, i + 1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getCell(3, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }; });
    ledger.forEach((l, i) => { [l.date, l.party_name, l.party_type, l.description, l.debit || '', l.credit || '', l.ref].forEach((v, j) => { ws.getCell(i + 4, j + 1).value = v; }); });
    const buf = await wb.xlsx.writeBuffer();
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename=party_ledger_${Date.now()}.xlsx` });
    res.send(Buffer.from(buf));
  } catch (err) { res.status(500).json({ detail: 'Excel export failed: ' + err.message }); }
});

app.get('/api/reports/party-ledger/pdf', (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const { party_name, party_type, kms_year, season } = req.query;
    const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    const ledger = [];
    if (!party_type || party_type === 'agent') entries.forEach(e => { const a = e.agent_name||''; if (!a||(party_name && a.toLowerCase()!==party_name.toLowerCase())) return; ledger.push({ date: e.date, party_name: a, party_type: 'Agent', description: `Paddy: ${Math.round((e.mill_w||0)/100*100)/100}Q`, debit: 0, credit: Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100 }); });
    if (!party_type || party_type === 'truck') entries.forEach(e => { const t = e.truck_no||''; if (!t||(party_name && t.toLowerCase()!==party_name.toLowerCase())) return; ledger.push({ date: e.date, party_name: t, party_type: 'Truck', description: `Paddy: ${Math.round((e.mill_w||0)/100*100)/100}Q`, debit: 0, credit: Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100 }); });
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=party_ledger_${Date.now()}.pdf`);
    doc.pipe(res);
    doc.fontSize(18).text(`Party Ledger${party_name ? ' - ' + party_name : ''}`, { align: 'center' }); doc.moveDown();
    for (const l of ledger) doc.fontSize(8).text(`${l.date} | ${l.party_name} (${l.party_type}) | ${l.description} | Dr:₹${l.debit} | Cr:₹${l.credit}`);
    doc.end();
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});



// ============ SERVE FRONTEND (Static Files) ============
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    }
  });
} else {
  app.get('/', (req, res) => {
    res.send(`
      <html><body style="font-family:Arial;text-align:center;padding:50px;background:#1e293b;color:white">
        <h1 style="color:#f59e0b">Mill Entry System</h1>
        <p>Frontend build nahi mila!</p>
        <p>Setup karein: <code>setup.bat</code> chalayein ya manually:</p>
        <pre style="background:#0f172a;padding:20px;border-radius:8px;text-align:left;display:inline-block">
cd ../frontend
npm install
set REACT_APP_BACKEND_URL=http://localhost:${PORT}
npm run build
xcopy /E /I build ..\\local-server\\public</pre>
        <p style="color:#64748b;margin-top:20px">API is running at: <a href="/api/" style="color:#f59e0b">/api/</a></p>
      </body></html>
    `);
  });
}

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  Mill Entry System - Local Server');
  console.log('========================================');
  console.log(`  URL:  http://localhost:${PORT}`);
  console.log(`  API:  http://localhost:${PORT}/api/`);
  console.log(`  Data: ${path.resolve(DATA_DIR)}`);
  console.log('========================================');
  console.log('  Band karne ke liye: Ctrl+C');
  console.log('');
  
  // Auto-open browser (only on Windows/Mac, skip on Linux servers)
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      const openModule = require('open');
      openModule(`http://localhost:${PORT}`);
    } catch (e) {
      console.log(`  Browser mein kholein: http://localhost:${PORT}`);
    }
  }
});

// Graceful shutdown - save data
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down... data save ho raha hai...');
  database.save();
  process.exit(0);
});

process.on('SIGTERM', () => {
  database.save();
  process.exit(0);
});
