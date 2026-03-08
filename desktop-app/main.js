/**
 * Mill Entry System - Electron Desktop Application
 * Tally-style Data Folder Selection + Local JSON Database
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

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
        description: `Cash Paid: Truck ${newEntry.truck_no||''} - Agent ${newEntry.agent_name||''} - Rs.${cashPaid}`,
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
        description: `Diesel: Truck ${newEntry.truck_no||''} - Agent ${newEntry.agent_name||''}`,
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
        this.data.cash_transactions.push({ id: uuidv4(), date: updated.date, account: 'cash', txn_type: 'nikasi', category: 'Cash Paid (Entry)', description: `Cash Paid: Truck ${updated.truck_no||''} - Agent ${updated.agent_name||''} - Rs.${cashPaid}`, amount: cashPaid, reference: `entry_cash:${id.slice(0,8)}`, kms_year: updated.kms_year||'', season: updated.season||'', created_by: updated.created_by||'system', linked_entry_id: id, created_at: new Date().toISOString() });
      }
      const dieselPaid = parseFloat(updated.diesel_paid) || 0;
      if (dieselPaid > 0 && this.data.diesel_accounts) {
        if (!this.data.diesel_pumps) this.data.diesel_pumps = [];
        const defPump = this.data.diesel_pumps.find(p => p.is_default) || this.data.diesel_pumps[0];
        this.data.diesel_accounts.push({ id: uuidv4(), date: updated.date, pump_id: defPump?.id||'default', pump_name: defPump?.name||'Default Pump', truck_no: updated.truck_no||'', agent_name: updated.agent_name||'', amount: dieselPaid, txn_type: 'debit', description: `Diesel: Truck ${updated.truck_no||''} - Agent ${updated.agent_name||''}`, kms_year: updated.kms_year||'', season: updated.season||'', created_by: updated.created_by||'system', linked_entry_id: id, created_at: new Date().toISOString() });
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

// ============ EXCEL/PDF HELPERS ============
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
    // Highlight status cells
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

function addExcelTitle(sheet, title, colCount) {
  const branding = db ? db.getBranding() : { company_name: 'Mill Entry', tagline: '' };
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

function addPdfHeader(doc, title) {
  const branding = db ? db.getBranding() : { company_name: 'Mill Entry', tagline: '' };
  doc.fontSize(18).font('Helvetica-Bold').text(branding.company_name, { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(branding.tagline, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(8).text(`Date: ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
  doc.moveDown(0.5); doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke('#1E3A5F'); doc.moveDown(0.5);
}

function addPdfTable(doc, headers, rows, colWidths) {
  const startX = 40; const pageWidth = doc.page.width - 80;
  const totalW = colWidths.reduce((s, w) => s + w, 0); const scale = pageWidth / totalW;
  const widths = colWidths.map(w => w * scale);
  const rowH = 15;
  let x = startX; doc.fontSize(7).font('Helvetica-Bold');
  const headerY = doc.y; doc.rect(startX, headerY - 2, pageWidth, 18).fill('#1E3A5F');
  headers.forEach((h, i) => { doc.fillColor('#FFFFFF').text(h, x + 2, headerY + 1, { width: widths[i] - 4, align: 'center', lineBreak: false, ellipsis: true }); x += widths[i]; });
  doc.y = headerY + 18; doc.font('Helvetica').fontSize(7).fillColor('#333333');
  rows.forEach((row, ri) => {
    if (doc.y > doc.page.height - 60) { doc.addPage(); doc.y = 40; }
    x = startX; const rowY = doc.y;
    if (ri % 2 === 0) doc.rect(startX, rowY - 1, pageWidth, rowH).fill('#F0F4F8').fillColor('#333333');
    else doc.fillColor('#333333');
    row.forEach((cell, i) => { doc.text(String(cell ?? ''), x + 2, rowY + 1, { width: widths[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false, ellipsis: true }); x += widths[i]; });
    doc.y = rowY + rowH;
  });
}

// ============ EXPRESS API SERVER ============
function createApiServer(database) {
  const apiApp = express();
  apiApp.use(cors());
  apiApp.use(express.json({ limit: '5mb' }));

  // ===== PRINT PAGE (Server-side approach for Electron compatibility) =====
  const printPages = {};
  apiApp.post('/api/print', safeSync((req, res) => {
    const id = require('uuid').v4();
    printPages[id] = req.body.html;
    setTimeout(() => delete printPages[id], 300000);
    res.json({ id, url: `/api/print/${id}` });
  }));
  apiApp.get('/api/print/:id', safeSync((req, res) => {
    const html = printPages[req.params.id];
    if (!html) return res.status(404).send('<h1>Page expired. Please try again.</h1>');
    delete printPages[req.params.id];
    res.type('html').send(html);
  }));

  // ===== AUTH =====
  apiApp.post('/api/auth/login', safeSync((req, res) => {
    const { username, password } = req.body;
    const user = database.getUser(username);
    if (user && user.password === password) {
      res.json({ success: true, username: user.username, role: user.role, message: 'Login successful' });
    } else {
      res.status(401).json({ detail: 'Invalid username or password' });
    }
  }));

  apiApp.post('/api/auth/change-password', safeSync((req, res) => {
    const { username, current_password, new_password } = req.body;
    const user = database.getUser(username);
    if (!user || user.password !== current_password) {
      return res.status(401).json({ detail: 'Current password galat hai' });
    }
    database.updateUserPassword(username, new_password);
    res.json({ success: true, message: 'Password change ho gaya' });
  }));

  // ===== FY SETTINGS =====
  apiApp.get('/api/fy-settings', safeSync((req, res) => {
    if (!database.data.fy_settings) {
      const now = new Date();
      const y = now.getFullYear();
      const defaultFy = now.getMonth() < 9 ? `${y-1}-${y}` : `${y}-${y+1}`;
      database.data.fy_settings = { active_fy: defaultFy, season: '' };
    }
    res.json(database.data.fy_settings);
  }));

  apiApp.put('/api/fy-settings', safeSync((req, res) => {
    const active_fy = req.body.active_fy || '';
    const season = req.body.season || '';
    if (!active_fy) return res.status(400).json({ detail: 'active_fy is required' });
    database.data.fy_settings = { active_fy, season, updated_at: new Date().toISOString() };
    database.save();
    res.json(database.data.fy_settings);
  }));

  // ===== BRANDING =====
  apiApp.get('/api/branding', safeSync((req, res) => {
    res.json(database.getBranding());
  }));

  apiApp.put('/api/branding', safeSync((req, res) => {
    const branding = database.updateBranding(req.body);
    res.json({ success: true, message: 'Branding update ho gaya', branding });
  }));

  // ===== ENTRIES =====
  apiApp.get('/api/entries', safeSync((req, res) => {
    res.json(database.getEntries(req.query));
  }));

  apiApp.get('/api/entries/:id', safeSync((req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.id);
    if (entry) res.json(entry);
    else res.status(404).json({ detail: 'Entry not found' });
  }));

  apiApp.post('/api/entries', safeSync((req, res) => {
    const entry = database.addEntry({ ...req.body, created_by: req.query.username || 'admin' });
    res.json(entry);
  }));

  apiApp.put('/api/entries/:id', safeSync((req, res) => {
    const entry = database.updateEntry(req.params.id, req.body);
    if (entry) res.json(entry);
    else res.status(404).json({ detail: 'Entry not found' });
  }));

  apiApp.delete('/api/entries/:id', safeSync((req, res) => {
    database.deleteEntry(req.params.id);
    res.json({ success: true });
  }));

  apiApp.post('/api/entries/bulk-delete', safeSync((req, res) => {
    database.bulkDeleteEntries(req.body.entry_ids);
    res.json({ success: true, deleted: req.body.entry_ids.length });
  }));

  // ===== TOTALS =====
  apiApp.get('/api/totals', safeSync((req, res) => {
    res.json(database.getTotals(req.query));
  }));

  // ===== SUGGESTIONS =====
  apiApp.get('/api/suggestions/trucks', safeSync((req, res) => {
    let suggestions = database.getSuggestions('truck_no');
    const q = req.query.q || '';
    if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
    res.json({ suggestions });
  }));

  apiApp.get('/api/suggestions/agents', safeSync((req, res) => {
    let suggestions = database.getSuggestions('agent_name');
    const q = req.query.q || '';
    if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
    res.json({ suggestions });
  }));

  apiApp.get('/api/suggestions/mandis', safeSync((req, res) => {
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
  }));

  apiApp.get('/api/suggestions/kms_years', safeSync((req, res) => {
    res.json({ suggestions: database.getSuggestions('kms_year') });
  }));

  // ===== MANDI TARGETS =====
  apiApp.get('/api/mandi-targets', safeSync((req, res) => {
    res.json(database.getMandiTargets(req.query));
  }));

  apiApp.post('/api/mandi-targets', safeSync((req, res) => {
    const target = database.addMandiTarget({ ...req.body, created_by: req.query.username || 'admin' });
    res.json(target);
  }));

  apiApp.put('/api/mandi-targets/:id', safeSync((req, res) => {
    const target = database.updateMandiTarget(req.params.id, req.body);
    if (target) res.json(target);
    else res.status(404).json({ detail: 'Target not found' });
  }));

  apiApp.delete('/api/mandi-targets/:id', safeSync((req, res) => {
    database.deleteMandiTarget(req.params.id);
    res.json({ success: true });
  }));

  apiApp.get('/api/mandi-targets/summary', safeSync((req, res) => {
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
        target_amount: target.target_qntl * (target.base_rate ?? 10),
        cutting_amount: cutting_qntl * (target.cutting_rate ?? 5),
        total_agent_amount: (target.target_qntl * (target.base_rate ?? 10)) + (cutting_qntl * (target.cutting_rate ?? 5))
      };
    });
    
    res.json(summary);
  }));

  // ===== DASHBOARD =====
  apiApp.get('/api/dashboard/agent-totals', safeSync((req, res) => {
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
  }));

  apiApp.get('/api/dashboard/date-range-totals', safeSync((req, res) => {
    const entries = database.getEntries(req.query);
    const totals = entries.reduce((acc, e) => ({
      total_kg: acc.total_kg + (e.kg || 0),
      total_qntl: acc.total_qntl + (e.qntl || 0),
      total_bag: acc.total_bag + (e.bag || 0),
      total_final_w: acc.total_final_w + (e.final_w || 0) / 100,
      total_entries: acc.total_entries + 1
    }), { total_kg: 0, total_qntl: 0, total_bag: 0, total_final_w: 0, total_entries: 0 });
    
    res.json({
      ...totals,
      total_kg: Math.round(totals.total_kg * 100) / 100,
      total_qntl: Math.round(totals.total_qntl * 100) / 100,
      total_final_w: Math.round(totals.total_final_w * 100) / 100,
      start_date: req.query.start_date || null,
      end_date: req.query.end_date || null
    });
  }));

  apiApp.get('/api/dashboard/monthly-trend', safeSync((req, res) => {
    const entries = database.getEntries(req.query);
    const monthMap = {};
    
    entries.forEach(e => {
      const month = (e.date || '').substring(0, 7);
      if (!month) return;
      if (!monthMap[month]) {
        monthMap[month] = { month, total_qntl: 0, total_final_w: 0, total_entries: 0, total_bag: 0 };
      }
      monthMap[month].total_qntl += (e.qntl || 0);
      monthMap[month].total_final_w += (e.final_w || 0) / 100;
      monthMap[month].total_entries += 1;
      monthMap[month].total_bag += (e.bag || 0);
    });
    
    const monthly_data = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        total_qntl: Math.round(m.total_qntl * 100) / 100,
        total_final_w: Math.round(m.total_final_w * 100) / 100
      }));
    
    res.json({ monthly_data });
  }));

  // ===== TRUCK PAYMENTS =====
  apiApp.get('/api/truck-payments', safeSync((req, res) => {
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
  }));

  apiApp.put('/api/truck-payments/:entryId/rate', safeSync((req, res) => {
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
    
    const payment = database.getTruckPayment(req.params.entryId);
    res.json({ success: true, payment, updated_count: updatedCount, truck_no: entry?.truck_no, mandi_name: entry?.mandi_name });
  }));

  apiApp.post('/api/truck-payments/:entryId/pay', safeSync((req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.entryId);
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
    
    // Auto Cash Book Nikasi
    if (req.body.amount > 0 && !database.data.cash_transactions) database.data.cash_transactions = [];
    if (req.body.amount > 0) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: 'Truck Payment', description: `Truck Payment: ${entry?.truck_no || ''} - Rs.${req.body.amount}`,
        amount: Math.round(req.body.amount * 100) / 100, reference: `truck_pay:${req.params.entryId.substring(0,8)}`,
        kms_year: entry?.kms_year || '', season: entry?.season || '',
        created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
        created_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Payment recorded' });
  }));

  apiApp.post('/api/truck-payments/:entryId/mark-paid', safeSync((req, res) => {
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
    
    // Auto Cash Book Nikasi
    if (net_amount > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: 'Truck Payment', description: `Truck Payment: ${entry.truck_no || ''} (Full - Mark Paid)`,
        amount: Math.round(net_amount * 100) / 100, reference: `truck_markpaid:${req.params.entryId.substring(0,8)}`,
        kms_year: entry.kms_year || '', season: entry.season || '',
        created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
        created_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Payment cleared' });
  }));

  apiApp.post('/api/truck-payments/:entryId/undo-paid', safeSync((req, res) => {
    database.updateTruckPayment(req.params.entryId, {
      paid_amount: 0,
      status: 'pending'
    });
    // Delete linked cash book entries
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== `truck:${req.params.entryId}`);
    }
    database.save();
    res.json({ success: true, message: 'Payment undo ho gaya' });
  }));

  // ===== AGENT PAYMENTS =====
  apiApp.get('/api/agent-payments', safeSync((req, res) => {
    const targets = database.getMandiTargets(req.query);
    const entries = database.getEntries(req.query);
    
    const payments = targets.map(target => {
      const payment = database.getAgentPayment(target.mandi_name, target.kms_year, target.season);
      const mandiEntries = entries.filter(e => e.mandi_name === target.mandi_name);
      const achieved_qntl = mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0);
      const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
      const target_amount = target.target_qntl * (target.base_rate ?? 10);
      const cutting_amount = cutting_qntl * (target.cutting_rate ?? 5);
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
        base_rate: target.base_rate ?? 10,
        cutting_rate: target.cutting_rate ?? 5,
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
  }));

  apiApp.post('/api/agent-payments/:mandiName/pay', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    const current = database.getAgentPayment(mandiName, kms_year, season);
    const newPaidAmount = current.paid_amount + req.body.amount;
    const history = current.payment_history || [];
    history.push({
      amount: req.body.amount,
      date: new Date().toISOString(),
      note: req.body.note || '',
      by: req.query.username || 'admin'
    });
    
    database.updateAgentPayment(mandiName, kms_year, season, {
      paid_amount: newPaidAmount,
      payment_history: history
    });
    
    // Auto Cash Book Nikasi
    if (req.body.amount > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: 'Agent Payment', description: `Agent Payment: ${mandiName} - Rs.${req.body.amount}`,
        amount: Math.round(req.body.amount * 100) / 100, reference: `agent_pay:${mandiName.substring(0,10)}`,
        kms_year: kms_year || '', season: season || '',
        created_by: req.query.username || 'system', linked_payment_id: `agent:${mandiName}:${kms_year}:${season}`,
        created_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Payment recorded' });
  }));

  apiApp.post('/api/agent-payments/:mandiName/mark-paid', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    const target = database.getMandiTargets({ kms_year, season }).find(t => t.mandi_name === mandiName);
    
    if (!target) return res.status(404).json({ detail: 'Mandi target not found' });
    
    const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
    const total_amount = (target.target_qntl * (target.base_rate ?? 10)) + (cutting_qntl * (target.cutting_rate ?? 5));
    
    database.updateAgentPayment(mandiName, kms_year, season, {
      paid_amount: total_amount,
      status: 'paid'
    });
    
    // Auto Cash Book Nikasi
    if (total_amount > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: 'Agent Payment', description: `Agent Payment: ${mandiName} (Full - Mark Paid)`,
        amount: Math.round(total_amount * 100) / 100, reference: `agent_markpaid:${mandiName.substring(0,10)}`,
        kms_year: kms_year || '', season: season || '',
        created_by: req.query.username || 'system', linked_payment_id: `agent:${mandiName}:${kms_year}:${season}`,
        created_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Agent/Mandi payment cleared' });
  }));

  apiApp.post('/api/agent-payments/:mandiName/undo-paid', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    database.updateAgentPayment(mandiName, kms_year, season, {
      paid_amount: 0,
      status: 'pending'
    });
    // Delete linked cash book entries
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== `agent:${mandiName}:${kms_year}:${season}`);
    }
    database.save();
    res.json({ success: true, message: 'Payment undo ho gaya' });
  }));

  // ===== PAYMENT HISTORY =====
  apiApp.get('/api/truck-payments/:entryId/history', safeSync((req, res) => {
    const payment = database.getTruckPayment(req.params.entryId);
    res.json({ history: payment.payment_history || [], total_paid: payment.paid_amount || 0 });
  }));

  apiApp.get('/api/agent-payments/:mandiName/history', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const payment = database.getAgentPayment(decodeURIComponent(req.params.mandiName), kms_year, season);
    res.json({ history: payment.payment_history || [], total_paid: payment.paid_amount || 0 });
  }));

  // ===== AUTH VERIFY =====
  apiApp.get('/api/auth/verify', safeSync((req, res) => {
    const { username, role } = req.query;
    const user = database.getUser(username);
    if (user && user.role === role) {
      res.json({ valid: true, username, role });
    } else {
      res.json({ valid: false });
    }
  }));

  // ===== MILLING ENTRIES =====
  apiApp.get('/api/milling-entries', safeSync((req, res) => {
    res.json(database.getMillingEntries(req.query));
  }));
  apiApp.get('/api/milling-summary', safeSync((req, res) => {
    res.json(database.getMillingSummary(req.query));
  }));
  apiApp.post('/api/milling-entries', safeSync((req, res) => {
    res.json(database.createMillingEntry({ ...req.body, created_by: req.query.username || '' }));
  }));
  apiApp.get('/api/milling-entries/:id', safeSync((req, res) => {
    const entries = database.getMillingEntries({});
    const entry = entries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ detail: 'Milling entry not found' });
    res.json(entry);
  }));
  apiApp.put('/api/milling-entries/:id', safeSync((req, res) => {
    const updated = database.updateMillingEntry(req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: 'Milling entry not found' });
    res.json(updated);
  }));
  apiApp.delete('/api/milling-entries/:id', safeSync((req, res) => {
    if (!database.deleteMillingEntry(req.params.id)) return res.status(404).json({ detail: 'Milling entry not found' });
    res.json({ message: 'Milling entry deleted', id: req.params.id });
  }));

  apiApp.get('/api/paddy-stock', safeSync((req, res) => {
    const filters = req.query;
    let entries = [...database.data.entries];
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);
    const totalIn = +(entries.reduce((s, e) => s + (e.mill_w || 0), 0) / 100).toFixed(2);
    const millingEntries = database.getMillingEntries(filters);
    const totalUsed = +millingEntries.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0).toFixed(2);
    res.json({ total_paddy_in_qntl: totalIn, total_paddy_used_qntl: totalUsed, available_paddy_qntl: +(totalIn - totalUsed).toFixed(2) });
  }));

  apiApp.get('/api/byproduct-stock', safeSync((req, res) => {
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
  }));

  apiApp.post('/api/byproduct-sales', safeSync((req, res) => {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    const sale = { id: uuidv4(), ...req.body, total_amount: +((req.body.quantity_qntl || 0) * (req.body.rate_per_qntl || 0)).toFixed(2), created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    database.data.byproduct_sales.push(sale);
    database.save();
    res.json(sale);
  }));

  apiApp.get('/api/byproduct-sales', safeSync((req, res) => {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    let sales = [...database.data.byproduct_sales];
    if (req.query.product) sales = sales.filter(s => s.product === req.query.product);
    if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
    if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
    res.json(sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }));

  apiApp.delete('/api/byproduct-sales/:id', safeSync((req, res) => {
    if (!database.data.byproduct_sales) return res.status(404).json({ detail: 'Sale not found' });
    const len = database.data.byproduct_sales.length;
    database.data.byproduct_sales = database.data.byproduct_sales.filter(s => s.id !== req.params.id);
    if (database.data.byproduct_sales.length < len) { database.save(); return res.json({ message: 'Sale deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Sale not found' });
  }));

  // ===== FRK PURCHASES =====
  apiApp.post('/api/frk-purchases', safeSync((req, res) => {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    const d = req.body;
    const p = { id: uuidv4(), date: d.date, party_name: d.party_name || '', quantity_qntl: d.quantity_qntl || 0, rate_per_qntl: d.rate_per_qntl || 0, total_amount: +((d.quantity_qntl || 0) * (d.rate_per_qntl || 0)).toFixed(2), note: d.note || '', kms_year: d.kms_year || '', season: d.season || '', created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    database.data.frk_purchases.push(p); database.save(); res.json(p);
  }));
  apiApp.get('/api/frk-purchases', safeSync((req, res) => {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    let p = [...database.data.frk_purchases];
    if (req.query.kms_year) p = p.filter(x => x.kms_year === req.query.kms_year);
    if (req.query.season) p = p.filter(x => x.season === req.query.season);
    res.json(p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }));
  apiApp.delete('/api/frk-purchases/:id', safeSync((req, res) => {
    if (!database.data.frk_purchases) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.frk_purchases.length;
    database.data.frk_purchases = database.data.frk_purchases.filter(x => x.id !== req.params.id);
    if (database.data.frk_purchases.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));
  apiApp.get('/api/frk-stock', safeSync((req, res) => {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    let purchases = [...database.data.frk_purchases];
    if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
    if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
    const totalPurchased = +purchases.reduce((s, p) => s + (p.quantity_qntl || 0), 0).toFixed(2);
    const totalCost = +purchases.reduce((s, p) => s + (p.total_amount || 0), 0).toFixed(2);
    const millingEntries = database.getMillingEntries(req.query);
    const totalUsed = +millingEntries.reduce((s, e) => s + (e.frk_used_qntl || 0), 0).toFixed(2);
    res.json({ total_purchased_qntl: totalPurchased, total_used_qntl: totalUsed, available_qntl: +(totalPurchased - totalUsed).toFixed(2), total_cost: totalCost });
  }));

  // ===== PADDY CUSTODY REGISTER =====
  apiApp.get('/api/paddy-custody-register', safeSync((req, res) => {
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
  }));

  // ===== BACKUP ENDPOINTS =====
  apiApp.get('/api/backups', safeSync((req, res) => {
    const backups = getBackupsList();
    const today = new Date().toISOString().substring(0, 10);
    res.json({ backups, has_today_backup: backups.some(b => b.created_at.substring(0, 10) === today), max_backups: MAX_BACKUPS });
  }));
  apiApp.post('/api/backups', safeSync((req, res) => {
    const result = createBackup(database, 'manual');
    if (result.success) return res.json({ success: true, message: 'Backup ban gaya!', backup: result });
    res.status(500).json({ detail: result.error });
  }));
  apiApp.post('/api/backups/restore', safeSync((req, res) => {
    const result = restoreBackup(database, req.body.filename);
    if (result.success) return res.json(result);
    res.status(400).json({ detail: result.error });
  }));
  apiApp.delete('/api/backups/:filename', safeSync((req, res) => {
    const dir = getBackupDir();
    const fp = path.join(dir, req.params.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ detail: 'Not found' });
    try { fs.unlinkSync(fp); res.json({ success: true }); } catch(e) { res.status(500).json({ detail: e.message }); }
  }));
  apiApp.get('/api/backups/status', safeSync((req, res) => {
    const backups = getBackupsList();
    const today = new Date().toISOString().substring(0, 10);
    res.json({ has_today_backup: backups.some(b => b.created_at.substring(0, 10) === today), last_backup: backups[0] || null, total_backups: backups.length });
  }));

  // ===== EXPORT ENDPOINTS (Excel & PDF) =====
  apiApp.get('/api/export/excel', safeAsync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Mill Entries');
      ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Truck No', key: 'truck_no', width: 14 },
        { header: 'RST No', key: 'rst_no', width: 10 }, { header: 'TP No', key: 'tp_no', width: 10 },
        { header: 'Agent', key: 'agent_name', width: 14 }, { header: 'Mandi', key: 'mandi_name', width: 14 },
        { header: 'QNTL', key: 'qntl', width: 10 }, { header: 'BAG', key: 'bag', width: 8 },
        { header: 'G.Dep', key: 'g_deposite', width: 8 }, { header: 'GBW Cut', key: 'gbw_cut', width: 10 },
        { header: 'Mill W', key: 'mill_w', width: 12 }, { header: 'Moist%', key: 'moisture', width: 9 },
        { header: 'M.Cut', key: 'moisture_cut', width: 9 }, { header: 'Cut%', key: 'cutting_percent', width: 8 },
        { header: 'D/D/P', key: 'disc_dust_poll', width: 8 }, { header: 'Final W', key: 'final_w', width: 12 },
        { header: 'G.Issued', key: 'g_issued', width: 10 }, { header: 'Cash', key: 'cash_paid', width: 10 },
        { header: 'Diesel', key: 'diesel_paid', width: 10 }
      ];
      entries.forEach(e => ws.addRow({ date: e.date, truck_no: e.truck_no, rst_no: e.rst_no || '', tp_no: e.tp_no || '', agent_name: e.agent_name, mandi_name: e.mandi_name, qntl: +(e.qntl||0).toFixed(2), bag: e.bag||0, g_deposite: e.g_deposite||0, gbw_cut: +(e.gbw_cut||0).toFixed(2), mill_w: +((e.mill_w||0)/100).toFixed(2), moisture: e.moisture||0, moisture_cut: +((e.moisture_cut||0)/100).toFixed(2), cutting_percent: e.cutting_percent||0, disc_dust_poll: e.disc_dust_poll||0, final_w: +((e.final_w||0)/100).toFixed(2), g_issued: e.g_issued||0, cash_paid: e.cash_paid||0, diesel_paid: e.diesel_paid||0 }));
      addExcelTitle(ws, 'Mill Entries Report', 19); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  apiApp.get('/api/export/pdf', safeSync((req, res) => {
    try {
      const entries = database.getEntries(req.query);
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.pdf`);
      doc.pipe(res); addPdfHeader(doc, 'Mill Entries Report');
      const h = ['Date','Truck','Agent','Mandi','QNTL','BAG','Mill W','Cut%','Final W','Cash','Diesel'];
      const rows = entries.map(e => [e.date||'',e.truck_no||'',e.agent_name||'',e.mandi_name||'',(e.qntl||0).toFixed(2),e.bag||0,((e.mill_w||0)/100).toFixed(2),e.cutting_percent||0,((e.final_w||0)/100).toFixed(2),e.cash_paid||0,e.diesel_paid||0]);
      addPdfTable(doc, h, rows, [55,60,60,60,40,35,45,35,50,45,45]); doc.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  apiApp.get('/api/export/truck-payments-excel', safeAsync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Truck Payments');
      ws.columns = [{header:'Date',key:'date',width:12},{header:'Truck No',key:'truck_no',width:14},{header:'Mandi',key:'mandi',width:14},{header:'Final QNTL',key:'fq',width:12},{header:'Rate',key:'rate',width:8},{header:'Gross',key:'gross',width:12},{header:'Cash',key:'cash',width:10},{header:'Diesel',key:'diesel',width:10},{header:'Deductions',key:'ded',width:12},{header:'Net',key:'net',width:12},{header:'Paid',key:'paid',width:10},{header:'Balance',key:'bal',width:12},{header:'Status',key:'status',width:10}];
      entries.forEach(e => { const p=database.getTruckPayment(e.id); const fq=(e.final_w||0)/100; const g=fq*p.rate_per_qntl; const d=(e.cash_paid||0)+(e.diesel_paid||0); const n=g-d; const b=Math.max(0,n-p.paid_amount); ws.addRow({date:e.date,truck_no:e.truck_no,mandi:e.mandi_name,fq:+fq.toFixed(2),rate:p.rate_per_qntl,gross:+g.toFixed(2),cash:e.cash_paid||0,diesel:e.diesel_paid||0,ded:+d.toFixed(2),net:+n.toFixed(2),paid:p.paid_amount,bal:+b.toFixed(2),status:b<0.10?'Paid':(p.paid_amount>0?'Partial':'Pending')}); });
      addExcelTitle(ws, 'Truck Payments', 13); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  apiApp.get('/api/export/truck-payments-pdf', safeSync((req, res) => {
    try {
      const entries = database.getEntries(req.query);
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.pdf`);
      doc.pipe(res); addPdfHeader(doc, 'Truck Payments Report');
      const h = ['Date','Truck','Mandi','Final QNTL','Rate','Gross','Ded','Net','Paid','Balance','Status'];
      const rows = entries.map(e => { const p=database.getTruckPayment(e.id); const fq=(e.final_w||0)/100; const g=fq*p.rate_per_qntl; const d=(e.cash_paid||0)+(e.diesel_paid||0); const n=g-d; const b=Math.max(0,n-p.paid_amount); return [e.date,e.truck_no,e.mandi_name,fq.toFixed(2),p.rate_per_qntl,g.toFixed(2),d.toFixed(2),n.toFixed(2),p.paid_amount,b.toFixed(2),b<0.10?'Paid':(p.paid_amount>0?'Partial':'Pending')]; });
      addPdfTable(doc, h, rows, [50,55,55,45,35,50,50,50,45,50,40]); doc.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  apiApp.get('/api/export/agent-payments-excel', safeAsync(async (req, res) => {
    try {
      const targets = database.getMandiTargets(req.query); const entries = database.getEntries(req.query);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Agent Payments');
      ws.columns = [{header:'Mandi',key:'mandi',width:14},{header:'Agent',key:'agent',width:14},{header:'Target',key:'target',width:12},{header:'Cutting',key:'cutting',width:12},{header:'B.Rate',key:'br',width:10},{header:'C.Rate',key:'cr',width:10},{header:'Total',key:'total',width:12},{header:'Achieved',key:'ach',width:10},{header:'Paid',key:'paid',width:10},{header:'Balance',key:'bal',width:12},{header:'Status',key:'status',width:10}];
      targets.forEach(t => { const me=entries.filter(e=>e.mandi_name===t.mandi_name); const ach=me.reduce((s,e)=>s+(e.final_w||0)/100,0); const cq=t.target_qntl*t.cutting_percent/100; const tot=(t.target_qntl*(t.base_rate??10))+(cq*(t.cutting_rate??5)); const p=database.getAgentPayment(t.mandi_name,t.kms_year,t.season); const bal=Math.max(0,tot-p.paid_amount); const ae=me.find(e=>e.agent_name); ws.addRow({mandi:t.mandi_name,agent:ae?ae.agent_name:'',target:t.target_qntl,cutting:+cq.toFixed(2),br:t.base_rate??10,cr:t.cutting_rate??5,total:+tot.toFixed(2),ach:+ach.toFixed(2),paid:p.paid_amount,bal:+bal.toFixed(2),status:bal<0.01?'Paid':(p.paid_amount>0?'Partial':'Pending')}); });
      addExcelTitle(ws, 'Agent Payments', 11); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=agent_payments_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  apiApp.get('/api/export/agent-payments-pdf', safeSync((req, res) => {
    try {
      const targets = database.getMandiTargets(req.query); const entries = database.getEntries(req.query);
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=agent_payments_${Date.now()}.pdf`);
      doc.pipe(res); addPdfHeader(doc, 'Agent Payments Report');
      const h = ['Mandi','Agent','Target','Cutting','B.Rate','C.Rate','Total','Achieved','Paid','Balance','Status'];
      const rows = targets.map(t => { const me=entries.filter(e=>e.mandi_name===t.mandi_name); const ach=me.reduce((s,e)=>s+(e.final_w||0)/100,0); const cq=t.target_qntl*t.cutting_percent/100; const tot=(t.target_qntl*(t.base_rate??10))+(cq*(t.cutting_rate??5)); const p=database.getAgentPayment(t.mandi_name,t.kms_year,t.season); const bal=Math.max(0,tot-p.paid_amount); const ae=me.find(e=>e.agent_name); return [t.mandi_name,ae?ae.agent_name:'',t.target_qntl,cq.toFixed(2),t.base_rate??10,t.cutting_rate??5,tot.toFixed(2),ach.toFixed(2),p.paid_amount,bal.toFixed(2),bal<0.01?'Paid':(p.paid_amount>0?'Partial':'Pending')]; });
      addPdfTable(doc, h, rows, [55,55,40,40,35,35,50,45,45,50,40]); doc.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  apiApp.get('/api/export/summary-report-pdf', safeSync((req, res) => {
    try {
      const entries = database.getEntries(req.query); const totals = database.getTotals ? database.getTotals(req.query) : {};
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=summary_${Date.now()}.pdf`);
      doc.pipe(res); addPdfHeader(doc, 'Summary Report');
      doc.fontSize(10).font('Helvetica-Bold').text('Overview:', { underline: true }); doc.moveDown(0.3); doc.font('Helvetica').fontSize(9);
      doc.text(`Total Entries: ${entries.length}`); doc.text(`Total QNTL: ${(totals.total_qntl||0).toFixed?.(2)||0}`); doc.text(`Total Final W: ${((totals.total_final_w||0)/100).toFixed?.(2)||0}`);
      doc.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  apiApp.get('/api/export/truck-owner-excel', safeAsync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query); const td = {};
      entries.forEach(e => { const tn=e.truck_no||'Unknown'; const p=database.getTruckPayment(e.id); const fq=(e.final_w||0)/100; const g=fq*p.rate_per_qntl; const d=(e.cash_paid||0)+(e.diesel_paid||0); const n=g-d; const b=Math.max(0,n-p.paid_amount); if(!td[tn])td[tn]={truck_no:tn,trips:0,tq:0,tg:0,tded:0,tn2:0,tp:0,tb:0}; td[tn].trips++;td[tn].tq+=fq;td[tn].tg+=g;td[tn].tded+=d;td[tn].tn2+=n;td[tn].tp+=p.paid_amount;td[tn].tb+=b; });
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Truck Owner');
      ws.columns = [{header:'Truck No',key:'t',width:14},{header:'Trips',key:'tr',width:8},{header:'Total QNTL',key:'q',width:12},{header:'Gross',key:'g',width:12},{header:'Deductions',key:'d',width:12},{header:'Net',key:'n',width:12},{header:'Paid',key:'p',width:12},{header:'Balance',key:'b',width:12},{header:'Status',key:'s',width:10}];
      Object.values(td).forEach(t => ws.addRow({t:t.truck_no,tr:t.trips,q:+t.tq.toFixed(2),g:+t.tg.toFixed(2),d:+t.tded.toFixed(2),n:+t.tn2.toFixed(2),p:+t.tp.toFixed(2),b:+t.tb.toFixed(2),s:t.tb<0.10?'Paid':(t.tp>0?'Partial':'Pending')}));
      addExcelTitle(ws, 'Truck Owner Report', 9); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=truck_owner_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  apiApp.get('/api/export/truck-owner-pdf', safeSync((req, res) => {
    try {
      const entries = database.getEntries(req.query); const td = {};
      entries.forEach(e => { const tn=e.truck_no||'Unknown'; const p=database.getTruckPayment(e.id); const fq=(e.final_w||0)/100; const g=fq*p.rate_per_qntl; const d=(e.cash_paid||0)+(e.diesel_paid||0); const n=g-d; const b=Math.max(0,n-p.paid_amount); if(!td[tn])td[tn]={truck_no:tn,trips:0,tq:0,tg:0,tded:0,tn2:0,tp:0,tb:0}; td[tn].trips++;td[tn].tq+=fq;td[tn].tg+=g;td[tn].tded+=d;td[tn].tn2+=n;td[tn].tp+=p.paid_amount;td[tn].tb+=b; });
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=truck_owner_${Date.now()}.pdf`);
      doc.pipe(res); addPdfHeader(doc, 'Truck Owner Report');
      const h = ['Truck','Trips','QNTL','Gross','Ded','Net','Paid','Balance','Status'];
      const rows = Object.values(td).map(t => [t.truck_no,t.trips,t.tq.toFixed(2),t.tg.toFixed(2),t.tded.toFixed(2),t.tn2.toFixed(2),t.tp.toFixed(2),t.tb.toFixed(2),t.tb<0.10?'Paid':(t.tp>0?'Partial':'Pending')]);
      addPdfTable(doc, h, rows, [55,35,50,50,50,55,50,50,40]); doc.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== CASH BOOK =====
  apiApp.post('/api/cash-book', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const d = req.body;
    const txn = { id: uuidv4(), date: d.date, account: d.account || 'cash', txn_type: d.txn_type || 'jama',
      category: d.category || '', description: d.description || '', amount: +(d.amount || 0),
      reference: d.reference || '', kms_year: d.kms_year || '', season: d.season || '',
      created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    database.data.cash_transactions.push(txn); database.save(); res.json(txn);
  }));
  apiApp.get('/api/cash-book', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
    if (req.query.date_from) txns = txns.filter(t => t.date >= req.query.date_from);
    if (req.query.date_to) txns = txns.filter(t => t.date <= req.query.date_to);
    res.json(txns.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
  }));
  apiApp.delete('/api/cash-book/:id', safeSync((req, res) => {
    if (!database.data.cash_transactions) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.cash_transactions.length;
    database.data.cash_transactions = database.data.cash_transactions.filter(t => t.id !== req.params.id);
    if (database.data.cash_transactions.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));
  apiApp.get('/api/cash-book/categories', safeSync((req, res) => {
    if (!database.data.cash_book_categories) database.data.cash_book_categories = [];
    res.json([...database.data.cash_book_categories]);
  }));
  apiApp.post('/api/cash-book/categories', safeSync((req, res) => {
    if (!database.data.cash_book_categories) database.data.cash_book_categories = [];
    const name = (req.body.name || '').trim();
    const type = req.body.type || '';
    if (!name || !type) return res.status(400).json({ detail: 'Name and type required' });
    if (database.data.cash_book_categories.find(c => c.name === name && c.type === type)) return res.status(400).json({ detail: 'Category already exists' });
    const cat = { id: uuidv4(), name, type, created_at: new Date().toISOString() };
    database.data.cash_book_categories.push(cat); database.save(); res.json(cat);
  }));
  apiApp.delete('/api/cash-book/categories/:id', safeSync((req, res) => {
    if (!database.data.cash_book_categories) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.cash_book_categories.length;
    database.data.cash_book_categories = database.data.cash_book_categories.filter(c => c.id !== req.params.id);
    if (database.data.cash_book_categories.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));
  apiApp.get('/api/cash-book/summary', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    const cashIn = +txns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const cashOut = +txns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const bankIn = +txns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const bankOut = +txns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    res.json({ cash_in: cashIn, cash_out: cashOut, cash_balance: +(cashIn - cashOut).toFixed(2),
      bank_in: bankIn, bank_out: bankOut, bank_balance: +(bankIn - bankOut).toFixed(2),
      total_balance: +((cashIn - cashOut) + (bankIn - bankOut)).toFixed(2), total_transactions: txns.length });
  }));
  apiApp.get('/api/cash-book/excel', safeAsync(async (req, res) => {
    try {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      let txns = [...database.data.cash_transactions];
      if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
      if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
      if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
      txns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Cash Book');
      ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Account', key: 'account', width: 10 },
        { header: 'Type', key: 'type', width: 10 }, { header: 'Category', key: 'category', width: 18 },
        { header: 'Description', key: 'description', width: 24 }, { header: 'Jama (₹)', key: 'jama', width: 14 },
        { header: 'Nikasi (₹)', key: 'nikasi', width: 14 }, { header: 'Reference', key: 'reference', width: 16 }
      ];
      txns.forEach(t => ws.addRow({ date: t.date, account: t.account === 'cash' ? 'Cash' : 'Bank',
        type: t.txn_type === 'jama' ? 'Jama' : 'Nikasi', category: t.category || '', description: t.description || '',
        jama: t.txn_type === 'jama' ? t.amount : '', nikasi: t.txn_type === 'nikasi' ? t.amount : '', reference: t.reference || '' }));
      const totalRow = ws.addRow({ date: 'TOTAL', jama: +txns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
        nikasi: +txns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2) });
      totalRow.font = { bold: true };
      addExcelTitle(ws, 'Daily Cash Book', 8); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=cash_book_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));
  apiApp.get('/api/cash-book/pdf', safeSync((req, res) => {
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
      doc.pipe(res); addPdfHeader(doc, 'Daily Cash Book');
      const headers = ['Date','Account','Type','Category','Description','Jama(Rs.)','Nikasi(Rs.)','Ref'];
      const rows = txns.map(t => [t.date||'', t.account==='cash'?'Cash':'Bank', t.txn_type==='jama'?'Jama':'Nikasi',
        (t.category||'').substring(0,25), (t.description||'').substring(0,35),
        t.txn_type==='jama'?t.amount:'-', t.txn_type==='nikasi'?t.amount:'-', (t.reference||'').substring(0,12)]);
      const tj = +txns.filter(t => t.txn_type==='jama').reduce((s,t)=>s+(t.amount||0),0).toFixed(2);
      const tn = +txns.filter(t => t.txn_type==='nikasi').reduce((s,t)=>s+(t.amount||0),0).toFixed(2);
      rows.push(['TOTAL','','','','',tj,tn,'']);
      addPdfTable(doc, headers, rows, [55,45,40,90,150,60,60,55]); doc.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));


  // ===== CASH BOOK OPENING BALANCE =====
  apiApp.get('/api/cash-book/opening-balance', safeSync((req, res) => {
    const kms_year = req.query.kms_year || '';
    if (!database.data.opening_balances) database.data.opening_balances = [];
    const saved = database.data.opening_balances.find(ob => ob.kms_year === kms_year);
    if (saved) return res.json({ cash: saved.cash || 0, bank: saved.bank || 0, source: 'manual' });
    const parts = kms_year.split('-');
    if (parts.length === 2) {
      try {
        const prevFy = `${parseInt(parts[0])-1}-${parseInt(parts[1])-1}`;
        const prevTxns = (database.data.cash_transactions || []).filter(t => t.kms_year === prevFy);
        const prevCashIn = prevTxns.filter(t => t.account==='cash' && t.txn_type==='jama').reduce((s,t) => s+(t.amount||0), 0);
        const prevCashOut = prevTxns.filter(t => t.account==='cash' && t.txn_type==='nikasi').reduce((s,t) => s+(t.amount||0), 0);
        const prevBankIn = prevTxns.filter(t => t.account==='bank' && t.txn_type==='jama').reduce((s,t) => s+(t.amount||0), 0);
        const prevBankOut = prevTxns.filter(t => t.account==='bank' && t.txn_type==='nikasi').reduce((s,t) => s+(t.amount||0), 0);
        const prevOb = database.data.opening_balances.find(ob => ob.kms_year === prevFy);
        const obCash = prevOb ? (prevOb.cash || 0) : 0;
        const obBank = prevOb ? (prevOb.bank || 0) : 0;
        return res.json({ cash: +(obCash + prevCashIn - prevCashOut).toFixed(2), bank: +(obBank + prevBankIn - prevBankOut).toFixed(2), source: 'auto' });
      } catch(e) {}
    }
    res.json({ cash: 0, bank: 0, source: 'none' });
  }));

  apiApp.put('/api/cash-book/opening-balance', safeSync((req, res) => {
    const { kms_year, cash, bank } = req.body;
    if (!kms_year) return res.status(400).json({ detail: 'kms_year is required' });
    if (!database.data.opening_balances) database.data.opening_balances = [];
    const idx = database.data.opening_balances.findIndex(ob => ob.kms_year === kms_year);
    const doc = { kms_year, cash: +(cash || 0), bank: +(bank || 0), updated_at: new Date().toISOString() };
    if (idx >= 0) database.data.opening_balances[idx] = doc;
    else database.data.opening_balances.push(doc);
    database.save();
    res.json(doc);
  }));


  // ===== DC MANAGEMENT =====
  apiApp.post('/api/dc-entries', safeSync((req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    const d = req.body;
    const entry = { id: uuidv4(), dc_number: d.dc_number||'', date: d.date||'', quantity_qntl: +(d.quantity_qntl||0), rice_type: d.rice_type||'parboiled', godown_name: d.godown_name||'', deadline: d.deadline||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
    database.data.dc_entries.push(entry); database.save(); res.json(entry);
  }));
  apiApp.get('/api/dc-entries', safeSync((req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let entries = [...database.data.dc_entries];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    entries.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    entries.forEach(e => { const dels = database.data.dc_deliveries.filter(d => d.dc_id === e.id); const delivered = +dels.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2); e.delivered_qntl = delivered; e.pending_qntl = +(e.quantity_qntl-delivered).toFixed(2); e.delivery_count = dels.length; e.status = delivered >= e.quantity_qntl ? 'completed' : (delivered > 0 ? 'partial' : 'pending'); });
    res.json(entries);
  }));
  apiApp.delete('/api/dc-entries/:id', safeSync((req, res) => {
    if (!database.data.dc_entries) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.dc_entries.length;
    database.data.dc_entries = database.data.dc_entries.filter(e => e.id !== req.params.id);
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    database.data.dc_deliveries = database.data.dc_deliveries.filter(d => d.dc_id !== req.params.id);
    if (database.data.dc_entries.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));
  apiApp.put('/api/dc-entries/:id', safeSync((req, res) => {
    if (!database.data.dc_entries) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.dc_entries.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'DC entry not found' });
    database.data.dc_entries[idx] = { ...database.data.dc_entries[idx], ...req.body, updated_at: new Date().toISOString() };
    database.save(); res.json(database.data.dc_entries[idx]);
  }));
  apiApp.get('/api/dc-entries/excel', safeAsync(async (req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    let entries = [...database.data.dc_entries];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('DC Entries');
    ws.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'DC No', key: 'dc_number', width: 12 }, { header: 'Qty(Q)', key: 'quantity_qntl', width: 10 }, { header: 'Rice Type', key: 'rice_type', width: 12 }, { header: 'Godown', key: 'godown_name', width: 15 }, { header: 'Deadline', key: 'deadline', width: 12 }];
    entries.forEach(e => ws.addRow(e));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=dc_entries.xlsx');
    await wb.xlsx.write(res); res.end();
  }));
  apiApp.get('/api/dc-entries/pdf', safeSync((req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    let entries = [...database.data.dc_entries];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    const PDFDocument = require('pdfkit'); const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename=dc_entries.pdf');
    doc.pipe(res); addPdfHeader(doc, 'DC Entries Report');
    const headers = ['Date', 'DC No', 'Qty(Q)', 'Rice Type', 'Godown', 'Deadline', 'Notes'];
    const rows = entries.map(e => [e.date||'', e.dc_number||'', e.quantity_qntl||0, e.rice_type||'', e.godown_name||'', e.deadline||'', (e.notes||'').substring(0,25)]);
    addPdfTable(doc, headers, rows, [60, 60, 50, 60, 80, 60, 100]); doc.end();
  }));

  apiApp.post('/api/dc-deliveries', safeSync((req, res) => {
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    const d = req.body;
    const del = { id: uuidv4(), dc_id: d.dc_id||'', date: d.date||'', quantity_qntl: +(d.quantity_qntl||0), vehicle_no: d.vehicle_no||'', driver_name: d.driver_name||'', slip_no: d.slip_no||'', godown_name: d.godown_name||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
    database.data.dc_deliveries.push(del); database.save(); res.json(del);
  }));
  apiApp.get('/api/dc-deliveries', safeSync((req, res) => {
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let dels = [...database.data.dc_deliveries];
    if (req.query.dc_id) dels = dels.filter(d => d.dc_id === req.query.dc_id);
    if (req.query.kms_year) dels = dels.filter(d => d.kms_year === req.query.kms_year);
    if (req.query.season) dels = dels.filter(d => d.season === req.query.season);
    res.json(dels.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
  }));
  apiApp.delete('/api/dc-deliveries/:id', safeSync((req, res) => {
    if (!database.data.dc_deliveries) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.dc_deliveries.length;
    database.data.dc_deliveries = database.data.dc_deliveries.filter(d => d.id !== req.params.id);
    if (database.data.dc_deliveries.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));
  apiApp.get('/api/dc-summary', safeSync((req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let dcs = [...database.data.dc_entries]; let dels = [...database.data.dc_deliveries];
    if (req.query.kms_year) { dcs = dcs.filter(e=>e.kms_year===req.query.kms_year); dels = dels.filter(d=>d.kms_year===req.query.kms_year); }
    if (req.query.season) { dcs = dcs.filter(e=>e.season===req.query.season); dels = dels.filter(d=>d.season===req.query.season); }
    const ta=+dcs.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2); const td=+dels.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2);
    let comp=0,part=0,pend=0;
    dcs.forEach(dc=>{const d=dels.filter(x=>x.dc_id===dc.id).reduce((s,x)=>s+(x.quantity_qntl||0),0);if(d>=dc.quantity_qntl)comp++;else if(d>0)part++;else pend++;});
    res.json({total_dc:dcs.length,total_allotted_qntl:ta,total_delivered_qntl:td,total_pending_qntl:+(ta-td).toFixed(2),completed:comp,partial:part,pending:pend,total_deliveries:dels.length});
  }));
  // ===== MSP PAYMENTS =====
  apiApp.post('/api/msp-payments', safeSync((req, res) => {
    if (!database.data.msp_payments) database.data.msp_payments = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const d = req.body;
    const pay = { id: uuidv4(), date: d.date||'', dc_id: d.dc_id||'', amount: +(d.amount||0), quantity_qntl: +(d.quantity_qntl||0), rate_per_qntl: +(d.rate_per_qntl||0), payment_mode: d.payment_mode||'', reference: d.reference||'', bank_name: d.bank_name||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
    database.data.msp_payments.push(pay);
    // Auto Cash Book Jama (MSP payment received from govt)
    if (pay.amount > 0) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: pay.date, account: 'bank', txn_type: 'jama',
        category: 'MSP Payment', description: `MSP Payment: ${pay.quantity_qntl}Q @ Rs.${pay.rate_per_qntl}/Q`,
        amount: Math.round(pay.amount * 100) / 100, reference: `msp:${pay.id.substring(0,8)}`,
        kms_year: pay.kms_year, season: pay.season,
        created_by: req.query.username || 'system', linked_payment_id: `msp:${pay.id}`,
        created_at: new Date().toISOString()
      });
    }
    database.save(); res.json(pay);
  }));
  apiApp.get('/api/msp-payments', safeSync((req, res) => {
    if (!database.data.msp_payments) database.data.msp_payments = [];
    if (!database.data.dc_entries) database.data.dc_entries = [];
    let pays = [...database.data.msp_payments];
    if (req.query.kms_year) pays = pays.filter(p=>p.kms_year===req.query.kms_year);
    if (req.query.season) pays = pays.filter(p=>p.season===req.query.season);
    const dcMap = Object.fromEntries(database.data.dc_entries.map(d=>[d.id,d.dc_number||'']));
    pays.forEach(p=>{p.dc_number=dcMap[p.dc_id]||'';});
    res.json(pays.sort((a,b)=>(b.date||'').localeCompare(a.date||'')));
  }));
  apiApp.delete('/api/msp-payments/:id', safeSync((req, res) => {
    if (!database.data.msp_payments) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.msp_payments.length;
    database.data.msp_payments = database.data.msp_payments.filter(p=>p.id!==req.params.id);
    if (database.data.msp_payments.length < len) {
      // Delete linked cash book entry
      if (database.data.cash_transactions) {
        database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== `msp:${req.params.id}`);
      }
      database.save(); return res.json({ message: 'Deleted', id: req.params.id });
    }
    res.status(404).json({ detail: 'Not found' });
  }));
  apiApp.get('/api/msp-payments/summary', safeSync((req, res) => {
    if (!database.data.msp_payments) database.data.msp_payments = [];
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let pays=[...database.data.msp_payments]; let dels=[...database.data.dc_deliveries];
    if (req.query.kms_year) { pays=pays.filter(p=>p.kms_year===req.query.kms_year); dels=dels.filter(d=>d.kms_year===req.query.kms_year); }
    if (req.query.season) { pays=pays.filter(p=>p.season===req.query.season); dels=dels.filter(d=>d.season===req.query.season); }
    const tpa=+pays.reduce((s,p)=>s+(p.amount||0),0).toFixed(2); const tpq=+pays.reduce((s,p)=>s+(p.quantity_qntl||0),0).toFixed(2); const tdq=+dels.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2);
    res.json({total_payments:pays.length,total_paid_amount:tpa,total_paid_qty:tpq,avg_rate:tpq>0?+(tpa/tpq).toFixed(2):0,total_delivered_qntl:tdq,pending_payment_qty:+(tdq-tpq).toFixed(2)});
  }));
  apiApp.get('/api/msp-payments/excel', safeAsync(async (req, res) => {
    if (!database.data.msp_payments) database.data.msp_payments = [];
    let payments = [...database.data.msp_payments];
    if (req.query.kms_year) payments = payments.filter(p => p.kms_year === req.query.kms_year);
    const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('MSP Payments');
    ws.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'Qty(Q)', key: 'quantity_qntl', width: 10 }, { header: 'Rate/Q', key: 'rate_per_qntl', width: 10 }, { header: 'Amount', key: 'amount', width: 12 }, { header: 'Mode', key: 'payment_mode', width: 10 }, { header: 'Reference', key: 'reference', width: 15 }, { header: 'Bank', key: 'bank_name', width: 15 }];
    payments.forEach(p => ws.addRow(p));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=msp_payments.xlsx');
    await wb.xlsx.write(res); res.end();
  }));
  apiApp.get('/api/msp-payments/pdf', safeSync((req, res) => {
    if (!database.data.msp_payments) database.data.msp_payments = [];
    let payments = [...database.data.msp_payments];
    if (req.query.kms_year) payments = payments.filter(p => p.kms_year === req.query.kms_year);
    const PDFDocument = require('pdfkit'); const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename=msp_payments.pdf');
    doc.pipe(res); addPdfHeader(doc, 'MSP Payments Report');
    const headers = ['Date', 'Qty(Q)', 'Rate(Rs./Q)', 'Amount(Rs.)', 'Mode', 'Reference', 'Bank'];
    const rows = payments.map(p => [p.date||'', p.quantity_qntl||0, p.rate_per_qntl||0, p.amount||0, p.payment_mode||'', (p.reference||'').substring(0,15), (p.bank_name||'').substring(0,15)]);
    addPdfTable(doc, headers, rows, [60, 50, 60, 70, 50, 80, 80]); doc.end();
  }));

  // ===== GUNNY BAGS =====
  apiApp.post('/api/gunny-bags', safeSync((req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    const d = req.body;
    const entry = { id: uuidv4(), date: d.date||'', bag_type: d.bag_type||'new', txn_type: d.txn_type||'in', quantity: +(d.quantity||0), source: d.source||'', rate: +(d.rate||0), amount: +((d.quantity||0)*(d.rate||0)).toFixed(2), reference: d.reference||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
    database.data.gunny_bags.push(entry); database.save(); res.json(entry);
  }));
  apiApp.get('/api/gunny-bags', safeSync((req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e=>e.kms_year===req.query.kms_year);
    if (req.query.season) entries = entries.filter(e=>e.season===req.query.season);
    if (req.query.bag_type) entries = entries.filter(e=>e.bag_type===req.query.bag_type);
    res.json(entries.sort((a,b)=>(b.date||'').localeCompare(a.date||'')));
  }));
  apiApp.delete('/api/gunny-bags/:id', safeSync((req, res) => {
    if (!database.data.gunny_bags) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.gunny_bags.length;
    database.data.gunny_bags = database.data.gunny_bags.filter(e=>e.id!==req.params.id);
    if (database.data.gunny_bags.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));
  apiApp.put('/api/gunny-bags/:id', safeSync((req, res) => {
    if (!database.data.gunny_bags) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.gunny_bags.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Not found' });
    const d = req.body;
    const qty = parseInt(d.quantity) || 0;
    const rate = parseFloat(d.rate) || 0;
    database.data.gunny_bags[idx] = { ...database.data.gunny_bags[idx], date: d.date || database.data.gunny_bags[idx].date, bag_type: d.bag_type || database.data.gunny_bags[idx].bag_type, txn_type: d.txn_type || database.data.gunny_bags[idx].txn_type, quantity: qty, rate: rate, amount: +(qty * rate).toFixed(2), source: d.source ?? database.data.gunny_bags[idx].source, reference: d.reference ?? database.data.gunny_bags[idx].reference, notes: d.notes ?? database.data.gunny_bags[idx].notes, updated_at: new Date().toISOString() };
    database.save();
    res.json(database.data.gunny_bags[idx]);
  }));
  apiApp.get('/api/gunny-bags/summary', safeSync((req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e=>e.kms_year===req.query.kms_year);
    if (req.query.season) entries = entries.filter(e=>e.season===req.query.season);
    const result = {};
    ['new','old'].forEach(bt=>{const items=entries.filter(e=>e.bag_type===bt);result[bt]={total_in:items.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.quantity||0),0),total_out:items.filter(e=>e.txn_type==='out').reduce((s,e)=>s+(e.quantity||0),0),balance:0,total_cost:+items.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.amount||0),0).toFixed(2)};result[bt].balance=result[bt].total_in-result[bt].total_out;});
    let paddyEntries = [...database.data.entries];
    if (req.query.kms_year) paddyEntries = paddyEntries.filter(e=>e.kms_year===req.query.kms_year);
    if (req.query.season) paddyEntries = paddyEntries.filter(e=>e.season===req.query.season);
    result.paddy_bags = { total: paddyEntries.reduce((s,e)=>s+(e.bag||0),0), label: 'Paddy Receive Bags' };
    result.ppkt = { total: paddyEntries.reduce((s,e)=>s+(e.plastic_bag||0),0), label: 'P.Pkt (Plastic Bags)' };
    const gIssuedTotal = paddyEntries.reduce((s,e)=>s+(parseInt(e.g_issued)||0),0);
    result.g_issued = { total: gIssuedTotal, label: 'G.Issued (Entries)' };
    result.grand_total = result.paddy_bags.total + result.ppkt.total + result.old.balance - gIssuedTotal;
    res.json(result);
  }));
  apiApp.get('/api/gunny-bags/excel', safeAsync(async (req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Gunny Bags');
    ws.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'Bag Type', key: 'bag_type', width: 10 }, { header: 'In/Out', key: 'txn_type', width: 8 }, { header: 'Quantity', key: 'quantity', width: 10 }, { header: 'Rate', key: 'rate', width: 10 }, { header: 'Amount', key: 'amount', width: 12 }];
    entries.forEach(e => ws.addRow(e));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=gunny_bags.xlsx');
    await wb.xlsx.write(res); res.end();
  }));
  apiApp.get('/api/gunny-bags/pdf', safeSync((req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    const PDFDocument = require('pdfkit'); const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename=gunny_bags.pdf');
    doc.pipe(res); addPdfHeader(doc, 'Gunny Bags Report');
    const headers = ['Date', 'Bag Type', 'In/Out', 'Quantity', 'Rate(Rs.)', 'Amount(Rs.)', 'Notes'];
    const rows = entries.map(e => [e.date||'', e.bag_type||'', e.txn_type||'', e.quantity||0, e.rate||0, e.amount||0, (e.notes||'').substring(0,20)]);
    addPdfTable(doc, headers, rows, [60, 50, 40, 50, 50, 60, 100]); doc.end();
  }));


  // ===== CMR EXPORT ENDPOINTS =====

  // ---- MILLING REPORT EXCEL ----
  apiApp.get('/api/milling-report/excel', safeAsync(async (req, res) => {
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
  }));

  // ---- MILLING REPORT PDF ----
  apiApp.get('/api/milling-report/pdf', safeSync((req, res) => {
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
  }));

  // ---- FRK PURCHASES EXCEL ----
  apiApp.get('/api/frk-purchases/excel', safeAsync(async (req, res) => {
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
  }));

  // ---- FRK PURCHASES PDF ----
  apiApp.get('/api/frk-purchases/pdf', safeSync((req, res) => {
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
      const headers = ['Date','Party','Qty(Q)','Rate(Rs.)','Amount(Rs.)','Note'];
      const rows = purchases.map(p => [p.date||'', (p.party_name||'').substring(0,25), p.quantity_qntl||0, p.rate_per_qntl||0, p.total_amount||0, (p.note||'').substring(0,20)]);
      rows.push(['TOTAL', '', tq, '', ta, '']);
      addPdfTable(doc, headers, rows, [60, 120, 55, 55, 70, 80]);
      doc.end();
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  // ---- BYPRODUCT SALES EXCEL ----
  apiApp.get('/api/byproduct-sales/excel', safeAsync(async (req, res) => {
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
  }));

  // ---- BYPRODUCT SALES PDF ----
  apiApp.get('/api/byproduct-sales/pdf', safeSync((req, res) => {
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
      const sHeaders = ['Product','Produced(Q)','Sold(Q)','Available(Q)','Revenue(Rs.)'];
      const sRows = products.map(p => {
        const produced = +millingEntries.reduce((s,e)=>s+(e[`${p}_qntl`]||0),0).toFixed(2);
        const pSales = sales.filter(s => s.product === p);
        const sold = +pSales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
        const revenue = +pSales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
        return [p.charAt(0).toUpperCase()+p.slice(1), produced, sold, +(produced-sold).toFixed(2), revenue];
      });
      addPdfTable(doc, sHeaders, sRows, [70, 70, 60, 70, 70]);
      doc.moveDown(1);
      doc.fontSize(11).font('Helvetica-Bold').text('Sales Detail', { align: 'left' });
      doc.moveDown(0.3);
      const headers = ['Date','Product','Qty(Q)','Rate(Rs.)','Amount(Rs.)','Buyer'];
      const tq = +sales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
      const ta = +sales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
      const rows = sales.map(s => [s.date||'', (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), s.quantity_qntl||0, s.rate_per_qntl||0, s.total_amount||0, (s.buyer_name||'').substring(0,20)]);
      rows.push(['TOTAL', '', tq, '', ta, '']);
      addPdfTable(doc, headers, rows, [55, 55, 45, 50, 60, 90]);
      doc.end();
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  // ---- PADDY CUSTODY REGISTER EXCEL ----
  apiApp.get('/api/paddy-custody-register/excel', safeAsync(async (req, res) => {
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
  }));

  // ---- PADDY CUSTODY REGISTER PDF ----
  apiApp.get('/api/paddy-custody-register/pdf', safeSync((req, res) => {
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
  }));


  // ============ PRIVATE TRADING: Paddy Purchase & Rice Sale ============

  function calcPaddyAutoDesktop(d) {
    d.qntl = Math.round((d.kg || 0) / 100 * 100) / 100;
    d.gbw_cut = d.g_deposite > 0 ? Math.round(d.g_deposite * 0.5 * 100) / 100 : Math.round((d.bag || 0) * 1 * 100) / 100;
    d.mill_w = Math.round(((d.kg || 0) - d.gbw_cut) * 100) / 100;
    d.p_pkt_cut = Math.round((d.plastic_bag || 0) * 0.5 * 100) / 100;
    const moistPct = (d.moisture || 0) > 17 ? Math.round(((d.moisture || 0) - 17) * 100) / 100 : 0;
    d.moisture_cut_percent = moistPct;
    d.moisture_cut = Math.round(d.mill_w * moistPct / 100 * 100) / 100;
    const afterM = d.mill_w - d.moisture_cut;
    d.cutting = Math.round(afterM * (d.cutting_percent || 0) / 100 * 100) / 100;
    d.final_w = Math.round((afterM - d.cutting - d.p_pkt_cut - (d.disc_dust_poll || 0)) * 100) / 100;
    d.final_qntl = Math.round(d.final_w / 100 * 100) / 100;
    d.total_amount = Math.round(d.final_qntl * (d.rate_per_qntl || 0) * 100) / 100;
    d.balance = Math.round(d.total_amount - (d.paid_amount || 0), 2);
    return d;
  }

  apiApp.post('/api/private-paddy', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    ['kg','bag','rate_per_qntl','g_deposite','plastic_bag','moisture','cutting_percent','disc_dust_poll','paid_amount'].forEach(f => { d[f] = parseFloat(d[f]) || 0; });
    d.bag = parseInt(d.bag) || 0; d.plastic_bag = parseInt(d.plastic_bag) || 0;
    calcPaddyAutoDesktop(d);
    database.data.private_paddy.push(d); database.save(); res.json(d);
  }));

  apiApp.get('/api/private-paddy', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const { kms_year, season, party_name } = req.query;
    let items = [...database.data.private_paddy];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(items);
  }));

  apiApp.put('/api/private-paddy/:id', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const idx = database.data.private_paddy.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const merged = { ...database.data.private_paddy[idx], ...req.body, updated_at: new Date().toISOString() };
    ['kg','bag','rate_per_qntl','g_deposite','plastic_bag','moisture','cutting_percent','disc_dust_poll','paid_amount'].forEach(f => { merged[f] = parseFloat(merged[f]) || 0; });
    merged.bag = parseInt(merged.bag) || 0; merged.plastic_bag = parseInt(merged.plastic_bag) || 0;
    calcPaddyAutoDesktop(merged);
    database.data.private_paddy[idx] = merged; database.save(); res.json(merged);
  }));

  apiApp.delete('/api/private-paddy/:id', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const idx = database.data.private_paddy.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    database.data.private_paddy.splice(idx, 1); database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  apiApp.post('/api/rice-sales', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    d.quantity_qntl = parseFloat(d.quantity_qntl) || 0; d.rate_per_qntl = parseFloat(d.rate_per_qntl) || 0;
    d.bags = parseInt(d.bags) || 0; d.paid_amount = parseFloat(d.paid_amount) || 0;
    d.total_amount = Math.round(d.quantity_qntl * d.rate_per_qntl * 100) / 100;
    d.balance = Math.round(d.total_amount - d.paid_amount, 2);
    database.data.rice_sales.push(d); database.save(); res.json(d);
  }));

  apiApp.get('/api/rice-sales', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, party_name } = req.query;
    let items = [...database.data.rice_sales];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(items);
  }));

  apiApp.put('/api/rice-sales/:id', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const idx = database.data.rice_sales.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const merged = { ...database.data.rice_sales[idx], ...req.body, updated_at: new Date().toISOString() };
    merged.quantity_qntl = parseFloat(merged.quantity_qntl) || 0; merged.rate_per_qntl = parseFloat(merged.rate_per_qntl) || 0;
    merged.bags = parseInt(merged.bags) || 0; merged.paid_amount = parseFloat(merged.paid_amount) || 0;
    merged.total_amount = Math.round(merged.quantity_qntl * merged.rate_per_qntl * 100) / 100;
    merged.balance = Math.round(merged.total_amount - merged.paid_amount, 2);
    database.data.rice_sales[idx] = merged; database.save(); res.json(merged);
  }));

  apiApp.delete('/api/rice-sales/:id', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const idx = database.data.rice_sales.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    database.data.rice_sales.splice(idx, 1); database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  apiApp.post('/api/private-payments', safeSync((req, res) => {
    if (!database.data.private_payments) database.data.private_payments = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString() };
    d.amount = parseFloat(d.amount) || 0;
    database.data.private_payments.push(d);
    if (d.ref_type === 'paddy_purchase' && d.ref_id) {
      const entry = (database.data.private_paddy || []).find(e => e.id === d.ref_id);
      if (entry) { entry.paid_amount = Math.round((entry.paid_amount || 0) + d.amount * 100) / 100; entry.balance = Math.round(entry.total_amount - entry.paid_amount * 100) / 100; }
    } else if (d.ref_type === 'rice_sale' && d.ref_id) {
      const entry = (database.data.rice_sales || []).find(e => e.id === d.ref_id);
      if (entry) { entry.paid_amount = Math.round((entry.paid_amount || 0) + d.amount * 100) / 100; entry.balance = Math.round(entry.total_amount - entry.paid_amount * 100) / 100; }
    }
    const account = d.mode === 'bank' ? 'bank' : 'cash';
    const cbTxn = {
      id: require('crypto').randomUUID(), date: d.date, account,
      txn_type: d.ref_type === 'paddy_purchase' ? 'nikasi' : 'jama',
      category: d.ref_type === 'paddy_purchase' ? 'Pvt Paddy Payment' : 'Rice Sale Payment',
      description: d.ref_type === 'paddy_purchase' ? `Paddy Payment: ${d.party_name}` : `Rice Payment Received: ${d.party_name}`,
      amount: d.amount, reference: d.reference || d.id.substring(0, 8),
      kms_year: d.kms_year || '', season: d.season || '', created_by: d.created_by,
      linked_payment_id: d.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    database.data.cash_transactions.push(cbTxn);
    database.save(); res.json(d);
  }));

  apiApp.get('/api/private-payments', safeSync((req, res) => {
    if (!database.data.private_payments) database.data.private_payments = [];
    const { party_name, ref_type, ref_id, kms_year, season } = req.query;
    let items = [...database.data.private_payments];
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    if (ref_type) items = items.filter(i => i.ref_type === ref_type);
    if (ref_id) items = items.filter(i => i.ref_id === ref_id);
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(items);
  }));

  apiApp.delete('/api/private-payments/:id', safeSync((req, res) => {
    if (!database.data.private_payments) database.data.private_payments = [];
    const idx = database.data.private_payments.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const pay = database.data.private_payments[idx];
    if (pay.ref_type === 'paddy_purchase' && pay.ref_id) {
      const entry = (database.data.private_paddy || []).find(e => e.id === pay.ref_id);
      if (entry) { entry.paid_amount = Math.round(Math.max(0, (entry.paid_amount || 0) - pay.amount) * 100) / 100; entry.balance = Math.round(entry.total_amount - entry.paid_amount * 100) / 100; }
    } else if (pay.ref_type === 'rice_sale' && pay.ref_id) {
      const entry = (database.data.rice_sales || []).find(e => e.id === pay.ref_id);
      if (entry) { entry.paid_amount = Math.round(Math.max(0, (entry.paid_amount || 0) - pay.amount) * 100) / 100; entry.balance = Math.round(entry.total_amount - entry.paid_amount * 100) / 100; }
    }
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== pay.id);
    }
    database.data.private_payments.splice(idx, 1); database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ============ PHASE 5: CONSOLIDATED LEDGERS ============

  apiApp.get('/api/reports/outstanding', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const dcEntries = (database.data.dc_entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    const allDels = (database.data.dc_deliveries || []).filter(d => (!kms_year || d.kms_year === kms_year) && (!season || d.season === season));
    const dcOutstanding = [];
    for (const dc of dcEntries) {
      const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl || 0), 0) * 100) / 100;
      const pending = Math.round((dc.quantity_qntl - delivered) * 100) / 100;
      if (pending > 0) dcOutstanding.push({ dc_number: dc.dc_number || '', allotted: dc.quantity_qntl, delivered, pending, deadline: dc.deadline || '', rice_type: dc.rice_type || '' });
    }
    const dcPendingTotal = Math.round(dcOutstanding.reduce((s, d) => s + d.pending, 0) * 100) / 100;
    const mspPayments = (database.data.msp_payments || []).filter(p => (!kms_year || p.kms_year === kms_year) && (!season || p.season === season));
    const totalDeliveredQntl = Math.round(allDels.reduce((s, d) => s + (d.quantity_qntl || 0), 0) * 100) / 100;
    const totalMspPaidQty = Math.round(mspPayments.reduce((s, p) => s + (p.quantity_qntl || 0), 0) * 100) / 100;
    const totalMspPaidAmt = Math.round(mspPayments.reduce((s, p) => s + (p.amount || 0), 0) * 100) / 100;
    const mspPendingQty = Math.round((totalDeliveredQntl - totalMspPaidQty) * 100) / 100;
    const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    const truckMap = {};
    for (const e of entries) { const t = e.truck_no || 'Unknown'; if (!truckMap[t]) truckMap[t] = { truck_no: t, total_trips: 0, total_qty_qntl: 0, total_cash_paid: 0, total_diesel_paid: 0 }; truckMap[t].total_trips++; truckMap[t].total_qty_qntl = Math.round((truckMap[t].total_qty_qntl + (e.mill_w || 0) / 100) * 100) / 100; truckMap[t].total_cash_paid = Math.round((truckMap[t].total_cash_paid + (e.cash_paid || 0)) * 100) / 100; truckMap[t].total_diesel_paid = Math.round((truckMap[t].total_diesel_paid + (e.diesel_paid || 0)) * 100) / 100; }
    const agentMap = {};
    for (const e of entries) { const a = e.agent_name || 'Unknown'; if (!agentMap[a]) agentMap[a] = { agent_name: a, total_entries: 0, total_qty_qntl: 0 }; agentMap[a].total_entries++; agentMap[a].total_qty_qntl = Math.round((agentMap[a].total_qty_qntl + (e.mill_w || 0) / 100) * 100) / 100; }
    const frkPurchases = (database.data.frk_purchases || []).filter(p => (!kms_year || p.kms_year === kms_year) && (!season || p.season === season));
    const frkPartyMap = {};
    for (const p of frkPurchases) { const n = p.party_name || 'Unknown'; if (!frkPartyMap[n]) frkPartyMap[n] = { party_name: n, total_qty: 0, total_amount: 0 }; frkPartyMap[n].total_qty = Math.round((frkPartyMap[n].total_qty + (p.quantity_qntl || 0)) * 100) / 100; frkPartyMap[n].total_amount = Math.round((frkPartyMap[n].total_amount + (p.total_amount || 0)) * 100) / 100; }
    res.json({ dc_outstanding: { items: dcOutstanding, total_pending_qntl: dcPendingTotal, count: dcOutstanding.length }, msp_outstanding: { total_delivered_qntl: totalDeliveredQntl, total_paid_qty: totalMspPaidQty, total_paid_amount: totalMspPaidAmt, pending_qty: mspPendingQty }, trucks: Object.values(truckMap), agents: Object.values(agentMap), frk_parties: Object.values(frkPartyMap) });
  }));

  apiApp.get('/api/reports/party-ledger', safeSync((req, res) => {
    const { party_name, party_type, kms_year, season } = req.query;
    const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    const ledger = [];
    if (!party_type || party_type === 'agent') { for (const e of entries) { const a = e.agent_name || ''; if (!a) continue; if (party_name && a.toLowerCase() !== party_name.toLowerCase()) continue; ledger.push({ date: e.date || '', party_name: a, party_type: 'Agent', description: `Paddy: ${Math.round((e.mill_w||0)/100*100)/100}Q | Truck: ${e.truck_no||''}`, debit: 0, credit: Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100, ref: (e.id||'').substring(0,8) }); } }
    if (!party_type || party_type === 'truck') { for (const e of entries) { const t = e.truck_no || ''; if (!t) continue; if (party_name && t.toLowerCase() !== party_name.toLowerCase()) continue; ledger.push({ date: e.date || '', party_name: t, party_type: 'Truck', description: `Paddy: ${Math.round((e.mill_w||0)/100*100)/100}Q | Agent: ${e.agent_name||''}`, debit: 0, credit: Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100, ref: (e.id||'').substring(0,8) }); } }
    if (!party_type || party_type === 'frk_party') { (database.data.frk_purchases||[]).filter(p => (!kms_year||p.kms_year===kms_year) && (!season||p.season===season)).forEach(p => { const n = p.party_name||''; if (!n) return; if (party_name && n.toLowerCase()!==party_name.toLowerCase()) return; ledger.push({ date: p.date||'', party_name: n, party_type: 'FRK Seller', description: `FRK: ${p.quantity_qntl||0}Q @ Rs.${p.rate_per_qntl||0}/Q`, debit: Math.round((p.total_amount||0)*100)/100, credit: 0, ref: (p.id||'').substring(0,8) }); }); }
    if (!party_type || party_type === 'buyer') { (database.data.byproduct_sales||[]).filter(s => (!kms_year||s.kms_year===kms_year) && (!season||s.season===season)).forEach(s => { const b = s.buyer_name||''; if (!b) return; if (party_name && b.toLowerCase()!==party_name.toLowerCase()) return; ledger.push({ date: s.date||'', party_name: b, party_type: 'Buyer', description: `${(s.product||'')}`, debit: 0, credit: Math.round((s.total_amount||0)*100)/100, ref: (s.id||'').substring(0,8) }); }); }
    // Private Paddy Purchase
    if (!party_type || party_type === 'pvt_paddy') { (database.data.private_paddy||[]).filter(p => (!kms_year||p.kms_year===kms_year) && (!season||p.season===season)).forEach(p => { const n = p.party_name||''; if (!n) return; if (party_name && n.toLowerCase()!==party_name.toLowerCase()) return; ledger.push({ date: p.date||'', party_name: n, party_type: 'Pvt Paddy', description: `Paddy Purchase: ${p.final_qntl||0}Q @ Rs.${p.rate_per_qntl||0}/Q = Rs.${p.total_amount||0}`, debit: Math.round((p.total_amount||0)*100)/100, credit: 0, ref: (p.id||'').substring(0,8) }); }); }
    // Rice Sale
    if (!party_type || party_type === 'rice_buyer') { (database.data.rice_sales||[]).filter(s => (!kms_year||s.kms_year===kms_year) && (!season||s.season===season)).forEach(s => { const n = s.party_name||''; if (!n) return; if (party_name && n.toLowerCase()!==party_name.toLowerCase()) return; ledger.push({ date: s.date||'', party_name: n, party_type: 'Rice Buyer', description: `Rice Sale: ${s.quantity_qntl||0}Q (${s.rice_type||''}) @ Rs.${s.rate_per_qntl||0}/Q = Rs.${s.total_amount||0}`, debit: 0, credit: Math.round((s.total_amount||0)*100)/100, ref: (s.id||'').substring(0,8) }); }); }
    // Private Payments
    if (!party_type || ['pvt_paddy','rice_buyer','pvt_payment'].includes(party_type)) { (database.data.private_payments||[]).filter(p => (!kms_year||p.kms_year===kms_year) && (!season||p.season===season)).forEach(pay => { const pn = pay.party_name||''; if (!pn) return; if (party_name && pn.toLowerCase()!==party_name.toLowerCase()) return; if (pay.ref_type==='paddy_purchase') { if (party_type && !['pvt_paddy','pvt_payment'].includes(party_type)) return; ledger.push({ date: pay.date||'', party_name: pn, party_type: 'Pvt Paddy', description: `Payment: Rs.${pay.amount||0} (${pay.mode||'cash'})`, debit: 0, credit: Math.round((pay.amount||0)*100)/100, ref: (pay.id||'').substring(0,8) }); } else if (pay.ref_type==='rice_sale') { if (party_type && !['rice_buyer','pvt_payment'].includes(party_type)) return; ledger.push({ date: pay.date||'', party_name: pn, party_type: 'Rice Buyer', description: `Payment Received: Rs.${pay.amount||0} (${pay.mode||'cash'})`, debit: Math.round((pay.amount||0)*100)/100, credit: 0, ref: (pay.id||'').substring(0,8) }); } }); }
    ledger.sort((a, b) => (b.date||'').localeCompare(a.date||''));
    const partySet = new Set(); for (const item of ledger) partySet.add(JSON.stringify({ name: item.party_name, type: item.party_type }));
    const partyList = [...partySet].map(s => JSON.parse(s)).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ ledger, party_list: partyList, total_debit: Math.round(ledger.reduce((s, l) => s + l.debit, 0) * 100) / 100, total_credit: Math.round(ledger.reduce((s, l) => s + l.credit, 0) * 100) / 100 });
  }));

  apiApp.get('/api/reports/outstanding/excel', safeAsync(async (req, res) => {
    try {
      const { kms_year, season } = req.query;
      const dcEntries = (database.data.dc_entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
      const allDels = (database.data.dc_deliveries || []).filter(d => (!kms_year || d.kms_year === kms_year) && (!season || d.season === season));
      const dcOutstanding = [];
      for (const dc of dcEntries) { const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl||0), 0)*100)/100; const pending = Math.round((dc.quantity_qntl - delivered)*100)/100; if (pending > 0) dcOutstanding.push({ dc_number: dc.dc_number||'', allotted: dc.quantity_qntl, delivered, pending, deadline: dc.deadline||'', rice_type: dc.rice_type||'' }); }
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Outstanding');
      ws.mergeCells('A1:F1'); ws.getCell('A1').value = 'Outstanding Report'; ws.getCell('A1').font = { bold: true, size: 14 };
      let row = 3; ws.getCell(`A${row}`).value = 'DC PENDING DELIVERIES'; ws.getCell(`A${row}`).font = { bold: true }; row++;
      ['DC No','Allotted(Q)','Delivered(Q)','Pending(Q)','Deadline','Type'].forEach((h, i) => { ws.getCell(row, i+1).value = h; ws.getCell(row, i+1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getCell(row, i+1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }; }); row++;
      for (const d of dcOutstanding) { [d.dc_number, d.allotted, d.delivered, d.pending, d.deadline, d.rice_type].forEach((v, i) => { ws.getCell(row, i+1).value = v; }); row++; }
      const buf = await wb.xlsx.writeBuffer();
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename=outstanding_${Date.now()}.xlsx` }); res.send(Buffer.from(buf));
    } catch (err) { res.status(500).json({ detail: 'Excel export failed: ' + err.message }); }
  }));

  apiApp.get('/api/reports/outstanding/pdf', safeSync((req, res) => {
    try {
      const { kms_year, season } = req.query;
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=outstanding_${Date.now()}.pdf`); doc.pipe(res);
      doc.fontSize(18).text('Outstanding Report', { align: 'center' }); doc.moveDown();
      doc.fontSize(12).text('DC Pending Deliveries', { underline: true }); doc.moveDown(0.5);
      const dcEntries = (database.data.dc_entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
      const allDels = (database.data.dc_deliveries || []).filter(d => (!kms_year || d.kms_year === kms_year) && (!season || d.season === season));
      for (const dc of dcEntries) { const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl||0), 0)*100)/100; const pending = Math.round((dc.quantity_qntl - delivered)*100)/100; if (pending > 0) doc.fontSize(9).text(`${dc.dc_number||'-'} | Allotted: ${dc.quantity_qntl}Q | Delivered: ${delivered}Q | Pending: ${pending}Q`); }
      doc.end();
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  apiApp.get('/api/reports/party-ledger/excel', safeAsync(async (req, res) => {
    try {
      const { party_name, party_type, kms_year, season } = req.query;
      const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
      const ledger = [];
      if (!party_type || party_type === 'agent') entries.forEach(e => { const a = e.agent_name||''; if (!a||(party_name && a.toLowerCase()!==party_name.toLowerCase())) return; ledger.push({ date: e.date, party_name: a, party_type: 'Agent', description: `Paddy: ${Math.round((e.mill_w||0)/100*100)/100}Q`, debit: 0, credit: Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100, ref: (e.id||'').substring(0,8) }); });
      if (!party_type || party_type === 'truck') entries.forEach(e => { const t = e.truck_no||''; if (!t||(party_name && t.toLowerCase()!==party_name.toLowerCase())) return; ledger.push({ date: e.date, party_name: t, party_type: 'Truck', description: `Paddy: ${Math.round((e.mill_w||0)/100*100)/100}Q`, debit: 0, credit: Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100, ref: (e.id||'').substring(0,8) }); });
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Party Ledger');
      ws.mergeCells('A1:G1'); ws.getCell('A1').value = `Party Ledger${party_name?' - '+party_name:''}`; ws.getCell('A1').font = { bold: true, size: 14 };
      ['Date','Party','Type','Description','Debit(₹)','Credit(₹)','Ref'].forEach((h, i) => { ws.getCell(3, i+1).value = h; ws.getCell(3, i+1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getCell(3, i+1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }; });
      ledger.forEach((l, i) => { [l.date, l.party_name, l.party_type, l.description, l.debit||'', l.credit||'', l.ref].forEach((v, j) => { ws.getCell(i+4, j+1).value = v; }); });
      const buf = await wb.xlsx.writeBuffer();
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename=party_ledger_${Date.now()}.xlsx` }); res.send(Buffer.from(buf));
    } catch (err) { res.status(500).json({ detail: 'Excel export failed: ' + err.message }); }
  }));

  apiApp.get('/api/reports/party-ledger/pdf', safeSync((req, res) => {
    try {
      const { party_name, party_type, kms_year, season } = req.query;
      const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
      const ledger = [];
      if (!party_type || party_type === 'agent') entries.forEach(e => { const a = e.agent_name||''; if (!a||(party_name && a.toLowerCase()!==party_name.toLowerCase())) return; ledger.push({ date: e.date, party_name: a, party_type: 'Agent', description: `Paddy: ${Math.round((e.mill_w||0)/100*100)/100}Q`, debit: 0, credit: Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100 }); });
      if (!party_type || party_type === 'truck') entries.forEach(e => { const t = e.truck_no||''; if (!t||(party_name && t.toLowerCase()!==party_name.toLowerCase())) return; ledger.push({ date: e.date, party_name: t, party_type: 'Truck', description: `Paddy: ${Math.round((e.mill_w||0)/100*100)/100}Q`, debit: 0, credit: Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100 }); });
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=party_ledger_${Date.now()}.pdf`); doc.pipe(res);
      doc.fontSize(18).text(`Party Ledger${party_name?' - '+party_name:''}`, { align: 'center' }); doc.moveDown();
      for (const l of ledger) doc.fontSize(8).text(`${l.date} | ${l.party_name} (${l.party_type}) | ${l.description} | Dr:Rs.${l.debit} | Cr:Rs.${l.credit}`);
      doc.end();
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));



  // ===== LOAD MODULAR ROUTE MODULES (BEFORE static/catch-all) =====
  try {
    const millPartsRoutes = require('./routes/mill_parts')(database);
    const staffRoutes = require('./routes/staff')(database);
    const dailyReportRoutes = require('./routes/daily_report')(database);
    const reportsPnlRoutes = require('./routes/reports_pnl')(database);
    apiApp.use(millPartsRoutes);
    apiApp.use(staffRoutes);
    apiApp.use(dailyReportRoutes);
    apiApp.use(reportsPnlRoutes);
    console.log('[Routes] Mill Parts, Staff, Daily Report, Reports P&L loaded');
  } catch (e) {
    console.error('[Routes] Error loading modules:', e.message);
  }

  // ===== DIESEL PUMPS & ACCOUNTS =====
  apiApp.get('/api/diesel-pumps', safeSync((req, res) => {
    res.json(database.data.diesel_pumps || []);
  }));
  apiApp.post('/api/diesel-pumps', safeSync((req, res) => {
    if (!database.data.diesel_pumps) database.data.diesel_pumps = [];
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ detail: 'Name required' });
    if (database.data.diesel_pumps.find(p => p.name === name)) return res.status(400).json({ detail: 'Pump exists' });
    if (req.body.is_default) database.data.diesel_pumps.forEach(p => p.is_default = false);
    const pump = { id: uuidv4(), name, is_default: !!req.body.is_default || database.data.diesel_pumps.length === 0, created_at: new Date().toISOString() };
    database.data.diesel_pumps.push(pump); database.save(); res.json(pump);
  }));
  apiApp.put('/api/diesel-pumps/:id/set-default', safeSync((req, res) => {
    if (!database.data.diesel_pumps) return res.status(404).json({ detail: 'Not found' });
    database.data.diesel_pumps.forEach(p => p.is_default = (p.id === req.params.id));
    database.save(); res.json({ message: 'Default set' });
  }));
  apiApp.delete('/api/diesel-pumps/:id', safeSync((req, res) => {
    if (!database.data.diesel_pumps) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.diesel_pumps.length;
    database.data.diesel_pumps = database.data.diesel_pumps.filter(p => p.id !== req.params.id);
    if (database.data.diesel_pumps.length < len) { database.save(); return res.json({ message: 'Deleted' }); }
    res.status(404).json({ detail: 'Not found' });
  }));
  apiApp.get('/api/diesel-accounts', safeSync((req, res) => {
    let txns = database.data.diesel_accounts || [];
    if (req.query.pump_id) txns = txns.filter(t => t.pump_id === req.query.pump_id);
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    res.json(txns.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
  }));
  apiApp.get('/api/diesel-accounts/summary', safeSync((req, res) => {
    let txns = database.data.diesel_accounts || [];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    const pumps = (database.data.diesel_pumps || []).map(p => {
      const pt = txns.filter(t => t.pump_id === p.id);
      const td = pt.filter(t=>t.txn_type==='debit').reduce((s,t)=>s+t.amount,0);
      const tp = pt.filter(t=>t.txn_type==='payment').reduce((s,t)=>s+t.amount,0);
      return { pump_id:p.id, pump_name:p.name, is_default:p.is_default||false, total_diesel:+td.toFixed(2), total_paid:+tp.toFixed(2), balance:+(td-tp).toFixed(2), txn_count:pt.filter(t=>t.txn_type==='debit').length };
    });
    res.json({ pumps, grand_total_diesel:+pumps.reduce((s,p)=>s+p.total_diesel,0).toFixed(2), grand_total_paid:+pumps.reduce((s,p)=>s+p.total_paid,0).toFixed(2), grand_balance:+pumps.reduce((s,p)=>s+p.balance,0).toFixed(2) });
  }));
  apiApp.post('/api/diesel-accounts/pay', safeSync((req, res) => {
    const { pump_id, amount, date, kms_year, season, notes } = req.body;
    const amt = parseFloat(amount) || 0;
    if (!pump_id || amt <= 0) return res.status(400).json({ detail: 'pump_id and amount required' });
    const pump = (database.data.diesel_pumps||[]).find(p=>p.id===pump_id);
    if (!pump) return res.status(404).json({ detail: 'Pump not found' });
    if (!database.data.diesel_accounts) database.data.diesel_accounts = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const txn = { id:uuidv4(), date:date||new Date().toISOString().split('T')[0], pump_id, pump_name:pump.name, truck_no:'', agent_name:'', amount:+amt.toFixed(2), txn_type:'payment', description:`Payment to ${pump.name}${notes?' - '+notes:''}`, kms_year:kms_year||'', season:season||'', created_by:req.query.username||'system', created_at:new Date().toISOString() };
    database.data.diesel_accounts.push(txn);
    database.data.cash_transactions.push({ id:uuidv4(), date:txn.date, account:'cash', txn_type:'nikasi', category:'Diesel Payment', description:`Diesel Payment: ${pump.name} - Rs.${amt}${notes?' ('+notes+')':''}`, amount:+amt.toFixed(2), reference:`diesel_pay:${txn.id.slice(0,8)}`, kms_year:kms_year||'', season:season||'', created_by:req.query.username||'system', linked_diesel_payment_id:txn.id, created_at:new Date().toISOString() });
    database.save();
    res.json({ success:true, message:`Rs.${amt} payment to ${pump.name} recorded`, txn_id:txn.id });
  }));
  apiApp.delete('/api/diesel-accounts/:id', safeSync((req, res) => {
    if (!database.data.diesel_accounts) return res.status(404).json({ detail: 'Not found' });
    const txn = database.data.diesel_accounts.find(t=>t.id===req.params.id);
    if (!txn) return res.status(404).json({ detail: 'Not found' });
    if (txn.txn_type === 'payment' && database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t=>t.linked_diesel_payment_id!==txn.id);
    }
    database.data.diesel_accounts = database.data.diesel_accounts.filter(t=>t.id!==req.params.id);
    database.save(); res.json({ message:'Deleted', id:req.params.id });
  }));

  // ===== HEALTH CHECK =====
  apiApp.get('/api/health', safeSync((req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  }));

  // ===== ERROR LOG =====
  apiApp.get('/api/error-log', safeSync((req, res) => {
    try {
      if (fs.existsSync(errorLogPath)) {
        const content = fs.readFileSync(errorLogPath, 'utf8');
        // Return last 200 lines
        const lines = content.split('\n');
        const lastLines = lines.slice(-200).join('\n');
        res.json({ content: lastLines || "Koi error nahi hai.", available: true });
      } else {
        res.json({ content: "Koi error log nahi hai. Sab sahi chal raha hai!", available: true });
      }
    } catch (err) {
      res.json({ content: "Error log read nahi ho paya: " + err.message, available: true });
    }
  }));

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
      { label: 'About', click: () => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'About - Mill Entry System',
          message: 'Mill Entry System',
          detail: 'Version 2.3\n\nDeveloped by 9x.Design\nContact Us: +917205930002',
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
