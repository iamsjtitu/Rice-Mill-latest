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
const { addPdfHeader, addPdfTable } = require('./routes/pdf_helpers');

const PORT = 8080;
let DATA_DIR = null;  // Will be set after user input
let BACKUP_DIR = null;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BACKUPS = 7;

// Directories will be created after user selects data folder

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
    const cashPaid = parseFloat(newEntry.cash_paid) || 0;
    if (cashPaid > 0) {
      if (!this.data.cash_transactions) this.data.cash_transactions = [];
      this.data.cash_transactions.push({ id: uuidv4(), date: newEntry.date, account: 'cash', txn_type: 'nikasi', category: 'Cash Paid (Entry)', description: `Cash Paid: Truck ${newEntry.truck_no||''} - Mandi ${newEntry.mandi_name||''} - Rs.${cashPaid}`, amount: cashPaid, reference: `entry_cash:${newEntry.id.slice(0,8)}`, kms_year: newEntry.kms_year||'', season: newEntry.season||'', created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id, created_at: new Date().toISOString() });
    }
    const dieselPaid = parseFloat(newEntry.diesel_paid) || 0;
    if (dieselPaid > 0) {
      if (!this.data.diesel_accounts) this.data.diesel_accounts = [];
      if (!this.data.diesel_pumps) this.data.diesel_pumps = [];
      const defPump = this.data.diesel_pumps.find(p => p.is_default) || this.data.diesel_pumps[0];
      this.data.diesel_accounts.push({ id: uuidv4(), date: newEntry.date, pump_id: defPump?.id||'default', pump_name: defPump?.name||'Default Pump', truck_no: newEntry.truck_no||'', agent_name: newEntry.agent_name||'', amount: dieselPaid, txn_type: 'debit', description: `Diesel: Truck ${newEntry.truck_no||''} - Mandi ${newEntry.mandi_name||''}`, kms_year: newEntry.kms_year||'', season: newEntry.season||'', created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id, created_at: new Date().toISOString() });
    }
    this.save();
    return newEntry;
  }

  updateEntry(id, updates) {
    const index = this.data.entries.findIndex(e => e.id === id);
    if (index === -1) return null;
    const merged = { ...this.data.entries[index], ...updates };
    const calculated = this.calculateFields(merged);
    this.data.entries[index] = { ...merged, ...calculated, updated_at: new Date().toISOString() };
    const updated = this.data.entries[index];
    if (this.data.cash_transactions) this.data.cash_transactions = this.data.cash_transactions.filter(t => t.linked_entry_id !== id);
    if (this.data.diesel_accounts) this.data.diesel_accounts = this.data.diesel_accounts.filter(t => t.linked_entry_id !== id);
    const cashPaid = parseFloat(updated.cash_paid) || 0;
    if (cashPaid > 0) { if (!this.data.cash_transactions) this.data.cash_transactions = []; this.data.cash_transactions.push({ id: uuidv4(), date: updated.date, account: 'cash', txn_type: 'nikasi', category: 'Cash Paid (Entry)', description: `Cash Paid: Truck ${updated.truck_no||''} - Mandi ${updated.mandi_name||''} - Rs.${cashPaid}`, amount: cashPaid, reference: `entry_cash:${id.slice(0,8)}`, kms_year: updated.kms_year||'', season: updated.season||'', created_by: updated.created_by||'system', linked_entry_id: id, created_at: new Date().toISOString() }); }
    const dieselPaid = parseFloat(updated.diesel_paid) || 0;
    if (dieselPaid > 0) { if (!this.data.diesel_accounts) this.data.diesel_accounts = []; if (!this.data.diesel_pumps) this.data.diesel_pumps = []; const defPump = this.data.diesel_pumps.find(p => p.is_default) || this.data.diesel_pumps[0]; this.data.diesel_accounts.push({ id: uuidv4(), date: updated.date, pump_id: defPump?.id||'default', pump_name: defPump?.name||'Default Pump', truck_no: updated.truck_no||'', agent_name: updated.agent_name||'', amount: dieselPaid, txn_type: 'debit', description: `Diesel: Truck ${updated.truck_no||''} - Mandi ${updated.mandi_name||''}`, kms_year: updated.kms_year||'', season: updated.season||'', created_by: updated.created_by||'system', linked_entry_id: id, created_at: new Date().toISOString() }); }
    this.save();
    return updated;
  }

  deleteEntry(id) {
    const len = this.data.entries.length;
    this.data.entries = this.data.entries.filter(e => e.id !== id);
    if (this.data.cash_transactions) this.data.cash_transactions = this.data.cash_transactions.filter(t => t.linked_entry_id !== id);
    if (this.data.diesel_accounts) this.data.diesel_accounts = this.data.diesel_accounts.filter(t => t.linked_entry_id !== id);
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
let database = null;

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

// Auto-backup and route setup moved to startServer() function below

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


// Route modules loaded dynamically in startServer() function

// ============ SERVE FRONTEND (Static Files) - MUST be after all API routes ============
// NOTE: Static serving moved to end of startServer() after route modules are loaded

// ============ START SERVER WITH FOLDER SELECTION ============
const readline = require('readline');

function askDataFolder() {
  return new Promise((resolve) => {
    // Check for --data-dir CLI argument
    const argIdx = process.argv.indexOf('--data-dir');
    if (argIdx !== -1 && process.argv[argIdx + 1]) {
      return resolve(process.argv[argIdx + 1]);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const defaultPath = path.join(__dirname, 'data');

    console.log('');
    console.log('========================================');
    console.log('  Mill Entry System - Data Folder');
    console.log('========================================');
    console.log('');

    rl.question(`  Data folder path enter karein\n  (Default: ${defaultPath})\n  Path: `, (answer) => {
      rl.close();
      const folderPath = answer.trim() || defaultPath;
      resolve(folderPath);
    });
  });
}

async function startServer() {
  const folderPath = await askDataFolder();
  DATA_DIR = folderPath;
  BACKUP_DIR = path.join(folderPath, 'backups');

  // Ensure directories exist
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Initialize database
  database = new JsonDatabase(DATA_DIR);

  // Auto-backup on startup
  if (!hasTodayBackup() && fs.existsSync(database.dbFile)) {
    createBackup('startup');
  }

  // Setup routes
  try {
    const authRoutes = require('./routes/auth')(database);
    const entriesRoutes = require('./routes/entries')(database);
    const dashboardRoutes = require('./routes/dashboard')(database);
    const paymentsRoutes = require('./routes/payments')(database);
    const exportsRoutes = require('./routes/exports')(database);
    const cashbookRoutes = require('./routes/cashbook')(database);
    const dcPaymentsRoutes = require('./routes/dc_payments')(database);
    const cmrExportsRoutes = require('./routes/cmr_exports')(database);
    const privateTradingRoutes = require('./routes/private_trading')(database);
    const ledgersRoutes = require('./routes/ledgers')(database);
    const millPartsRoutes = require('./routes/mill_parts')(database);
    const staffRoutes = require('./routes/staff')(database);
    const dailyReportRoutes = require('./routes/daily_report')(database);
    const reportsPnlRoutes = require('./routes/reports_pnl')(database);
    const localPartyRoutes = require('./routes/local_party')(database);
    const importExcelRoutes = require('./routes/import_excel')(database);

    app.use(authRoutes);
    app.use(entriesRoutes);
    app.use(dashboardRoutes);
    app.use(paymentsRoutes);
    app.use(exportsRoutes);
    app.use(cashbookRoutes);
    app.use(dcPaymentsRoutes);
    app.use(cmrExportsRoutes);
    app.use(privateTradingRoutes);
    app.use(ledgersRoutes);
    app.use(millPartsRoutes);
    app.use(staffRoutes);
    app.use(dailyReportRoutes);
    app.use(reportsPnlRoutes);
    app.use(localPartyRoutes);
    app.use(importExcelRoutes);
  } catch (e) {
    console.log('  [Note] Some route modules not found:', e.message);
  }

  // ===== ERROR LOG =====
  app.get('/api/error-log', (req, res) => {
    const logPath = path.join(DATA_DIR, 'error.log');
    try {
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n').slice(-200).join('\n');
        res.json({ content: lines || "Koi error nahi hai.", available: true });
      } else {
        res.json({ content: "Koi error log nahi hai. Sab sahi chal raha hai!", available: true });
      }
    } catch (err) {
      res.json({ content: "Error log read nahi ho paya: " + err.message, available: true });
    }
  });

  // ===== DIESEL PUMPS & ACCOUNTS =====
  app.get('/api/diesel-pumps', (req, res) => { res.json(database.data.diesel_pumps || []); });
  app.post('/api/diesel-pumps', (req, res) => {
    if (!database.data.diesel_pumps) database.data.diesel_pumps = [];
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ detail: 'Name required' });
    if (database.data.diesel_pumps.find(p => p.name === name)) return res.status(400).json({ detail: 'Pump exists' });
    if (req.body.is_default) database.data.diesel_pumps.forEach(p => p.is_default = false);
    const pump = { id: uuidv4(), name, is_default: !!req.body.is_default || database.data.diesel_pumps.length === 0, created_at: new Date().toISOString() };
    database.data.diesel_pumps.push(pump); database.save(); res.json(pump);
  });
  app.put('/api/diesel-pumps/:id/set-default', (req, res) => {
    if (!database.data.diesel_pumps) return res.status(404).json({ detail: 'Not found' });
    database.data.diesel_pumps.forEach(p => p.is_default = (p.id === req.params.id));
    database.save(); res.json({ message: 'Default set' });
  });
  app.delete('/api/diesel-pumps/:id', (req, res) => {
    if (!database.data.diesel_pumps) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.diesel_pumps.length;
    database.data.diesel_pumps = database.data.diesel_pumps.filter(p => p.id !== req.params.id);
    if (database.data.diesel_pumps.length < len) { database.save(); return res.json({ message: 'Deleted' }); }
    res.status(404).json({ detail: 'Not found' });
  });
  app.get('/api/diesel-accounts', (req, res) => {
    let txns = database.data.diesel_accounts || [];
    if (req.query.pump_id) txns = txns.filter(t => t.pump_id === req.query.pump_id);
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    res.json(txns.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
  });
  app.get('/api/diesel-accounts/summary', (req, res) => {
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
  });
  app.post('/api/diesel-accounts/pay', (req, res) => {
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
  });
  app.delete('/api/diesel-accounts/:id', (req, res) => {
    if (!database.data.diesel_accounts) return res.status(404).json({ detail: 'Not found' });
    const txn = database.data.diesel_accounts.find(t=>t.id===req.params.id);
    if (!txn) return res.status(404).json({ detail: 'Not found' });
    if (txn.txn_type === 'payment' && database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t=>t.linked_diesel_payment_id!==txn.id);
    }
    database.data.diesel_accounts = database.data.diesel_accounts.filter(t=>t.id!==req.params.id);
    database.save(); res.json({ message:'Deleted', id:req.params.id });
  });
  app.post('/api/diesel-accounts/delete-bulk', (req, res) => {
    const ids = req.body.ids || [];
    if (!ids.length) return res.status(400).json({ detail: 'No ids provided' });
    if (!database.data.diesel_accounts) database.data.diesel_accounts = [];
    const paymentTxns = database.data.diesel_accounts.filter(t => ids.includes(t.id) && t.txn_type === 'payment');
    if (paymentTxns.length > 0 && database.data.cash_transactions) {
      const payIds = paymentTxns.map(t => t.id);
      database.data.cash_transactions = database.data.cash_transactions.filter(t => !payIds.includes(t.linked_diesel_payment_id));
    }
    const before = database.data.diesel_accounts.length;
    database.data.diesel_accounts = database.data.diesel_accounts.filter(t => !ids.includes(t.id));
    const deleted = before - database.data.diesel_accounts.length;
    if (deleted > 0) database.save();
    res.json({ message: `${deleted} transactions deleted`, deleted });
  });

  app.get('/api/diesel-accounts/excel', async (req, res) => {
    try {
      let txns = database.data.diesel_accounts || [];
      if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
      if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
      const pumps = database.data.diesel_pumps || [];
      const pumpSums = pumps.map(p => {
        const pt = txns.filter(t => t.pump_id === p.id);
        const td = pt.filter(t=>t.txn_type==='debit').reduce((s,t)=>s+t.amount,0);
        const tp = pt.filter(t=>t.txn_type==='payment').reduce((s,t)=>s+t.amount,0);
        return { name:p.name, is_default:p.is_default, td, tp, bal:td-tp, cnt:pt.filter(t=>t.txn_type==='debit').length };
      });
      const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Diesel Account');
      ws.mergeCells('A1:G1'); ws.getCell('A1').value = 'Diesel Account'; ws.getCell('A1').font = { bold: true, size: 14 };
      ws.getCell('A3').value = 'Pump Summary'; ws.getCell('A3').font = { bold: true };
      ['Pump','Diesel(Rs.)','Paid(Rs.)','Balance(Rs.)','Entries'].forEach((h,i) => { const c = ws.getCell(4,i+1); c.value = h; c.font = { bold:true, color:{argb:'FFFFFF'} }; c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'7c2d12'} }; });
      let row = 5;
      pumpSums.forEach(p => { ws.getCell(row,1).value=p.name+(p.is_default?' (Default)':''); ws.getCell(row,2).value=p.td; ws.getCell(row,3).value=p.tp; ws.getCell(row,4).value=p.bal; ws.getCell(row,5).value=p.cnt; row++; });
      row += 2;
      ws.getCell(row,1).value = 'Transactions'; ws.getCell(row,1).font = { bold:true }; row++;
      ['Date','Pump','Type','Truck','Agent','Amount(Rs.)','Description'].forEach((h,i) => { const c = ws.getCell(row,i+1); c.value = h; c.font = { bold:true, color:{argb:'FFFFFF'} }; c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'7c2d12'} }; }); row++;
      txns.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(t => { ws.getCell(row,1).value=t.date||''; ws.getCell(row,2).value=t.pump_name||''; ws.getCell(row,3).value=t.txn_type==='payment'?'Payment':'Diesel'; ws.getCell(row,4).value=t.truck_no||''; ws.getCell(row,5).value=t.agent_name||''; ws.getCell(row,6).value=t.amount||0; ws.getCell(row,7).value=t.description||''; row++; });
      ['A','B','C','D','E','F','G'].forEach(l => ws.getColumn(l).width = 18);
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition','attachment; filename=diesel_account.xlsx');
      await wb.xlsx.write(res); res.end();
    } catch(err) { res.status(500).json({ detail: 'Export failed: '+err.message }); }
  });

  app.get('/api/diesel-accounts/pdf', (req, res) => {
    try {
      let txns = database.data.diesel_accounts || [];
      if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
      if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
      const pumps = database.data.diesel_pumps || [];
      const PDFDocument = require('pdfkit'); const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition','attachment; filename=diesel_account.pdf');
      doc.pipe(res);
      addPdfHeader(doc, 'Diesel Account / Diesel Khata');
      const sumH = ['Pump Name','Total Diesel','Total Paid','Balance','Entries'];
      const sumR = pumps.map(p => { const pt = txns.filter(t=>t.pump_id===p.id); const td=pt.filter(t=>t.txn_type==='debit').reduce((s,t)=>s+t.amount,0); const tp=pt.filter(t=>t.txn_type==='payment').reduce((s,t)=>s+t.amount,0); return [p.name+(p.is_default?' *':''),'Rs.'+td,'Rs.'+tp,'Rs.'+(td-tp),pt.filter(t=>t.txn_type==='debit').length.toString()]; });
      addPdfTable(doc, sumH, sumR, [150,80,80,80,50]); doc.moveDown();
      doc.fontSize(12).text('Transactions',{underline:true}); doc.moveDown(0.5);
      const tH = ['Date','Pump','Type','Truck','Agent','Amount','Desc'];
      const tR = txns.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(t=>[t.date||'',(t.pump_name||'').substring(0,15),t.txn_type==='payment'?'Payment':'Diesel',t.truck_no||'',(t.agent_name||'').substring(0,12),'Rs.'+(t.amount||0),(t.description||'').substring(0,25)]);
      addPdfTable(doc, tH, tR, [60,90,50,70,70,60,150]); doc.end();
    } catch(err) { res.status(500).json({ detail: 'Export failed: '+err.message }); }
  });

  // ===== SERVE FRONTEND (AFTER all API routes) =====
  if (fs.existsSync(PUBLIC_DIR)) {
    app.use(express.static(PUBLIC_DIR));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
      } else {
        res.status(404).json({ detail: 'API endpoint not found' });
      }
    });
  }

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

    // Auto-open browser
    if (process.platform === 'win32' || process.platform === 'darwin') {
      try {
        const openModule = require('open');
        openModule(`http://localhost:${PORT}`);
      } catch (e) {
        console.log(`  Browser mein kholein: http://localhost:${PORT}`);
      }
    }
  });
}

startServer();

// Graceful shutdown - save data
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down... data save ho raha hai...');
  if (database) database.save();
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (database) database.save();
  process.exit(0);
});
