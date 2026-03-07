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
      agent_payments: []
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
app.use(express.json());

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
  database.updateTruckPayment(req.params.entryId, { rate_per_qntl: req.body.rate_per_qntl });
  res.json({ success: true, message: `Rate set to Rs.${req.body.rate_per_qntl}/QNTL` });
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
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 28;
  sheet.columns.forEach(col => { col.width = Math.max(col.width || 12, 12); });
}

// Helper: Add branding title row to Excel
function addExcelTitle(sheet, title, colCount) {
  const branding = database.getBranding();
  sheet.insertRow(1, []);
  sheet.insertRow(1, []);
  sheet.mergeCells(1, 1, 1, colCount);
  sheet.mergeCells(2, 1, 2, colCount);
  const titleCell = sheet.getCell('A1');
  titleCell.value = branding.company_name;
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF1E3A5F' } };
  titleCell.alignment = { horizontal: 'center' };
  const subCell = sheet.getCell('A2');
  subCell.value = `${branding.tagline} | ${title} | ${new Date().toLocaleDateString('en-IN')}`;
  subCell.font = { size: 10, color: { argb: 'FF666666' } };
  subCell.alignment = { horizontal: 'center' };
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
