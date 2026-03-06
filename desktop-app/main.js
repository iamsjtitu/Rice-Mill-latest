/**
 * Mill Entry System - Electron Desktop Application
 * Tally-style Data Folder Selection + Local JSON Database
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// ============ GLOBAL VARIABLES ============
let mainWindow = null;
let splashWindow = null;
let dataPath = null;
let db = null;
let server = null;
let serverPort = null;

// Config file location
const configPath = path.join(app.getPath('userData'), 'mill-entry-config.json');

// ============ CONFIG FUNCTIONS ============
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error('Config load error:', e);
  }
  return { recentPaths: [], lastPath: null };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Config save error:', e);
  }
}

// ============ JSON DATABASE CLASS ============
class JsonDatabase {
  constructor(dataFolder) {
    this.dataFolder = dataFolder;
    this.dbFile = path.join(dataFolder, 'millentry-data.json');
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.dbFile)) {
        return JSON.parse(fs.readFileSync(this.dbFile, 'utf8'));
      }
    } catch (e) {
      console.error('Database load error:', e);
    }
    
    // Default data structure
    return {
      branding: {
        company_name: 'Mill Entry System',
        tagline: 'Data Management Software',
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
      console.error('Database save error:', e);
    }
  }

  // Branding
  getBranding() {
    return this.data.branding;
  }

  updateBranding(branding) {
    this.data.branding = { ...this.data.branding, ...branding, updated_at: new Date().toISOString() };
    this.save();
    return this.data.branding;
  }

  // Users
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

  // Entries
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
    const newEntry = {
      id: uuidv4(),
      ...entry,
      ...this.calculateFields(entry),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.data.entries.push(newEntry);
    this.save();
    return newEntry;
  }

  updateEntry(id, entry) {
    const index = this.data.entries.findIndex(e => e.id === id);
    if (index !== -1) {
      this.data.entries[index] = {
        ...this.data.entries[index],
        ...entry,
        ...this.calculateFields(entry),
        updated_at: new Date().toISOString()
      };
      this.save();
      return this.data.entries[index];
    }
    return null;
  }

  deleteEntry(id) {
    this.data.entries = this.data.entries.filter(e => e.id !== id);
    this.save();
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
    const moisture_cut = Math.round((mill_w_qntl * moisture_cut_percent / 100) * 100 * 100) / 100;

    const cutting = Math.round((mill_w_qntl * cutting_percent / 100) * 100 * 100) / 100;

    const final_w = Math.round((mill_w - p_pkt_cut - moisture_cut - cutting - disc_dust_poll) * 100) / 100;

    return {
      qntl,
      mill_w,
      p_pkt_cut,
      moisture_cut,
      moisture_cut_percent,
      cutting,
      final_w
    };
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

  // Suggestions
  getSuggestions(field) {
    const values = new Set();
    this.data.entries.forEach(e => {
      if (e[field]) values.add(e[field]);
    });
    return Array.from(values);
  }

  // Mandi Targets
  getMandiTargets(filters = {}) {
    let targets = [...this.data.mandi_targets];
    if (filters.kms_year) targets = targets.filter(t => t.kms_year === filters.kms_year);
    if (filters.season) targets = targets.filter(t => t.season === filters.season);
    return targets;
  }

  addMandiTarget(target) {
    const newTarget = {
      id: uuidv4(),
      ...target,
      expected_total: target.target_qntl + (target.target_qntl * target.cutting_percent / 100),
      created_at: new Date().toISOString()
    };
    this.data.mandi_targets.push(newTarget);
    this.save();
    return newTarget;
  }

  updateMandiTarget(id, target) {
    const index = this.data.mandi_targets.findIndex(t => t.id === id);
    if (index !== -1) {
      this.data.mandi_targets[index] = {
        ...this.data.mandi_targets[index],
        ...target,
        expected_total: target.target_qntl + (target.target_qntl * target.cutting_percent / 100)
      };
      this.save();
      return this.data.mandi_targets[index];
    }
    return null;
  }

  deleteMandiTarget(id) {
    this.data.mandi_targets = this.data.mandi_targets.filter(t => t.id !== id);
    this.save();
  }

  // Truck Payments
  getTruckPayment(entryId) {
    return this.data.truck_payments.find(p => p.entry_id === entryId) || {
      entry_id: entryId,
      rate_per_qntl: 32,
      paid_amount: 0,
      status: 'pending',
      payment_history: []
    };
  }

  updateTruckPayment(entryId, payment) {
    const index = this.data.truck_payments.findIndex(p => p.entry_id === entryId);
    if (index !== -1) {
      this.data.truck_payments[index] = { ...this.data.truck_payments[index], ...payment };
    } else {
      this.data.truck_payments.push({ entry_id: entryId, ...payment });
    }
    this.save();
    return this.getTruckPayment(entryId);
  }

  // Agent Payments
  getAgentPayment(mandiName, kmsYear, season) {
    return this.data.agent_payments.find(p => 
      p.mandi_name === mandiName && p.kms_year === kmsYear && p.season === season
    ) || {
      mandi_name: mandiName,
      kms_year: kmsYear,
      season: season,
      paid_amount: 0,
      status: 'pending',
      payment_history: []
    };
  }

  updateAgentPayment(mandiName, kmsYear, season, payment) {
    const index = this.data.agent_payments.findIndex(p => 
      p.mandi_name === mandiName && p.kms_year === kmsYear && p.season === season
    );
    if (index !== -1) {
      this.data.agent_payments[index] = { ...this.data.agent_payments[index], ...payment };
    } else {
      this.data.agent_payments.push({ 
        id: uuidv4(),
        mandi_name: mandiName, 
        kms_year: kmsYear, 
        season: season, 
        ...payment 
      });
    }
    this.save();
    return this.getAgentPayment(mandiName, kmsYear, season);
  }
}

// ============ EXPRESS API SERVER ============
function createApiServer(database) {
  const apiApp = express();
  apiApp.use(cors());
  apiApp.use(express.json());

  // ===== AUTH =====
  apiApp.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = database.getUser(username);
    if (user && user.password === password) {
      res.json({ success: true, username: user.username, role: user.role, message: 'Login successful' });
    } else {
      res.status(401).json({ detail: 'Invalid username or password' });
    }
  });

  apiApp.post('/api/auth/change-password', (req, res) => {
    const { username, current_password, new_password } = req.body;
    const user = database.getUser(username);
    if (!user || user.password !== current_password) {
      return res.status(401).json({ detail: 'Current password galat hai' });
    }
    database.updateUserPassword(username, new_password);
    res.json({ success: true, message: 'Password change ho gaya' });
  });

  // ===== BRANDING =====
  apiApp.get('/api/branding', (req, res) => {
    res.json(database.getBranding());
  });

  apiApp.put('/api/branding', (req, res) => {
    const branding = database.updateBranding(req.body);
    res.json({ success: true, message: 'Branding update ho gaya', branding });
  });

  // ===== ENTRIES =====
  apiApp.get('/api/entries', (req, res) => {
    res.json(database.getEntries(req.query));
  });

  apiApp.get('/api/entries/:id', (req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.id);
    if (entry) res.json(entry);
    else res.status(404).json({ detail: 'Entry not found' });
  });

  apiApp.post('/api/entries', (req, res) => {
    const entry = database.addEntry({ ...req.body, created_by: req.query.username || 'admin' });
    res.json(entry);
  });

  apiApp.put('/api/entries/:id', (req, res) => {
    const entry = database.updateEntry(req.params.id, req.body);
    if (entry) res.json(entry);
    else res.status(404).json({ detail: 'Entry not found' });
  });

  apiApp.delete('/api/entries/:id', (req, res) => {
    database.deleteEntry(req.params.id);
    res.json({ success: true });
  });

  apiApp.post('/api/entries/bulk-delete', (req, res) => {
    database.bulkDeleteEntries(req.body.entry_ids);
    res.json({ success: true, deleted: req.body.entry_ids.length });
  });

  // ===== TOTALS =====
  apiApp.get('/api/totals', (req, res) => {
    res.json(database.getTotals(req.query));
  });

  // ===== SUGGESTIONS =====
  apiApp.get('/api/suggestions/trucks', (req, res) => {
    res.json(database.getSuggestions('truck_no'));
  });

  apiApp.get('/api/suggestions/agents', (req, res) => {
    res.json(database.getSuggestions('agent_name'));
  });

  apiApp.get('/api/suggestions/mandis', (req, res) => {
    res.json(database.getSuggestions('mandi_name'));
  });

  // ===== MANDI TARGETS =====
  apiApp.get('/api/mandi-targets', (req, res) => {
    res.json(database.getMandiTargets(req.query));
  });

  apiApp.post('/api/mandi-targets', (req, res) => {
    const target = database.addMandiTarget({ ...req.body, created_by: req.query.username || 'admin' });
    res.json(target);
  });

  apiApp.put('/api/mandi-targets/:id', (req, res) => {
    const target = database.updateMandiTarget(req.params.id, req.body);
    if (target) res.json(target);
    else res.status(404).json({ detail: 'Target not found' });
  });

  apiApp.delete('/api/mandi-targets/:id', (req, res) => {
    database.deleteMandiTarget(req.params.id);
    res.json({ success: true });
  });

  apiApp.get('/api/mandi-targets/summary', (req, res) => {
    const targets = database.getMandiTargets(req.query);
    const entries = database.getEntries(req.query);
    
    const summary = targets.map(target => {
      const mandiEntries = entries.filter(e => e.mandi_name === target.mandi_name);
      const achieved_qntl = mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0);
      const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
      
      return {
        ...target,
        achieved_qntl: Math.round(achieved_qntl * 100) / 100,
        pending_qntl: Math.max(0, target.expected_total - achieved_qntl),
        progress_percent: Math.min(100, (achieved_qntl / target.expected_total) * 100),
        cutting_qntl,
        target_amount: target.target_qntl * (target.base_rate || 10),
        cutting_amount: cutting_qntl * (target.cutting_rate || 5),
        total_agent_amount: (target.target_qntl * (target.base_rate || 10)) + (cutting_qntl * (target.cutting_rate || 5))
      };
    });
    
    res.json(summary);
  });

  // ===== DASHBOARD =====
  apiApp.get('/api/dashboard/agent-totals', (req, res) => {
    const entries = database.getEntries(req.query);
    const agentMap = {};
    
    entries.forEach(e => {
      if (!agentMap[e.agent_name]) {
        agentMap[e.agent_name] = { agent_name: e.agent_name, total_final_w: 0, entry_count: 0 };
      }
      agentMap[e.agent_name].total_final_w += (e.final_w || 0) / 100;
      agentMap[e.agent_name].entry_count += 1;
    });
    
    res.json(Object.values(agentMap).map(a => ({
      ...a,
      total_final_w: Math.round(a.total_final_w * 100) / 100
    })));
  });

  // ===== TRUCK PAYMENTS =====
  apiApp.get('/api/truck-payments', (req, res) => {
    const entries = database.getEntries(req.query);
    const payments = entries.map(entry => {
      const payment = database.getTruckPayment(entry.id);
      const final_qntl = (entry.final_w || 0) / 100;
      const gross_amount = final_qntl * payment.rate_per_qntl;
      const deductions = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
      const net_amount = gross_amount - deductions;
      const balance_amount = Math.max(0, net_amount - payment.paid_amount);
      
      let status = 'pending';
      if (balance_amount < 0.01) status = 'paid';
      else if (payment.paid_amount > 0) status = 'partial';
      
      return {
        entry_id: entry.id,
        truck_no: entry.truck_no,
        date: entry.date,
        agent_name: entry.agent_name,
        mandi_name: entry.mandi_name,
        total_qntl: entry.qntl,
        total_bag: entry.bag,
        final_qntl: Math.round(final_qntl * 100) / 100,
        cash_taken: entry.cash_paid || 0,
        diesel_taken: entry.diesel_paid || 0,
        rate_per_qntl: payment.rate_per_qntl,
        gross_amount: Math.round(gross_amount * 100) / 100,
        deductions: Math.round(deductions * 100) / 100,
        net_amount: Math.round(net_amount * 100) / 100,
        paid_amount: payment.paid_amount,
        balance_amount: Math.round(balance_amount * 100) / 100,
        status,
        kms_year: entry.kms_year,
        season: entry.season
      };
    });
    
    res.json(payments);
  });

  apiApp.put('/api/truck-payments/:entryId/rate', (req, res) => {
    const payment = database.updateTruckPayment(req.params.entryId, { rate_per_qntl: req.body.rate_per_qntl });
    res.json({ success: true, payment });
  });

  apiApp.post('/api/truck-payments/:entryId/pay', (req, res) => {
    const current = database.getTruckPayment(req.params.entryId);
    const newPaidAmount = current.paid_amount + req.body.amount;
    const history = current.payment_history || [];
    history.push({
      amount: req.body.amount,
      date: new Date().toISOString(),
      note: req.body.note || '',
      by: req.query.username || 'admin'
    });
    
    database.updateTruckPayment(req.params.entryId, {
      paid_amount: newPaidAmount,
      payment_history: history
    });
    
    res.json({ success: true, message: 'Payment recorded' });
  });

  apiApp.post('/api/truck-payments/:entryId/mark-paid', (req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.entryId);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });
    
    const current = database.getTruckPayment(req.params.entryId);
    const final_qntl = (entry.final_w || 0) / 100;
    const gross_amount = final_qntl * current.rate_per_qntl;
    const deductions = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
    const net_amount = gross_amount - deductions;
    
    database.updateTruckPayment(req.params.entryId, {
      paid_amount: net_amount,
      status: 'paid'
    });
    
    res.json({ success: true, message: 'Payment cleared' });
  });

  apiApp.post('/api/truck-payments/:entryId/undo-paid', (req, res) => {
    database.updateTruckPayment(req.params.entryId, {
      paid_amount: 0,
      status: 'pending'
    });
    res.json({ success: true, message: 'Payment undo ho gaya' });
  });

  // ===== AGENT PAYMENTS =====
  apiApp.get('/api/agent-payments', (req, res) => {
    const targets = database.getMandiTargets(req.query);
    const entries = database.getEntries(req.query);
    
    const payments = targets.map(target => {
      const payment = database.getAgentPayment(target.mandi_name, target.kms_year, target.season);
      const mandiEntries = entries.filter(e => e.mandi_name === target.mandi_name);
      const achieved_qntl = mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0);
      const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
      const target_amount = target.target_qntl * (target.base_rate || 10);
      const cutting_amount = cutting_qntl * (target.cutting_rate || 5);
      const total_amount = target_amount + cutting_amount;
      const balance_amount = Math.max(0, total_amount - payment.paid_amount);
      
      let status = 'pending';
      if (balance_amount < 0.01) status = 'paid';
      else if (payment.paid_amount > 0) status = 'partial';
      
      return {
        mandi_name: target.mandi_name,
        agent_name: target.agent_name || '',
        target_qntl: target.target_qntl,
        cutting_percent: target.cutting_percent,
        cutting_qntl: Math.round(cutting_qntl * 100) / 100,
        base_rate: target.base_rate || 10,
        cutting_rate: target.cutting_rate || 5,
        target_amount: Math.round(target_amount * 100) / 100,
        cutting_amount: Math.round(cutting_amount * 100) / 100,
        total_amount: Math.round(total_amount * 100) / 100,
        achieved_qntl: Math.round(achieved_qntl * 100) / 100,
        is_target_complete: achieved_qntl >= target.expected_total,
        paid_amount: payment.paid_amount,
        balance_amount: Math.round(balance_amount * 100) / 100,
        status,
        kms_year: target.kms_year,
        season: target.season
      };
    });
    
    res.json(payments);
  });

  apiApp.post('/api/agent-payments/:mandiName/pay', (req, res) => {
    const { kms_year, season } = req.query;
    const current = database.getAgentPayment(req.params.mandiName, kms_year, season);
    const newPaidAmount = current.paid_amount + req.body.amount;
    const history = current.payment_history || [];
    history.push({
      amount: req.body.amount,
      date: new Date().toISOString(),
      note: req.body.note || '',
      by: req.query.username || 'admin'
    });
    
    database.updateAgentPayment(req.params.mandiName, kms_year, season, {
      paid_amount: newPaidAmount,
      payment_history: history
    });
    
    res.json({ success: true, message: 'Payment recorded' });
  });

  apiApp.post('/api/agent-payments/:mandiName/mark-paid', (req, res) => {
    const { kms_year, season } = req.query;
    const target = database.getMandiTargets({ kms_year, season }).find(t => t.mandi_name === req.params.mandiName);
    
    if (!target) return res.status(404).json({ detail: 'Mandi target not found' });
    
    const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
    const total_amount = (target.target_qntl * (target.base_rate || 10)) + (cutting_qntl * (target.cutting_rate || 5));
    
    database.updateAgentPayment(req.params.mandiName, kms_year, season, {
      paid_amount: total_amount,
      status: 'paid'
    });
    
    res.json({ success: true, message: 'Agent/Mandi payment cleared' });
  });

  apiApp.post('/api/agent-payments/:mandiName/undo-paid', (req, res) => {
    const { kms_year, season } = req.query;
    database.updateAgentPayment(req.params.mandiName, kms_year, season, {
      paid_amount: 0,
      status: 'pending'
    });
    res.json({ success: true, message: 'Payment undo ho gaya' });
  });

  // ===== PAYMENT HISTORY =====
  apiApp.get('/api/payment-history/:type/:id', (req, res) => {
    const { type, id } = req.params;
    
    if (type === 'truck') {
      const payment = database.getTruckPayment(id);
      res.json(payment.payment_history || []);
    } else if (type === 'agent') {
      const { kms_year, season } = req.query;
      const payment = database.getAgentPayment(decodeURIComponent(id), kms_year, season);
      res.json(payment.payment_history || []);
    } else {
      res.json([]);
    }
  });

  // Start server
  return new Promise((resolve) => {
    server = apiApp.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`API Server started on port ${port}`);
      resolve(port);
    });
  });
}

// ============ SPLASH WINDOW (Data Folder Selection) ============
function createSplashWindow() {
  const config = loadConfig();
  
  splashWindow = new BrowserWindow({
    width: 650,
    height: 550,
    frame: false,
    resizable: false,
    center: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const splashHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: white;
      height: 100vh;
      display: flex;
      flex-direction: column;
      user-select: none;
    }
    .titlebar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px;
      background: rgba(0,0,0,0.3);
      -webkit-app-region: drag;
    }
    .titlebar-title { font-size: 12px; color: #94a3b8; }
    .titlebar-close {
      -webkit-app-region: no-drag;
      background: none;
      border: none;
      color: #64748b;
      font-size: 18px;
      cursor: pointer;
      width: 30px;
      height: 30px;
      border-radius: 4px;
    }
    .titlebar-close:hover { background: #ef4444; color: white; }
    
    .header {
      text-align: center;
      padding: 30px 20px 20px;
      border-bottom: 2px solid #f59e0b;
    }
    .header h1 { color: #f59e0b; font-size: 28px; margin-bottom: 5px; }
    .header p { color: #64748b; font-size: 13px; }
    
    .content { flex: 1; padding: 20px; overflow-y: auto; }
    
    .section-title {
      color: #94a3b8;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .recent-list { margin-bottom: 25px; }
    .recent-item {
      background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
      padding: 14px 18px;
      border-radius: 10px;
      margin-bottom: 10px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid #475569;
      transition: all 0.2s ease;
    }
    .recent-item:hover {
      border-color: #f59e0b;
      transform: translateX(5px);
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.1);
    }
    .recent-item .path {
      font-size: 13px;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 450px;
    }
    .recent-item .arrow { color: #f59e0b; font-size: 18px; }
    
    .btn-group { display: flex; gap: 12px; margin-top: 20px; }
    .btn {
      flex: 1;
      padding: 16px 20px;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #0f172a;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.3);
    }
    .btn-secondary {
      background: linear-gradient(135deg, #475569 0%, #334155 100%);
      color: white;
      border: 1px solid #64748b;
    }
    .btn-secondary:hover {
      border-color: #94a3b8;
      transform: translateY(-2px);
    }
    
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #64748b;
      background: rgba(0,0,0,0.2);
      border-radius: 10px;
      border: 1px dashed #475569;
    }
    .empty-state .icon { font-size: 40px; margin-bottom: 10px; }
    
    .footer {
      padding: 12px;
      text-align: center;
      font-size: 11px;
      color: #475569;
      background: rgba(0,0,0,0.2);
    }
  </style>
</head>
<body>
  <div class="titlebar">
    <span class="titlebar-title">Mill Entry System - Data Selection</span>
    <button class="titlebar-close" onclick="closeApp()">✕</button>
  </div>
  
  <div class="header">
    <h1>🏭 Mill Entry System</h1>
    <p>Data Management Software - Tally Style</p>
  </div>
  
  <div class="content">
    <div class="section-title">📂 Recent Data Locations</div>
    <div class="recent-list" id="recentList">
      ${config.recentPaths.length > 0 
        ? config.recentPaths.map(p => `
          <div class="recent-item" onclick="openRecent('${p.replace(/\\/g, '\\\\')}')">
            <span class="path">${p}</span>
            <span class="arrow">→</span>
          </div>
        `).join('')
        : `<div class="empty-state">
            <div class="icon">📁</div>
            <p>Koi recent data folder nahi hai</p>
            <p style="font-size: 12px; margin-top: 5px;">Neeche se folder select ya create karein</p>
          </div>`
      }
    </div>
    
    <div class="section-title">📁 Data Folder Select Karein</div>
    <div class="btn-group">
      <button class="btn btn-primary" onclick="selectFolder()">
        📂 Open Existing Folder
      </button>
      <button class="btn btn-secondary" onclick="createNewFolder()">
        ➕ Create New Folder
      </button>
    </div>
  </div>
  
  <div class="footer">
    💾 Data aapke selected folder mein locally save hoga | No internet required
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    
    function selectFolder() {
      ipcRenderer.send('select-folder');
    }
    
    function createNewFolder() {
      ipcRenderer.send('create-folder');
    }
    
    function openRecent(path) {
      ipcRenderer.send('open-recent', path);
    }
    
    function closeApp() {
      ipcRenderer.send('close-app');
    }
  </script>
</body>
</html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
}

// ============ MAIN APPLICATION WINDOW ============
async function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Determine frontend path
  const frontendBuildPath = path.join(__dirname, 'frontend-build', 'index.html');
  const devUrl = 'http://localhost:3000';
  
  if (fs.existsSync(frontendBuildPath)) {
    // Production - load from build
    mainWindow.loadFile(frontendBuildPath);
  } else {
    // Development - try to load from dev server
    mainWindow.loadURL(devUrl);
  }

  // Inject API URL when page loads
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.REACT_APP_BACKEND_URL = 'http://127.0.0.1:${port}';
      if (window.localStorage) {
        window.localStorage.setItem('ELECTRON_API_URL', 'http://127.0.0.1:${port}');
      }
      console.log('API URL set to: http://127.0.0.1:${port}');
    `);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (server) server.close();
    app.quit();
  });
}

// ============ IPC HANDLERS ============
ipcMain.on('select-folder', async () => {
  const result = await dialog.showOpenDialog(splashWindow, {
    title: 'Data Folder Select Karein',
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    await startApplication(result.filePaths[0]);
  }
});

ipcMain.on('create-folder', async () => {
  const result = await dialog.showSaveDialog(splashWindow, {
    title: 'New Data Folder Create Karein',
    defaultPath: 'MillEntryData',
    buttonLabel: 'Create Folder'
  });

  if (!result.canceled && result.filePath) {
    const folderPath = result.filePath;
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    await startApplication(folderPath);
  }
});

ipcMain.on('open-recent', async (event, folderPath) => {
  if (fs.existsSync(folderPath)) {
    await startApplication(folderPath);
  } else {
    dialog.showErrorBox('Error', `Folder not found:\n${folderPath}`);
  }
});

ipcMain.on('close-app', () => {
  app.quit();
});

// ============ APPLICATION STARTUP ============
async function startApplication(folderPath) {
  dataPath = folderPath;
  
  // Update config with recent path
  const config = loadConfig();
  config.recentPaths = [folderPath, ...config.recentPaths.filter(p => p !== folderPath)].slice(0, 5);
  config.lastPath = folderPath;
  saveConfig(config);

  // Initialize database
  db = new JsonDatabase(folderPath);
  
  // Start API server
  serverPort = await createApiServer(db);

  // Close splash and open main window
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }

  await createMainWindow(serverPort);
}

// ============ APP LIFECYCLE ============
app.whenReady().then(() => {
  createSplashWindow();
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
  }
});
