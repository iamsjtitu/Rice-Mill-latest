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
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
    return this.data.truck_payments.find(p => p.entry_id === entryId) || {
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
    const base_rate = target.base_rate || 10;
    const cutting_rate = target.cutting_rate || 5;
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
    const base_rate = target.base_rate || 10;
    const cutting_rate = target.cutting_rate || 5;
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
  const total_amount = (target.target_qntl * (target.base_rate || 10)) + (cutting_qntl * (target.cutting_rate || 5));
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

// ============ EXPORT ENDPOINTS (CSV) ============
app.get('/api/export/excel', (req, res) => {
  const entries = database.getEntries(req.query);
  let csv = 'Date,Truck No,RST No,TP No,Agent,Mandi,QNTL,BAG,G.Dep,GBW Cut,Mill W,Moist%,M.Cut,Cut%,D/D/P,Final W,G.Issued,Cash,Diesel\n';
  entries.forEach(e => {
    csv += `${e.date || ''},${e.truck_no || ''},${e.rst_no || ''},${e.tp_no || ''},${e.agent_name || ''},${e.mandi_name || ''},${(e.qntl || 0).toFixed(2)},${e.bag || 0},${e.g_deposite || 0},${(e.gbw_cut || 0).toFixed(2)},${((e.mill_w || 0) / 100).toFixed(2)},${e.moisture || 0},${((e.moisture_cut || 0) / 100).toFixed(2)},${e.cutting_percent || 0},${e.disc_dust_poll || 0},${((e.final_w || 0) / 100).toFixed(2)},${e.g_issued || 0},${e.cash_paid || 0},${e.diesel_paid || 0}\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.csv`);
  res.send(csv);
});

app.get('/api/export/pdf', (req, res) => {
  res.redirect('/?print=entries');
});

app.get('/api/export/truck-payments-excel', (req, res) => {
  const entries = database.getEntries(req.query);
  let csv = 'Date,Truck No,Mandi,Final QNTL,Rate,Gross,Cash,Diesel,Deductions,Net Amount,Paid,Balance,Status\n';
  entries.forEach(entry => {
    const payment = database.getTruckPayment(entry.id);
    const fq = ((entry.final_w || 0) / 100).toFixed(2);
    const gross = (fq * payment.rate_per_qntl).toFixed(2);
    const ded = ((entry.cash_paid || 0) + (entry.diesel_paid || 0)).toFixed(2);
    const net = (gross - ded).toFixed(2);
    const bal = Math.max(0, net - payment.paid_amount).toFixed(2);
    const st = bal < 0.10 ? 'Paid' : (payment.paid_amount > 0 ? 'Partial' : 'Pending');
    csv += `${entry.date || ''},${entry.truck_no || ''},${entry.mandi_name || ''},${fq},${payment.rate_per_qntl},${gross},${entry.cash_paid || 0},${entry.diesel_paid || 0},${ded},${net},${payment.paid_amount},${bal},${st}\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.csv`);
  res.send(csv);
});

app.get('/api/export/truck-payments-pdf', (req, res) => res.redirect('/?print=truck-payments'));

app.get('/api/export/agent-payments-excel', (req, res) => {
  const targets = database.getMandiTargets(req.query);
  const entries = database.getEntries(req.query);
  let csv = 'Mandi,Agent,Target QNTL,Cutting QNTL,Base Rate,Cut Rate,Total Amount,Achieved,Paid,Balance,Status\n';
  targets.forEach(target => {
    const me = entries.filter(e => e.mandi_name === target.mandi_name);
    const achieved = me.reduce((s, e) => s + (e.final_w || 0) / 100, 0);
    const cq = target.target_qntl * target.cutting_percent / 100;
    const total = (target.target_qntl * (target.base_rate || 10)) + (cq * (target.cutting_rate || 5));
    const p = database.getAgentPayment(target.mandi_name, target.kms_year, target.season);
    const bal = Math.max(0, total - p.paid_amount);
    const st = bal < 0.01 ? 'Paid' : (p.paid_amount > 0 ? 'Partial' : 'Pending');
    const ae = me.find(e => e.agent_name);
    csv += `${target.mandi_name},${ae ? ae.agent_name : ''},${target.target_qntl},${cq.toFixed(2)},${target.base_rate || 10},${target.cutting_rate || 5},${total.toFixed(2)},${achieved.toFixed(2)},${p.paid_amount},${bal.toFixed(2)},${st}\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=agent_payments_${Date.now()}.csv`);
  res.send(csv);
});

app.get('/api/export/agent-payments-pdf', (req, res) => res.redirect('/?print=agent-payments'));
app.get('/api/export/summary-report-pdf', (req, res) => res.redirect('/?print=summary'));

app.get('/api/export/truck-owner-excel', (req, res) => {
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
  let csv = 'Truck No,Trips,Total QNTL,Gross,Deductions,Net Payable,Paid,Balance,Status\n';
  Object.values(truckData).forEach(t => {
    const st = t.total_balance < 0.10 ? 'Paid' : (t.total_paid > 0 ? 'Partial' : 'Pending');
    csv += `${t.truck_no},${t.trips},${t.total_qntl.toFixed(2)},${t.total_gross.toFixed(2)},${t.total_deductions.toFixed(2)},${t.total_net.toFixed(2)},${t.total_paid.toFixed(2)},${t.total_balance.toFixed(2)},${st}\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=truck_owner_${Date.now()}.csv`);
  res.send(csv);
});

app.get('/api/export/truck-owner-pdf', (req, res) => res.redirect('/?print=truck-owner'));

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
