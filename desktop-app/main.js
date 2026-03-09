/**
 * Mill Entry System - Electron Desktop Application
 * Tally-style Data Folder Selection + Local JSON Database
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// ============ CRASH PROTECTION & ERROR LOGGING ============
const errorLogPath = path.join(app.getPath('userData'), 'mill-entry-error.log');

function logError(context, err) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] [${context}] ${err && err.stack ? err.stack : err}\n`;
  try { fs.appendFileSync(errorLogPath, msg); } catch (_) {}
  console.error(msg);
}

process.on('uncaughtException', (err) => {
  logError('UNCAUGHT_EXCEPTION', err);
});

process.on('unhandledRejection', (reason) => {
  logError('UNHANDLED_REJECTION', reason);
});

// Wrapper for async Express route handlers - catches errors and sends 500 instead of crashing
function safeAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logError('ASYNC_ROUTE_ERROR: ' + req.method + ' ' + req.originalUrl, err);
      if (!res.headersSent) {
        res.status(500).json({ detail: 'Internal server error' });
      }
    });
  };
}

// Wrapper for sync Express route handlers
function safeSync(fn) {
  return (req, res, next) => {
    try {
      fn(req, res, next);
    } catch (err) {
      logError('SYNC_ROUTE_ERROR: ' + req.method + ' ' + req.originalUrl, err);
      if (!res.headersSent) {
        res.status(500).json({ detail: 'Internal server error' });
      }
    }
  };
}

// ============ GLOBAL VARIABLES ============
let mainWindow = null;
let splashWindow = null;
let dataPath = null;
let db = null;
let server = null;
const DESKTOP_API_PORT = 9876;
const MAX_BACKUPS = 7;

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
      logError('DATABASE_LOAD_ERROR', e);
      // Try to recover from backup
      const bakFile = this.dbFile + '.bak';
      try {
        if (fs.existsSync(bakFile)) {
          logError('DATABASE_RECOVERY', 'Attempting recovery from backup...');
          const data = JSON.parse(fs.readFileSync(bakFile, 'utf8'));
          logError('DATABASE_RECOVERY', 'Recovery from backup successful!');
          return data;
        }
      } catch (e2) {
        logError('DATABASE_RECOVERY_FAILED', e2);
      }
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
      agent_payments: [],
      milling_entries: []
    };
  }

  save() {
    try {
      const jsonStr = JSON.stringify(this.data, null, 2);
      // Atomic write: write to temp file first, then rename
      const tmpFile = this.dbFile + '.tmp';
      fs.writeFileSync(tmpFile, jsonStr);
      // Keep a last-known-good backup before replacing
      if (fs.existsSync(this.dbFile)) {
        const bakFile = this.dbFile + '.bak';
        try { fs.copyFileSync(this.dbFile, bakFile); } catch (_) {}
      }
      fs.renameSync(tmpFile, this.dbFile);
    } catch (e) {
      logError('DATABASE_SAVE_ERROR', e);
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
    
    // Auto Cash Book for cash_paid
    const cashPaid = parseFloat(newEntry.cash_paid) || 0;
    if (cashPaid > 0) {
      if (!this.data.cash_transactions) this.data.cash_transactions = [];
      this.data.cash_transactions.push({
        id: uuidv4(), date: newEntry.date || new Date().toISOString().split('T')[0],
        account: 'cash', txn_type: 'nikasi', category: 'Cash Paid (Entry)',
        description: `Cash Paid: Truck ${newEntry.truck_no||''} - Mandi ${newEntry.mandi_name||''} - Rs.${cashPaid}`,
        amount: cashPaid, reference: `entry_cash:${newEntry.id.slice(0,8)}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: new Date().toISOString()
      });
    }
    
    // Auto Diesel Account for diesel_paid
    const dieselPaid = parseFloat(newEntry.diesel_paid) || 0;
    if (dieselPaid > 0) {
      if (!this.data.diesel_accounts) this.data.diesel_accounts = [];
      if (!this.data.diesel_pumps) this.data.diesel_pumps = [];
      const defPump = this.data.diesel_pumps.find(p => p.is_default) || this.data.diesel_pumps[0];
      this.data.diesel_accounts.push({
        id: uuidv4(), date: newEntry.date || new Date().toISOString().split('T')[0],
        pump_id: defPump?.id||'default', pump_name: defPump?.name||'Default Pump',
        truck_no: newEntry.truck_no||'', agent_name: newEntry.agent_name||'',
        amount: dieselPaid, txn_type: 'debit',
        description: `Diesel: Truck ${newEntry.truck_no||''} - Mandi ${newEntry.mandi_name||''}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: new Date().toISOString()
      });
    }
    
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
      const updated = this.data.entries[index];
      
      // Update linked cash/diesel entries
      if (this.data.cash_transactions) this.data.cash_transactions = this.data.cash_transactions.filter(t => t.linked_entry_id !== id);
      if (this.data.diesel_accounts) this.data.diesel_accounts = this.data.diesel_accounts.filter(t => t.linked_entry_id !== id);
      
      const cashPaid = parseFloat(updated.cash_paid) || 0;
      if (cashPaid > 0 && this.data.cash_transactions) {
        this.data.cash_transactions.push({ id: uuidv4(), date: updated.date, account: 'cash', txn_type: 'nikasi', category: 'Cash Paid (Entry)', description: `Cash Paid: Truck ${updated.truck_no||''} - Mandi ${updated.mandi_name||''} - Rs.${cashPaid}`, amount: cashPaid, reference: `entry_cash:${id.slice(0,8)}`, kms_year: updated.kms_year||'', season: updated.season||'', created_by: updated.created_by||'system', linked_entry_id: id, created_at: new Date().toISOString() });
      }
      const dieselPaid = parseFloat(updated.diesel_paid) || 0;
      if (dieselPaid > 0 && this.data.diesel_accounts) {
        if (!this.data.diesel_pumps) this.data.diesel_pumps = [];
        const defPump = this.data.diesel_pumps.find(p => p.is_default) || this.data.diesel_pumps[0];
        this.data.diesel_accounts.push({ id: uuidv4(), date: updated.date, pump_id: defPump?.id||'default', pump_name: defPump?.name||'Default Pump', truck_no: updated.truck_no||'', agent_name: updated.agent_name||'', mandi_name: updated.mandi_name||'', amount: dieselPaid, txn_type: 'debit', description: `Diesel: Truck ${updated.truck_no||''} - Mandi ${updated.mandi_name||''}`, kms_year: updated.kms_year||'', season: updated.season||'', created_by: updated.created_by||'system', linked_entry_id: id, created_at: new Date().toISOString() });
      }
      
      this.save();
      return updated;
    }
    return null;
  }

  deleteEntry(id) {
    this.data.entries = this.data.entries.filter(e => e.id !== id);
    if (this.data.cash_transactions) this.data.cash_transactions = this.data.cash_transactions.filter(t => t.linked_entry_id !== id);
    if (this.data.diesel_accounts) this.data.diesel_accounts = this.data.diesel_accounts.filter(t => t.linked_entry_id !== id);
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
    const moisture_cut_qntl = Math.round((mill_w_qntl * moisture_cut_percent / 100) * 100) / 100;
    const moisture_cut = Math.round(moisture_cut_qntl * 100 * 100) / 100;

    const cutting_qntl = Math.round((mill_w_qntl * cutting_percent / 100) * 100) / 100;
    const cutting = Math.round(cutting_qntl * 100 * 100) / 100;

    const p_pkt_cut_qntl = p_pkt_cut / 100;
    const disc_dust_poll_qntl = disc_dust_poll / 100;
    const final_w_qntl = mill_w_qntl - p_pkt_cut_qntl - moisture_cut_qntl - cutting_qntl - disc_dust_poll_qntl;
    const final_w = Math.round(final_w_qntl * 100 * 100) / 100;

    return {
      qntl,
      mill_w,
      p_pkt_cut,
      moisture_cut,
      moisture_cut_percent,
      moisture_cut_qntl,
      cutting,
      cutting_qntl,
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
    const found = this.data.truck_payments.find(p => p.entry_id === entryId);
    if (found) {
      return { rate_per_qntl: 32, paid_amount: 0, status: 'pending', payment_history: [], ...found };
    }
    return {
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
      this.data.truck_payments.push({ entry_id: entryId, rate_per_qntl: 32, paid_amount: 0, status: 'pending', payment_history: [], ...payment });
    }
    this.save();
    return this.getTruckPayment(entryId);
  }

  // Agent Payments
  getAgentPayment(mandiName, kmsYear, season) {
    return this.data.agent_payments.find(p => 
      (p.mandi_name||'').toLowerCase() === (mandiName||'').toLowerCase() && p.kms_year === kmsYear && p.season === season
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
      (p.mandi_name||'').toLowerCase() === (mandiName||'').toLowerCase() && p.kms_year === kmsYear && p.season === season
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
      ...data, husk_percent: huskPct,
      rice_qntl: riceQntl,
      bran_qntl: +(paddy * branPct / 100).toFixed(2), kunda_qntl: +(paddy * kundaPct / 100).toFixed(2),
      broken_qntl: +(paddy * brokenPct / 100).toFixed(2), kanki_qntl: +(paddy * kankiPct / 100).toFixed(2),
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
      id: uuidv4(), date: calculated.date || new Date().toISOString().split('T')[0],
      rice_type: calculated.rice_type || 'parboiled', paddy_input_qntl: calculated.paddy_input_qntl || 0,
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
    this.data.milling_entries[index] = { ...this.data.milling_entries[index], ...calculated, updated_at: new Date().toISOString() };
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
    const avgOutturn = totalPaddy > 0 ? +(totalCmr / totalPaddy * 100).toFixed(2) : 0;
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

// ============ BACKUP SYSTEM ============
function getBackupDir() {
  if (!dataPath) return null;
  const dir = path.join(dataPath, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createBackup(database, label = 'auto') {
  const backupDir = getBackupDir();
  if (!backupDir || !database) return { success: false, error: 'No data path' };
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `backup_${label}_${dateStr}.json`;
  try {
    const data = fs.readFileSync(database.dbFile, 'utf8');
    fs.writeFileSync(path.join(backupDir, filename), data);
    cleanupOldBackups();
    return { success: true, filename, size: data.length, created_at: now.toISOString() };
  } catch (e) { return { success: false, error: e.message }; }
}

function getBackupsList() {
  const backupDir = getBackupDir();
  if (!backupDir) return [];
  try {
    return fs.readdirSync(backupDir).filter(f => f.startsWith('backup_') && f.endsWith('.json')).map(f => {
      const stat = fs.statSync(path.join(backupDir, f));
      return { filename: f, size: stat.size, created_at: stat.mtime.toISOString(), size_readable: (stat.size / 1024).toFixed(1) + ' KB' };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (e) { return []; }
}

function restoreBackup(database, filename) {
  const backupDir = getBackupDir();
  const backupPath = path.join(backupDir, filename);
  if (!fs.existsSync(backupPath)) return { success: false, error: 'Backup not found' };
  try {
    createBackup(database, 'pre-restore');
    const data = fs.readFileSync(backupPath, 'utf8');
    JSON.parse(data);
    fs.writeFileSync(database.dbFile, data);
    database.data = database.load();
    return { success: true, message: 'Data restore ho gaya! Page refresh karein.' };
  } catch (e) { return { success: false, error: e.message }; }
}

function cleanupOldBackups() {
  const backups = getBackupsList();
  if (backups.length > MAX_BACKUPS) {
    const backupDir = getBackupDir();
    backups.slice(MAX_BACKUPS).forEach(b => { try { fs.unlinkSync(path.join(backupDir, b.filename)); } catch(e){} });
  }
}

function hasTodayBackup() {
  const today = new Date().toISOString().substring(0, 10);
  return getBackupsList().some(b => b.created_at.substring(0, 10) === today);
}

// ============ EXPRESS API SERVER ============
function createApiServer(database) {
  const apiApp = express();
  apiApp.use(cors());
  apiApp.use(express.json({ limit: '5mb' }));

  // ===== LOAD ALL MODULAR ROUTE MODULES =====
  try {
    const routeModules = [
      require('./routes/auth')(database),
      require('./routes/entries')(database),
      require('./routes/dashboard')(database),
      require('./routes/payments')(database),
      require('./routes/cashbook')(database),
      require('./routes/dc_payments')(database),
      require('./routes/gunny_bags')(database),
      require('./routes/milling')(database),
      require('./routes/private_trading')(database),
      require('./routes/reports')(database),
      require('./routes/diesel')(database),
      require('./routes/exports')(database),
      require('./routes/backups')(database, { getBackupsList, createBackup, restoreBackup, getBackupDir, MAX_BACKUPS }),
      require('./routes/mill_parts')(database),
      require('./routes/staff')(database),
      require('./routes/daily_report')(database),
      require('./routes/reports_pnl')(database),
      require('./routes/local_party')(database),
      require('./routes/import_excel')(database),
    ];
    routeModules.forEach(r => apiApp.use(r));
    console.log('[Routes] All modular routes loaded successfully');
  } catch (e) {
    console.error('[Routes] Error loading modules:', e.message, e.stack);
  }

  // ===== EXPRESS ERROR MIDDLEWARE (catches sync errors from routes) =====
  apiApp.use((err, req, res, next) => {
    logError('EXPRESS_ERROR: ' + req.method + ' ' + req.originalUrl, err);
    if (!res.headersSent) {
      res.status(500).json({ detail: 'Internal server error' });
    }
  });

  // ===== SERVE FRONTEND STATIC FILES (MUST be after all API routes) =====
  const frontendDir = path.join(__dirname, 'frontend-build');
  if (fs.existsSync(frontendDir)) {
    apiApp.use(express.static(frontendDir));
    apiApp.get('*', safeSync((req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(frontendDir, 'index.html'));
      } else {
        res.status(404).json({ detail: 'API endpoint not found' });
      }
    }));
    console.log('Frontend served from: ' + frontendDir);
  }

  // Start server on fixed port
  return new Promise((resolve, reject) => {
    server = apiApp.listen(DESKTOP_API_PORT, '127.0.0.1', () => {
      console.log(`API Server started on port ${DESKTOP_API_PORT}`);
      resolve(DESKTOP_API_PORT);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${DESKTOP_API_PORT} busy, trying random port...`);
        server = apiApp.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          console.log(`API Server started on fallback port ${port}`);
          resolve(port);
        });
      } else {
        reject(err);
      }
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
      max-width: 400px;
      flex: 1;
    }
    .recent-item .arrow { color: #f59e0b; font-size: 18px; }
    .recent-item .delete-btn {
      color: #ef4444;
      font-size: 16px;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 4px;
      opacity: 0;
      transition: all 0.2s ease;
    }
    .recent-item:hover .delete-btn { opacity: 1; }
    .recent-item .delete-btn:hover {
      background: rgba(239,68,68,0.2);
      color: #f87171;
    }
    
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
    <div class="section-title">📁 Data Folder Select Karein</div>
    <div style="text-align:center; padding: 30px 20px; color: #94a3b8; background: rgba(0,0,0,0.2); border-radius: 10px; border: 1px dashed #475569; margin-bottom: 20px;">
      <div style="font-size: 40px; margin-bottom: 10px;">📂</div>
      <p>Har bar apna data folder manually select karein</p>
      <p style="font-size: 12px; margin-top: 5px; color: #64748b;">Neeche se folder select ya create karein</p>
    </div>
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
    
    function removeRecent(evt, path) {
      ipcRenderer.send('remove-recent', path);
      evt.target.closest('.recent-item').remove();
      if (document.querySelectorAll('.recent-item').length === 0) {
        document.querySelector('.recent-section').innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">Koi recent location nahi hai</p>';
      }
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

  // Load frontend from Express server
  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Handle window.open - convert ALL API URLs to downloads
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Any API URL with export/pdf/excel should download
    if (url.includes('/api/') && (url.includes('export') || url.includes('pdf') || url.includes('excel') || url.includes('/summary/'))) {
      mainWindow.webContents.downloadURL(url);
      return { action: 'deny' };
    }
    // Print URLs - open in system browser
    if (url.includes('/print/') || url.includes('print-')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    // Allow other windows
    return { action: 'allow' };
  });

  // Handle file downloads - save and auto-open
  mainWindow.webContents.session.on('will-download', (event, item) => {
    const fn = item.getFilename();
    console.log('Downloading:', fn, 'Size:', item.getTotalBytes());
    item.once('done', (event, state) => {
      if (state === 'completed') {
        const savePath = item.getSavePath();
        console.log('Download complete:', savePath);
        // Auto-open the file after download
        if (savePath) {
          shell.openPath(savePath).then((err) => {
            if (err) console.log('Failed to open file:', err);
          });
        }
      } else {
        console.log('Download failed:', state);
      }
    });
  });

  // Set application menu with Help > About
  const menuTemplate = [
    { label: 'File', submenu: [
      { label: 'Refresh', accelerator: 'F5', click: () => mainWindow.reload() },
      { type: 'separator' },
      { label: 'Exit', accelerator: 'Alt+F4', click: () => app.quit() }
    ]},
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ]},
    { label: 'View', submenu: [
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      { type: 'separator' }, { role: 'togglefullscreen' }
    ]},
    { label: 'Help', submenu: [
      { label: 'Check for Updates', click: () => {
        autoUpdater.checkForUpdates().then(result => {
          if (!result || !result.updateInfo) {
            dialog.showMessageBox(mainWindow, { type: 'info', title: 'Update Check', message: 'App already latest version hai! (v' + app.getVersion() + ')' });
          }
        }).catch(() => {
          dialog.showMessageBox(mainWindow, { type: 'info', title: 'Update Check', message: 'Abhi koi update available nahi hai.\n\nCurrent version: v' + app.getVersion() });
        });
      }},
      { type: 'separator' },
      { label: 'About', click: () => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'About - Mill Entry System',
          message: 'Mill Entry System',
          detail: 'Version: v' + app.getVersion() + '\n\nDesigned By: 9x.Design\nContact: +91 72059 30002',
          buttons: ['OK']
        });
      }}
    ]}
  ];
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Inject API URL when page loads
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.ELECTRON_API_URL = 'http://127.0.0.1:${port}';
      window.REACT_APP_BACKEND_URL = 'http://127.0.0.1:${port}';
      if (window.localStorage) {
        window.localStorage.setItem('ELECTRON_API_URL', 'http://127.0.0.1:${port}');
      }
      console.log('API URL set to: http://127.0.0.1:${port}');
    `).catch(err => {
      console.log('[SafeInject] Failed to inject API URL:', err.message);
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    // Start auto-update check after window is shown
    setupAutoUpdater();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (server) server.close();
    app.quit();
  });
}

// ============ AUTO UPDATER ============
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
  });

  // Safe helper to execute JS in renderer - prevents UNHANDLED_REJECTION crashes
  function safeExecuteJS(js) {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(js).catch((err) => {
          logError('SAFE_EXECUTE_JS', err);
        });
      }
    } catch (err) {
      logError('SAFE_EXECUTE_JS_OUTER', err);
    }
  }

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `New version ${info.version} available!`,
      detail: `Current: v${app.getVersion()}\nNew: v${info.version}\n\nKya aap download karna chahte hain?`,
      buttons: ['Download Now', 'Later'],
      defaultId: 0
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
        safeExecuteJS(`
          if (!document.getElementById('update-banner')) {
            const b = document.createElement('div');
            b.id = 'update-banner';
            b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#000;text-align:center;padding:8px;font-size:14px;font-weight:bold;';
            b.textContent = 'Downloading update... Please wait';
            document.body.prepend(b);
          }
        `);
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date');
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log('Download progress: ' + pct + '%');
    safeExecuteJS('var b = document.getElementById("update-banner"); if (b) b.textContent = "Downloading update... ' + pct + '%";');
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('Update downloaded');
    safeExecuteJS('var b = document.getElementById("update-banner"); if (b) { b.style.background = "#22c55e"; b.textContent = "Update download complete!"; }');
    if (!mainWindow || mainWindow.isDestroyed()) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update download ho gaya!',
      detail: 'App restart hoga update install karne ke liye.',
      buttons: ['Restart Now', 'Restart Later'],
      defaultId: 0
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      } else {
        safeExecuteJS(`
          const b = document.getElementById('update-banner');
          if (b) { b.style.background = '#22c55e'; b.textContent = 'Update ready! App close karne par install ho jayega.'; }
        `);
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.log('Auto-updater error:', err.message);
    // Don't show error to user on automatic checks - only on manual check
  });

  // Check for updates after 5 seconds (silent - no error dialogs)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);
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

ipcMain.on('remove-recent', (event, folderPath) => {
  const config = loadConfig();
  config.recentPaths = config.recentPaths.filter(p => p !== folderPath);
  if (config.lastPath === folderPath) config.lastPath = config.recentPaths[0] || null;
  saveConfig(config);
});


ipcMain.on('close-app', () => {
  app.quit();
});

// ============ APPLICATION STARTUP ============
async function startApplication(folderPath) {
  dataPath = folderPath;
  
  // Update config - only keep recentPaths for reference, do NOT save lastPath for auto-load
  const config = loadConfig();
  config.recentPaths = [folderPath, ...config.recentPaths.filter(p => p !== folderPath)].slice(0, 5);
  config.lastPath = null;  // Never auto-load last folder
  saveConfig(config);

  // Initialize database
  db = new JsonDatabase(folderPath);
  
  // Auto-backup on startup
  dataPath = folderPath;
  if (!hasTodayBackup() && fs.existsSync(db.dbFile)) {
    createBackup(db, 'startup');
  }
  // Daily backup check
  setInterval(() => { if (!hasTodayBackup()) createBackup(db, 'daily'); }, 60 * 60 * 1000);

  // Start API server
  const port = await createApiServer(db);

  // Monitor server health - restart if it dies
  const http = require('http');
  setInterval(() => {
    if (!server || !server.listening) {
      logError('SERVER_WATCHDOG', 'Server not listening! Attempting restart...');
      createApiServer(db).then((newPort) => {
        logError('SERVER_WATCHDOG', 'Server restarted on port ' + newPort);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(`http://127.0.0.1:${newPort}`);
        }
      }).catch((restartErr) => {
        logError('SERVER_WATCHDOG_RESTART_FAILED', restartErr);
      });
      return;
    }
    // Quick health ping
    http.get(`http://127.0.0.1:${server.address().port}/api/health`, (res) => {
      // Server is alive
    }).on('error', (err) => {
      logError('SERVER_WATCHDOG_PING_FAIL', err.message);
    });
  }, 30000); // Check every 30 seconds

  // Close splash and open main window
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }

  await createMainWindow(port);
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
