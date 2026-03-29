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
const compression = require('compression');
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
let manualCheckInProgress = false;
const DESKTOP_API_PORT = 9876;
global.DESKTOP_API_PORT = DESKTOP_API_PORT;
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
        const data = JSON.parse(fs.readFileSync(this.dbFile, 'utf8'));
        // Ensure users array exists (migration for older data files)
        if (!data.users || !Array.isArray(data.users) || data.users.length === 0) {
          data.users = [
            { username: 'admin', password: 'admin123', role: 'admin' },
            { username: 'staff', password: 'staff123', role: 'staff' }
          ];
        } else {
          // Ensure default users exist (don't overwrite changed passwords)
          if (!data.users.find(u => u.username === 'admin')) {
            data.users.push({ username: 'admin', password: 'admin123', role: 'admin' });
          }
          if (!data.users.find(u => u.username === 'staff')) {
            data.users.push({ username: 'staff', password: 'staff123', role: 'staff' });
          }
        }
        // Run data migration for old entries missing jama/nikasi
        this.migrateOldEntries(data);
        return data;
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
        company_name: 'NAVKAR AGRO',
        tagline: 'JOLKO, KESINGA',
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
      milling_entries: [],
      bank_accounts: [],
      opening_balances: [],
      gst_opening_balances: {},
      sale_vouchers: [],
      purchase_vouchers: [],
      local_party_accounts: [],
      voucher_payments: [],
      stock_summary: [],
      cash_transactions: [],
      dc_entries: [],
      dc_deliveries: [],
      dc_msp_payments: [],
      gunny_bags: [],
      diesel_accounts: [],
      private_paddy: [],
      truck_owner_payments: [],
      rice_sales: [],
      byproduct_sales: [],
      frk_purchases: [],
      truck_leases: [],
      truck_lease_payments: [],
      staff: [],
      mill_parts: [],
      diesel_pumps: [],
      truck_owner_payments: [],
      msp_payments: [],
      staff_payments: [],
      staff_advances: [],
      staff_attendance: []
    };
  }

  // ============ DATA MIGRATION: Fix old entries missing jama/nikasi ============
  migrateOldEntries(data) {
    if (!data) return;
    // Track migration version to avoid re-running
    if (!data._migrations) data._migrations = {};
    if (data._migrations.accounting_entries_v2) return; // Already migrated

    console.log('[Migration] Starting accounting entries migration (v2)...');
    let created = 0;
    const now = new Date().toISOString();
    if (!data.cash_transactions) data.cash_transactions = [];
    if (!data.local_party_accounts) data.local_party_accounts = [];
    if (!data.diesel_accounts) data.diesel_accounts = [];
    if (!data.truck_payments) data.truck_payments = [];

    // Helper: check if reference exists in cash_transactions
    const refExists = (ref) => data.cash_transactions.some(t => t.reference === ref);

    // 1. Sale Vouchers → create missing ledger entries
    (data.sale_vouchers || []).forEach(sv => {
      const party = (sv.party_name || '').trim();
      const total = parseFloat(sv.total) || 0;
      const cash = parseFloat(sv.cash_paid) || 0;
      const diesel = parseFloat(sv.diesel_paid) || 0;
      const advance = parseFloat(sv.advance) || 0;
      const truck = (sv.truck_no || '').trim();
      const vno = sv.voucher_no || '';
      const base = { kms_year: sv.kms_year || '', season: sv.season || '', created_by: sv.created_by || '', created_at: now, updated_at: now };

      // Party Ledger JAMA
      if (party && total > 0 && !refExists(`sale_voucher:${sv.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: sv.date || '', account: 'ledger', txn_type: 'jama', amount: total, category: party, party_type: 'Sale Book', description: `Sale #${vno} [migrated]`, reference: `sale_voucher:${sv.id}`, ...base });
        created++;
      }
      // Advance
      if (advance > 0 && party && !refExists(`sale_voucher_adv:${sv.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: sv.date || '', account: 'ledger', txn_type: 'nikasi', amount: advance, category: party, party_type: 'Sale Book', description: `Advance - Sale #${vno} [migrated]`, reference: `sale_voucher_adv:${sv.id}`, ...base });
        data.cash_transactions.push({ id: uuidv4(), date: sv.date || '', account: 'cash', txn_type: 'jama', amount: advance, category: party, party_type: 'Sale Book', description: `Advance - Sale #${vno} [migrated]`, reference: `sale_voucher_adv_cash:${sv.id}`, ...base });
        created += 2;
      }
      // Truck cash
      if (cash > 0 && !refExists(`sale_voucher_cash:${sv.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: sv.date || '', account: 'cash', txn_type: 'nikasi', amount: cash, category: truck || party, party_type: truck ? 'Truck' : 'Sale Book', description: `Truck cash - Sale #${vno} [migrated]`, reference: `sale_voucher_cash:${sv.id}`, ...base });
        created++;
        // Truck ledger nikasi
        if (truck) {
          data.cash_transactions.push({ id: uuidv4(), date: sv.date || '', account: 'ledger', txn_type: 'nikasi', amount: cash, category: truck, party_type: 'Truck', description: `Truck cash deduction - Sale #${vno} [migrated]`, reference: `sale_truck_cash:${sv.id}`, ...base });
          created++;
        }
      }
      // Diesel
      if (diesel > 0 && !refExists(`sale_voucher_diesel:${sv.id}`)) {
        const pumpName = (data.diesel_accounts || []).length > 0 ? data.diesel_accounts[data.diesel_accounts.length-1].pump_name || 'Diesel Pump' : 'Diesel Pump';
        data.cash_transactions.push({ id: uuidv4(), date: sv.date || '', account: 'ledger', txn_type: 'jama', amount: diesel, category: pumpName, party_type: 'Diesel', description: `Diesel - Sale #${vno} [migrated]`, reference: `sale_voucher_diesel:${sv.id}`, ...base });
        created++;
        if (truck) {
          data.cash_transactions.push({ id: uuidv4(), date: sv.date || '', account: 'ledger', txn_type: 'nikasi', amount: diesel, category: truck, party_type: 'Truck', description: `Truck diesel deduction - Sale #${vno} [migrated]`, reference: `sale_truck_diesel:${sv.id}`, ...base });
          created++;
        }
      }
    });

    // 2. Purchase Vouchers → create missing ledger entries
    (data.purchase_vouchers || []).forEach(pv => {
      const party = (pv.party_name || '').trim();
      const total = parseFloat(pv.total) || 0;
      const cash = parseFloat(pv.cash_paid) || 0;
      const diesel = parseFloat(pv.diesel_paid) || 0;
      const advance = parseFloat(pv.advance) || 0;
      const truck = (pv.truck_no || '').trim();
      const vno = pv.voucher_no || '';
      const base = { kms_year: pv.kms_year || '', season: pv.season || '', created_by: pv.created_by || '', created_at: now, updated_at: now };

      if (party && total > 0 && !refExists(`purchase_voucher:${pv.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: pv.date || '', account: 'ledger', txn_type: 'jama', amount: total, category: party, party_type: 'Purchase Voucher', description: `Purchase #${vno} [migrated]`, reference: `purchase_voucher:${pv.id}`, ...base });
        created++;
      }
      if (advance > 0 && party && !refExists(`purchase_voucher_adv:${pv.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: pv.date || '', account: 'ledger', txn_type: 'nikasi', amount: advance, category: party, party_type: 'Purchase Voucher', description: `Advance - Purchase #${vno} [migrated]`, reference: `purchase_voucher_adv:${pv.id}`, ...base });
        data.cash_transactions.push({ id: uuidv4(), date: pv.date || '', account: 'cash', txn_type: 'nikasi', amount: advance, category: party, party_type: 'Purchase Voucher', description: `Advance - Purchase #${vno} [migrated]`, reference: `purchase_voucher_adv_cash:${pv.id}`, ...base });
        created += 2;
      }
      if (cash > 0 && !refExists(`purchase_voucher_cash:${pv.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: pv.date || '', account: 'cash', txn_type: 'nikasi', amount: cash, category: truck || party, party_type: truck ? 'Truck' : 'Purchase Voucher', description: `Truck cash - Purchase #${vno} [migrated]`, reference: `purchase_voucher_cash:${pv.id}`, ...base });
        created++;
        if (truck) {
          data.cash_transactions.push({ id: uuidv4(), date: pv.date || '', account: 'ledger', txn_type: 'nikasi', amount: cash, category: truck, party_type: 'Truck', description: `Truck cash deduction - Purchase #${vno} [migrated]`, reference: `purchase_truck_cash:${pv.id}`, ...base });
          created++;
        }
      }
      if (diesel > 0 && !refExists(`purchase_voucher_diesel:${pv.id}`)) {
        const pumpName = (data.diesel_accounts || []).length > 0 ? data.diesel_accounts[data.diesel_accounts.length-1].pump_name || 'Diesel Pump' : 'Diesel Pump';
        data.cash_transactions.push({ id: uuidv4(), date: pv.date || '', account: 'ledger', txn_type: 'jama', amount: diesel, category: pumpName, party_type: 'Diesel', description: `Diesel - Purchase #${vno} [migrated]`, reference: `purchase_voucher_diesel:${pv.id}`, ...base });
        created++;
        if (truck) {
          data.cash_transactions.push({ id: uuidv4(), date: pv.date || '', account: 'ledger', txn_type: 'nikasi', amount: diesel, category: truck, party_type: 'Truck', description: `Truck diesel deduction - Purchase #${vno} [migrated]`, reference: `purchase_truck_diesel:${pv.id}`, ...base });
          created++;
        }
      }
    });

    // 3. Staff Advances → add missing Ledger JAMA
    (data.staff_advances || []).forEach(adv => {
      const staffName = adv.staff_name || 'Staff';
      if (adv.amount > 0 && !refExists(`staff_advance_ledger:${adv.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: adv.date || '', account: 'ledger', txn_type: 'jama', amount: adv.amount, category: staffName, party_type: 'Staff', description: `Staff Advance: ${staffName} [migrated]`, reference: `staff_advance_ledger:${adv.id}`, linked_payment_id: adv.id, kms_year: adv.kms_year || '', season: adv.season || '', created_by: '', created_at: now, updated_at: now });
        created++;
      }
    });

    // 4. Byproduct Sales → add missing Ledger JAMA
    (data.byproduct_sales || []).forEach(bp => {
      const buyer = (bp.buyer_name || '').trim();
      const total = parseFloat(bp.total_amount) || 0;
      if (buyer && total > 0 && !refExists(`byproduct:${bp.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: bp.date || '', account: 'ledger', txn_type: 'jama', amount: total, category: buyer, party_type: 'By-Product Sale', description: `${(bp.product || 'Byproduct')} sale [migrated]`, reference: `byproduct:${bp.id}`, kms_year: bp.kms_year || '', season: bp.season || '', created_by: bp.created_by || '', created_at: now, updated_at: now });
        created++;
      }
    });

    // 5. Mill Parts (purchases with party) → add missing Ledger JAMA
    (data.mill_parts_stock || []).forEach(mp => {
      const party = (mp.party_name || '').trim();
      const total = parseFloat(mp.total_amount) || 0;
      if (mp.txn_type === 'in' && party && total > 0 && !refExists(`lp_mill_part:${mp.id.slice(0,8)}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: mp.date || '', account: 'ledger', txn_type: 'jama', amount: total, category: party, party_type: 'Local Party', description: `Mill Part: ${mp.part_name || ''} [migrated]`, reference: `lp_mill_part:${mp.id.slice(0,8)}`, kms_year: mp.kms_year || '', season: mp.season || '', created_by: mp.created_by || '', created_at: now, updated_at: now });
        created++;
      }
    });

    // 6. Local Party Manual Purchases → add missing Ledger JAMA
    (data.local_party_accounts || []).forEach(lp => {
      if (lp.txn_type === 'debit' && lp.source_type === 'manual') {
        const party = (lp.party_name || '').trim();
        const amt = parseFloat(lp.amount) || 0;
        if (party && amt > 0 && !refExists(`lp_purchase:${lp.id.slice(0,8)}`)) {
          data.cash_transactions.push({ id: uuidv4(), date: lp.date || '', account: 'ledger', txn_type: 'jama', amount: amt, category: party, party_type: 'Local Party', description: `Purchase: ${party} [migrated]`, reference: `lp_purchase:${lp.id.slice(0,8)}`, linked_local_party_id: lp.id, kms_year: lp.kms_year || '', season: lp.season || '', created_by: lp.created_by || '', created_at: now, updated_at: now });
          created++;
        }
      }
    });

    data._migrations.accounting_entries_v2 = { date: now, entries_created: created };
    console.log(`[Migration] Complete: ${created} accounting entries created`);
  }

  save() {
    // Debounced save - prevents excessive disk writes during rapid operations
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._pendingSave = true;
    this._saveTimer = setTimeout(() => this._doSave(), 100);
  }

  saveImmediate() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._doSave();
  }

  _doSave() {
    this._pendingSave = false;
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
    if (!this.data.cash_transactions) this.data.cash_transactions = [];

    const truckNo = newEntry.truck_no || '';
    const entryDate = newEntry.date || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // Auto Jama (Ledger) entry for truck purchase - what we owe the truck
    const finalQntl = Math.round(((newEntry.qntl || 0) - (newEntry.bag || 0) / 100) * 100) / 100;
    if (finalQntl > 0 && truckNo) {
      const existingRateDoc = this.data.truck_payments.find(p => {
        const e = this.data.entries.find(en => en.id === p.entry_id && en.truck_no === truckNo && en.mandi_name === (newEntry.mandi_name || ''));
        return !!e;
      });
      const rate = existingRateDoc ? (existingRateDoc.rate_per_qntl || 32) : 32;
      const grossAmount = Math.round(finalQntl * rate * 100) / 100;
      const cashTaken = parseFloat(newEntry.cash_paid) || 0;
      const dieselTaken = parseFloat(newEntry.diesel_paid) || 0;
      const deductions = cashTaken + dieselTaken;

      this.data.cash_transactions.push({
        id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'jama', category: truckNo,
        party_type: 'Truck',
        description: `Truck Entry: ${truckNo} - ${finalQntl}Q @ Rs.${rate}` + (deductions > 0 ? ` (Ded: Rs.${deductions})` : ''),
        amount: Math.round(grossAmount * 100) / 100, reference: `truck_entry:${newEntry.id.slice(0,8)}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now, updated_at: now
      });

      // Nikasi ledger entry for diesel deduction (counted against truck)
      if (dieselTaken > 0) {
        this.data.cash_transactions.push({
          id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'nikasi', category: truckNo,
          party_type: 'Truck',
          description: `Truck Diesel Advance: ${truckNo} - Rs.${dieselTaken}`,
          amount: Math.round(dieselTaken * 100) / 100, reference: `truck_diesel_ded:${newEntry.id.slice(0,8)}`,
          kms_year: newEntry.kms_year||'', season: newEntry.season||'',
          created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
          created_at: now, updated_at: now
        });
      }
    }

    // Auto Cash Book Nikasi entry for cash_paid
    const cashPaid = parseFloat(newEntry.cash_paid) || 0;
    if (cashPaid > 0) {
      this.data.cash_transactions.push({
        id: uuidv4(), date: entryDate, account: 'cash', txn_type: 'nikasi', category: truckNo || 'Cash Paid (Entry)',
        party_type: 'Truck',
        description: `Cash Paid: Truck ${truckNo} - Mandi ${newEntry.mandi_name||''} - Rs.${cashPaid}`,
        amount: Math.round(cashPaid * 100) / 100, reference: `entry_cash:${newEntry.id.slice(0,8)}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now, updated_at: now
      });
      // Also create Ledger Nikasi entry for cash deduction (counted against truck balance)
      if (truckNo) {
        this.data.cash_transactions.push({
          id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'nikasi', category: truckNo,
          party_type: 'Truck',
          description: `Truck Cash Advance: ${truckNo} - Rs.${cashPaid}`,
          amount: Math.round(cashPaid * 100) / 100, reference: `truck_cash_ded:${newEntry.id.slice(0,8)}`,
          kms_year: newEntry.kms_year||'', season: newEntry.season||'',
          created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
          created_at: now, updated_at: now
        });
      }
    }

    // Auto Diesel Account for diesel_paid
    const dieselPaid = parseFloat(newEntry.diesel_paid) || 0;
    if (dieselPaid > 0) {
      if (!this.data.diesel_accounts) this.data.diesel_accounts = [];
      if (!this.data.diesel_pumps) this.data.diesel_pumps = [];
      const defPump = this.data.diesel_pumps.find(p => p.is_default) || this.data.diesel_pumps[0];
      const pumpName = defPump?.name || 'Default Pump';
      const pumpId = defPump?.id || 'default';

      this.data.diesel_accounts.push({
        id: uuidv4(), date: entryDate,
        pump_id: pumpId, pump_name: pumpName,
        truck_no: truckNo, agent_name: newEntry.agent_name||'',
        mandi_name: newEntry.mandi_name||'',
        amount: Math.round(dieselPaid * 100) / 100, txn_type: 'debit',
        description: `Diesel: Truck ${truckNo} - Mandi ${newEntry.mandi_name||''}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now
      });

      // Also create JAMA (Ledger) entry in cash_transactions for diesel pump
      this.data.cash_transactions.push({
        id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'jama', category: pumpName,
        party_type: 'Diesel',
        description: `Diesel Fill: Truck ${truckNo} - ${pumpName} - Rs.${dieselPaid}`,
        amount: Math.round(dieselPaid * 100) / 100, reference: `diesel_fill:${newEntry.id.slice(0,8)}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now, updated_at: now
      });
    }

    // Auto Gunny Bag entries for g_issued and g_deposite
    this._createGunnyEntriesForMill(newEntry);

    this.save();
    return newEntry;
  }

  _createGunnyEntriesForMill(doc) {
    if (!this.data.gunny_bags) this.data.gunny_bags = [];
    const agent = doc.agent_name || '';
    const mandi = doc.mandi_name || '';
    const source = agent && mandi ? `${agent} - ${mandi}` : (agent || mandi || '');
    const truck = doc.truck_no || '';
    const now = new Date().toISOString();
    const base = { bag_type: 'old', rate: 0, amount: 0, notes: 'Auto from Mill Entry',
      kms_year: doc.kms_year||'', season: doc.season||'',
      created_by: doc.created_by||'system', linked_entry_id: doc.id, created_at: now };

    const bagIn = parseInt(doc.bag) || 0;
    if (bagIn > 0) {
      this.data.gunny_bags.push({ ...base, id: uuidv4(), date: doc.date||'',
        txn_type: 'in', quantity: bagIn, source, reference: truck });
    }
    const gIssued = parseFloat(doc.g_issued) || 0;
    if (gIssued > 0) {
      this.data.gunny_bags.push({ ...base, id: uuidv4(), date: doc.date||'',
        txn_type: 'out', quantity: Math.floor(gIssued), source, reference: truck });
    }
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
      const now = new Date().toISOString();
      const truckNo = updated.truck_no || '';
      const entryDate = updated.date || new Date().toISOString().split('T')[0];

      // Delete all linked cash/diesel entries and recreate
      if (this.data.cash_transactions) this.data.cash_transactions = this.data.cash_transactions.filter(t => t.linked_entry_id !== id);
      if (this.data.diesel_accounts) this.data.diesel_accounts = this.data.diesel_accounts.filter(t => t.linked_entry_id !== id);
      if (!this.data.cash_transactions) this.data.cash_transactions = [];

      // Recreate Jama (Ledger) entry for truck purchase
      const finalQntl = Math.round(((updated.qntl || 0) - (updated.bag || 0) / 100) * 100) / 100;
      if (finalQntl > 0 && truckNo) {
        const paymentDoc = this.data.truck_payments.find(p => p.entry_id === id);
        const rate = paymentDoc ? (paymentDoc.rate_per_qntl || 32) : 32;
        const grossAmount = Math.round(finalQntl * rate * 100) / 100;
        const cashTaken = parseFloat(updated.cash_paid) || 0;
        const dieselTaken = parseFloat(updated.diesel_paid) || 0;
        const deductions = cashTaken + dieselTaken;

        this.data.cash_transactions.push({
          id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'jama', category: truckNo,
          party_type: 'Truck',
          description: `Truck Entry: ${truckNo} - ${finalQntl}Q @ Rs.${rate}` + (deductions > 0 ? ` (Ded: Rs.${deductions})` : ''),
          amount: Math.round(grossAmount * 100) / 100, reference: `truck_entry:${id.slice(0,8)}`,
          kms_year: updated.kms_year||'', season: updated.season||'',
          created_by: updated.created_by||'system', linked_entry_id: id,
          created_at: now, updated_at: now
        });

        if (dieselTaken > 0) {
          this.data.cash_transactions.push({
            id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'nikasi', category: truckNo,
            party_type: 'Truck',
            description: `Truck Diesel Advance: ${truckNo} - Rs.${dieselTaken}`,
            amount: Math.round(dieselTaken * 100) / 100, reference: `truck_diesel_ded:${id.slice(0,8)}`,
            kms_year: updated.kms_year||'', season: updated.season||'',
            created_by: updated.created_by||'system', linked_entry_id: id,
            created_at: now, updated_at: now
          });
        }
      }

      // Recreate Cash Book Nikasi entry for cash_paid
      const cashPaid = parseFloat(updated.cash_paid) || 0;
      if (cashPaid > 0) {
        this.data.cash_transactions.push({
          id: uuidv4(), date: entryDate, account: 'cash', txn_type: 'nikasi', category: truckNo || 'Cash Paid (Entry)',
          party_type: 'Truck',
          description: `Cash Paid: Truck ${truckNo} - Mandi ${updated.mandi_name||''} - Rs.${cashPaid}`,
          amount: Math.round(cashPaid * 100) / 100, reference: `entry_cash:${id.slice(0,8)}`,
          kms_year: updated.kms_year||'', season: updated.season||'',
          created_by: updated.created_by||'system', linked_entry_id: id,
          created_at: now, updated_at: now
        });
        // Also create Ledger Nikasi entry for cash deduction (counted against truck balance)
        if (truckNo) {
          this.data.cash_transactions.push({
            id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'nikasi', category: truckNo,
            party_type: 'Truck',
            description: `Truck Cash Advance: ${truckNo} - Rs.${cashPaid}`,
            amount: Math.round(cashPaid * 100) / 100, reference: `truck_cash_ded:${id.slice(0,8)}`,
            kms_year: updated.kms_year||'', season: updated.season||'',
            created_by: updated.created_by||'system', linked_entry_id: id,
            created_at: now, updated_at: now
          });
        }
      }

      // Recreate diesel account and diesel JAMA ledger entry
      const dieselPaid = parseFloat(updated.diesel_paid) || 0;
      if (dieselPaid > 0) {
        if (!this.data.diesel_accounts) this.data.diesel_accounts = [];
        if (!this.data.diesel_pumps) this.data.diesel_pumps = [];
        const defPump = this.data.diesel_pumps.find(p => p.is_default) || this.data.diesel_pumps[0];
        const pumpName = defPump?.name || 'Default Pump';
        const pumpId = defPump?.id || 'default';

        this.data.diesel_accounts.push({
          id: uuidv4(), date: entryDate, pump_id: pumpId, pump_name: pumpName,
          truck_no: truckNo, agent_name: updated.agent_name||'', mandi_name: updated.mandi_name||'',
          amount: Math.round(dieselPaid * 100) / 100, txn_type: 'debit',
          description: `Diesel: Truck ${truckNo} - Mandi ${updated.mandi_name||''}`,
          kms_year: updated.kms_year||'', season: updated.season||'',
          created_by: updated.created_by||'system', linked_entry_id: id,
          created_at: now
        });

        this.data.cash_transactions.push({
          id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'jama', category: pumpName,
          party_type: 'Diesel',
          description: `Diesel Fill: Truck ${truckNo} - ${pumpName} - Rs.${dieselPaid}`,
          amount: Math.round(dieselPaid * 100) / 100, reference: `diesel_fill:${id.slice(0,8)}`,
          kms_year: updated.kms_year||'', season: updated.season||'',
          created_by: updated.created_by||'system', linked_entry_id: id,
          created_at: now, updated_at: now
        });
      }

      // Update auto gunny bag entries (delete old + recreate)
      if (this.data.gunny_bags) this.data.gunny_bags = this.data.gunny_bags.filter(g => g.linked_entry_id !== id);
      this._createGunnyEntriesForMill(updated);

      this.save();
      return updated;
    }
    return null;
  }

  deleteEntry(id) {
    this.data.entries = this.data.entries.filter(e => e.id !== id);
    if (this.data.cash_transactions) this.data.cash_transactions = this.data.cash_transactions.filter(t => t.linked_entry_id !== id);
    if (this.data.diesel_accounts) this.data.diesel_accounts = this.data.diesel_accounts.filter(t => t.linked_entry_id !== id);
    if (this.data.gunny_bags) this.data.gunny_bags = this.data.gunny_bags.filter(g => g.linked_entry_id !== id);
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

// Cleanup duplicate backup folders created by Google Drive sync conflicts
function cleanupDuplicateBackupFolders() {
  if (!dataPath) return;
  try {
    const items = fs.readdirSync(dataPath);
    const dupeFolders = items.filter(name => /^backups\s*\(\d+\)$/.test(name));
    const mainDir = getBackupDir();
    for (const folder of dupeFolders) {
      const folderPath = path.join(dataPath, folder);
      try {
        const stat = fs.statSync(folderPath);
        if (stat.isDirectory()) {
          // Move any backup files to main backups folder
          const files = fs.readdirSync(folderPath).filter(f => f.startsWith('backup_') && f.endsWith('.json'));
          for (const file of files) {
            const src = path.join(folderPath, file);
            const dest = path.join(mainDir, file);
            if (!fs.existsSync(dest)) {
              try { fs.copyFileSync(src, dest); } catch(_) {}
            }
          }
          // Remove the duplicate folder
          fs.rmSync(folderPath, { recursive: true, force: true });
          logError('BACKUP_CLEANUP', `Removed duplicate folder: ${folder}`);
        }
      } catch (_) {}
    }
  } catch (_) {}
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
  // NOTE: compression() removed entirely - localhost pe compression unnecessary hai
  // aur PDFKit streaming ke saath ERR_STREAM_WRITE_AFTER_END crash karta hai
  apiApp.use(cors());
  apiApp.use(express.json({ limit: '5mb' }));

  // ===== LOAD ALL MODULAR ROUTE MODULES (each isolated so one failure doesn't kill all) =====
  const routeDefs = [
    { name: 'auth', load: () => require('./routes/auth')(database) },
    { name: 'entries', load: () => require('./routes/entries')(database) },
    { name: 'dashboard', load: () => require('./routes/dashboard')(database) },
    { name: 'payments', load: () => require('./routes/payments')(database) },
    { name: 'cashbook', load: () => require('./routes/cashbook')(database) },
    { name: 'dc_payments', load: () => require('./routes/dc_payments')(database) },
    { name: 'gunny_bags', load: () => require('./routes/gunny_bags')(database) },
    { name: 'milling', load: () => require('./routes/milling')(database) },
    { name: 'private_trading', load: () => require('./routes/private_trading')(database) },
    { name: 'reports', load: () => require('./routes/reports')(database) },
    { name: 'diesel', load: () => require('./routes/diesel')(database) },
    { name: 'exports', load: () => require('./routes/exports')(database) },
    { name: 'backups', load: () => require('./routes/backups')(database, { getBackupsList, createBackup, restoreBackup, getBackupDir, MAX_BACKUPS }) },
    { name: 'mill_parts', load: () => require('./routes/mill_parts')(database) },
    { name: 'staff', load: () => require('./routes/staff')(database) },
    { name: 'daily_report', load: () => require('./routes/daily_report')(database) },
    { name: 'reports_pnl', load: () => require('./routes/reports_pnl')(database) },
    { name: 'local_party', load: () => require('./routes/local_party')(database) },
    { name: 'import_excel', load: () => require('./routes/import_excel')(database) },
    { name: 'fy_summary', load: () => require('./routes/fy_summary')(database) },
    { name: 'telegram', load: () => require('./routes/telegram')(database) },
    { name: 'bank_accounts', load: () => require('./routes/bank_accounts')(database) },
    { name: 'gst_ledger', load: () => require('./routes/gst_ledger')(database) },
    { name: 'voucher_payments', load: () => require('./routes/voucher_payments')(database) },
    { name: 'salebook', load: () => require('./routes/salebook')(database) },
    { name: 'purchase_vouchers', load: () => require('./routes/purchase_vouchers')(database) },
    { name: 'truck_lease', load: () => require('./routes/truck_lease')(database) },
    { name: 'hemali', load: () => require('./routes/hemali')(database) },
    { name: 'whatsapp', load: () => require('./routes/whatsapp')(database) },
    { name: 'gst_invoice', load: () => require('./routes/gst_invoice')(database) },
  ];

  let loadedCount = 0;
  let failedRoutes = [];
  for (const rd of routeDefs) {
    try {
      apiApp.use(rd.load());
      loadedCount++;
    } catch (e) {
      failedRoutes.push(rd.name);
      console.error(`[Routes] FAILED to load "${rd.name}":`, e.message);
      logError('ROUTE_LOAD_FAIL_' + rd.name, e);
    }
  }
  console.log(`[Routes] Loaded ${loadedCount}/${routeDefs.length} routes.` + (failedRoutes.length ? ` Failed: ${failedRoutes.join(', ')}` : ''));

  // Delete all data endpoint
  apiApp.post('/api/delete-all-data', safeAsync(async (req, res) => {
    const collections = ['entries', 'dc_entries', 'dc_deliveries', 'dc_msp_payments',
      'sale_vouchers', 'purchase_vouchers', 'gunny_bags', 'cash_transactions',
      'opening_balances', 'gst_opening_balances', 'local_party_accounts', 'party_ledger',
      'mandi_targets', 'voucher_payments', 'stock_summary', 'truck_payments', 'agent_payments',
      'milling_entries', 'diesel_accounts', 'bank_accounts'];
    const deleted = {};
    for (const col of collections) {
      const count = (database.data[col] || []).length || 0;
      if (Array.isArray(database.data[col])) database.data[col] = [];
      else if (typeof database.data[col] === 'object') database.data[col] = {};
      deleted[col] = count;
    }
    database.save();
    res.json({ message: 'All data cleared', deleted });
  }));

  // Debug endpoint to check route loading status
  apiApp.get('/api/debug/routes', safeSync((req, res) => {
    res.json({ loaded: loadedCount, total: routeDefs.length, failed: failedRoutes, version: require('./package.json').version });
  }));

  // ===== ONE-TIME STARTUP: Cleanup orphaned auto-ledger entries & fix data issues =====
  try {
    const txns = database.data.cash_transactions || [];
    let fixCount = 0;
    
    // 1. Find and remove orphaned auto_ledger entries
    const autoLedgers = txns.filter(t => (t.reference || '').startsWith('auto_ledger:'));
    const validIdPrefixes = new Set(txns.filter(t => !(t.reference || '').startsWith('auto_ledger:')).map(t => (t.id || '').slice(0, 8)));
    const orphanedRefs = [];
    autoLedgers.forEach(al => {
      const parentPrefix = (al.reference || '').replace('auto_ledger:', '');
      if (parentPrefix && !validIdPrefixes.has(parentPrefix)) {
        orphanedRefs.push(al.reference);
      }
    });
    if (orphanedRefs.length > 0) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => !orphanedRefs.includes(t.reference));
      fixCount += orphanedRefs.length;
      console.log(`[Cleanup] Removed ${orphanedRefs.length} orphaned auto-ledger entries`);
    }
    
    // 2. Fix auto-ledger entries that have wrong txn_type (should always be 'nikasi')
    let fixedTxnType = 0;
    (database.data.cash_transactions || []).forEach(t => {
      if ((t.reference || '').startsWith('auto_ledger:') && t.account === 'ledger' && t.txn_type !== 'nikasi') {
        t.txn_type = 'nikasi';
        fixedTxnType++;
      }
    });
    if (fixedTxnType > 0) {
      fixCount += fixedTxnType;
      console.log(`[Cleanup] Fixed ${fixedTxnType} auto-ledger entries with wrong txn_type`);
    }
    
    // 3. Retroactive party_type fix - fill empty party_type from same category entries
    let fixedPartyType = 0;
    const partyTypeMap = {};
    (database.data.cash_transactions || []).forEach(t => {
      if (t.category && t.party_type) {
        partyTypeMap[t.category.toLowerCase()] = t.party_type;
      }
    });
    (database.data.cash_transactions || []).forEach(t => {
      if (t.category && (!t.party_type || t.party_type === '')) {
        const knownType = partyTypeMap[t.category.toLowerCase()];
        if (knownType) {
          t.party_type = knownType;
          fixedPartyType++;
        }
      }
    });
    if (fixedPartyType > 0) {
      fixCount += fixedPartyType;
      console.log(`[Cleanup] Fixed ${fixedPartyType} entries with missing party_type`);
    }

    // 4. Hemali integrity check - reconcile hemali payments with cashbook
    let hemaliFixed = 0;
    const hemaliPayments = database.data.hemali_payments || [];
    const cashTxns = database.data.cash_transactions || [];
    if (!database.data.local_party_accounts) database.data.local_party_accounts = [];

    // 4a. Paid hemali payments without cashbook entry → revert to unpaid
    hemaliPayments.filter(p => p.status === 'paid').forEach(p => {
      const hasCashEntry = cashTxns.some(t => t.reference === `hemali_payment:${p.id}`);
      if (!hasCashEntry) {
        p.status = 'unpaid';
        p.updated_at = new Date().toISOString();
        database.data.cash_transactions = database.data.cash_transactions.filter(t =>
          t.reference !== `hemali_work:${p.id}` && t.reference !== `hemali_paid:${p.id}`
        );
        database.data.local_party_accounts = (database.data.local_party_accounts || []).filter(t =>
          t.reference !== `hemali_debit:${p.id}` && t.reference !== `hemali_paid:${p.id}`
        );
        hemaliFixed++;
        console.log(`[Hemali] Reverted payment ${p.id} to unpaid (no cashbook entry)`);
      }
    });

    // 4b. Paid hemali payments without ledger entries → create them
    hemaliPayments.filter(p => p.status === 'paid').forEach(p => {
      const hasLedger = database.data.cash_transactions.some(t => t.reference === `hemali_work:${p.id}`);
      if (!hasLedger) {
        const { v4: _uuid } = require('uuid');
        const itemsDesc = (p.items || []).map(i => `${i.item_name} x${i.quantity}`).join(', ');
        const sardar = p.sardar_name || '';
        let advInfo = '';
        if ((p.advance_deducted || 0) > 0) advInfo += ` | Adv Deducted: Rs.${Math.round(p.advance_deducted)}`;
        if ((p.new_advance || 0) > 0) advInfo += ` | New Advance: Rs.${Math.round(p.new_advance)}`;
        const base = { kms_year: p.kms_year || '', season: p.season || '', created_by: p.created_by || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        col('cash_transactions').push({
          id: _uuid(), date: p.date, account: 'ledger', txn_type: 'jama',
          amount: p.total || 0, category: 'Hemali Payment', party_type: 'Hemali',
          description: `${sardar} - ${itemsDesc} | Total: Rs.${Math.round(p.total || 0)}`,
          reference: `hemali_work:${p.id}`, ...base
        });
        col('cash_transactions').push({
          id: _uuid(), date: p.date, account: 'ledger', txn_type: 'nikasi',
          amount: p.amount_paid || 0, category: 'Hemali Payment', party_type: 'Hemali',
          description: `${sardar} - Paid Rs.${Math.round(p.amount_paid || 0)}${advInfo}`,
          reference: `hemali_paid:${p.id}`, ...base
        });
        // Also create local_party_accounts debit + payment if missing
        if (!(database.data.local_party_accounts || []).some(t => t.reference === `hemali_debit:${p.id}`)) {
          database.data.local_party_accounts.push({
            id: _uuid(), date: p.date, party_name: 'Hemali Payment',
            txn_type: 'debit', amount: p.total || 0,
            description: `${sardar} - ${itemsDesc} | Total: Rs.${Math.round(p.total || 0)}`,
            reference: `hemali_debit:${p.id}`, source_type: 'hemali', ...base
          });
        }
        if (!(database.data.local_party_accounts || []).some(t => t.reference === `hemali_paid:${p.id}`)) {
          database.data.local_party_accounts.push({
            id: _uuid(), date: p.date, party_name: 'Hemali Payment',
            txn_type: 'payment', amount: p.amount_paid || 0,
            description: `${sardar} - Paid Rs.${Math.round(p.amount_paid || 0)}${advInfo}`,
            reference: `hemali_paid:${p.id}`, source_type: 'hemali', ...base
          });
        }
        hemaliFixed++;
        console.log(`[Hemali] Created missing ledger entries for payment ${p.id}`);
      }
    });

    if (hemaliFixed > 0) {
      fixCount += hemaliFixed;
      console.log(`[Hemali] Integrity check: fixed ${hemaliFixed} payments`);
    }

    // 4c. Clean orphaned local_party_accounts with old hemali references
    const hemaliIds = new Set(hemaliPayments.map(p => p.id));
    const beforeLpCount = database.data.local_party_accounts.length;
    database.data.local_party_accounts = database.data.local_party_accounts.filter(t => {
      const ref = t.reference || '';
      // Clean old-style hemali entries (hemali_work, hemali_paid from local_party_accounts that aren't in new format)
      if (t.source_type === 'hemali' || ref.startsWith('hemali_')) {
        const pidMatch = ref.match(/hemali_(?:debit|paid|work):(.+)/);
        if (pidMatch && !hemaliIds.has(pidMatch[1])) {
          console.log(`[Hemali] Removed orphaned local_party entry: ${ref}`);
          return false;
        }
      }
      return true;
    });
    const removedLp = beforeLpCount - database.data.local_party_accounts.length;
    if (removedLp > 0) {
      fixCount += removedLp;
      console.log(`[Hemali] Removed ${removedLp} orphaned local_party_accounts entries`);
    }

    // Also clean orphaned cash_transactions with hemali references
    const beforeCashCount = database.data.cash_transactions.length;
    database.data.cash_transactions = database.data.cash_transactions.filter(t => {
      const ref = t.reference || '';
      if (ref.startsWith('hemali_')) {
        const pidMatch = ref.match(/hemali_(?:payment|work|paid):(.+)/);
        if (pidMatch && !hemaliIds.has(pidMatch[1])) {
          console.log(`[Hemali] Removed orphaned cash_transaction: ${ref}`);
          return false;
        }
      }
      return true;
    });
    const removedCash = beforeCashCount - database.data.cash_transactions.length;
    if (removedCash > 0) {
      fixCount += removedCash;
      console.log(`[Hemali] Removed ${removedCash} orphaned cash_transactions entries`);
    }
    
    if (fixCount > 0) {
      database.save();
      console.log(`[Cleanup] Total ${fixCount} fixes applied and saved`);
    } else {
      console.log('[Cleanup] No data issues found');
    }
  } catch (e) {
    console.error('[Cleanup] Error:', e.message);
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
    // Serve static assets (JS/CSS/images) but NOT index.html (we inject API URL into it)
    apiApp.use(express.static(frontendDir, {
      index: false,
      maxAge: '1y',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    }));
    // Serve index.html with API URL injected BEFORE React loads
    apiApp.get('*', safeSync((req, res) => {
      if (!req.path.startsWith('/api')) {
        let html = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
        const activePort = server ? server.address().port : DESKTOP_API_PORT;
        html = html.replace('<head>', `<head><script>window.ELECTRON_API_URL='http://127.0.0.1:${activePort}';window.REACT_APP_BACKEND_URL='http://127.0.0.1:${activePort}';</script>`);
        res.type('html').send(html);
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
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      spellcheck: false,
      v8CacheOptions: 'code'
    }
  });

  // Show window as soon as DOM is ready (faster perceived startup)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Fallback: show after 4 seconds even if ready-to-show hasn't fired
  const showTimeout = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 4000);

  mainWindow.once('show', () => clearTimeout(showTimeout));

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
        // Use IPC to show update status in custom React UI instead of native dialog
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-checking');
        }
        manualCheckInProgress = true;
        autoUpdater.checkForUpdates().then(result => {
          if (!result || !result.updateInfo || !result.updateInfo.version) {
            manualCheckInProgress = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-not-available', { currentVersion: app.getVersion() });
            }
          }
        }).catch(() => {
          manualCheckInProgress = false;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-not-available', { currentVersion: app.getVersion() });
          }
        });
      }},
      { type: 'separator' },
      { label: 'Error Log Dekhein', accelerator: 'Ctrl+Shift+L', click: () => {
        try {
          if (fs.existsSync(errorLogPath)) {
            shell.openPath(errorLogPath);
          } else {
            dialog.showMessageBox(mainWindow, { type: 'info', title: 'Error Log', message: 'Koi error log nahi mila. App sahi chal raha hai!' });
          }
        } catch (err) { logError('MENU_OPEN_LOG', err); }
      }},
      { label: 'Developer Console', accelerator: 'Ctrl+Shift+I', click: () => {
        if (mainWindow) mainWindow.webContents.toggleDevTools();
      }},
      { label: 'Error Log Clear Karein', click: () => {
        try {
          fs.writeFileSync(errorLogPath, `[${new Date().toISOString()}] Error log cleared by user\n`);
          dialog.showMessageBox(mainWindow, { type: 'info', title: 'Error Log', message: 'Error log clear ho gaya!' });
        } catch (err) { logError('CLEAR_LOG', err); }
      }},
      { type: 'separator' },
      { label: 'About', click: () => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'About - Mill Entry System',
          message: 'Mill Entry System',
          detail: 'Version: v' + app.getVersion() + '\n\nDesigned By: 9x.Design\nContact: +91 72059 30002\n\nError Log: ' + errorLogPath,
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
    mainWindow.webContents.focus();
    // Start auto-update check after window is shown
    setupAutoUpdater();
  });

  // Fix: Ensure webContents focus when window is focused (fixes typing issue)
  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.focus();
    }
  });

  // Fix: Re-focus webContents after any dialog closes
  mainWindow.on('show', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      setTimeout(() => mainWindow.webContents.focus(), 100);
    }
  });

  // Fix: IPC force-focus handler - most reliable approach
  ipcMain.on('force-focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isFocused()) mainWindow.focus();
      if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.focus();
      }
    }
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
    mainWindow.webContents.send('update-available', {
      version: info.version,
      currentVersion: app.getVersion(),
      releaseDate: info.releaseDate || '',
    });
  });

  // Track manual check in the global variable (manualCheckInProgress)

  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date');
    // Only show "up to date" UI if manually triggered
    if (manualCheckInProgress && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available', { currentVersion: app.getVersion() });
    }
    manualCheckInProgress = false;
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log('Download progress: ' + pct + '%');
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('download-progress', {
      percent: pct,
      bytesPerSecond: progress.bytesPerSecond || 0,
      transferred: progress.transferred || 0,
      total: progress.total || 0,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('Update downloaded');
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    console.log('Auto-updater error:', err.message);
    // Only show error UI if manually triggered, skip silent auto-check errors
    if (manualCheckInProgress && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', err.message);
    }
    manualCheckInProgress = false;
  });

  // IPC handlers for update actions from renderer
  ipcMain.on('start-update-download', () => {
    autoUpdater.downloadUpdate();
  });
  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.on('dismiss-update', () => {
    // User dismissed - do nothing
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

// ============ ERROR REPORTING IPC HANDLERS ============
ipcMain.on('log-frontend-error', (event, { context, message, stack }) => {
  logError(`FRONTEND:${context}`, `${message}\n${stack || ''}`);
});

ipcMain.on('open-error-log', () => {
  try {
    if (fs.existsSync(errorLogPath)) {
      shell.openPath(errorLogPath);
    } else {
      dialog.showMessageBox({ type: 'info', title: 'Error Log', message: 'Koi error log nahi mila. App sahi chal raha hai!' });
    }
  } catch (err) {
    logError('OPEN_ERROR_LOG', err);
  }
});

// ============ APPLICATION STARTUP ============
async function startApplication(folderPath) {
  const startTime = Date.now();
  dataPath = folderPath;
  
  // Show loading state on splash screen immediately
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(`
      document.querySelector('.content').innerHTML = '<div style="text-align:center;padding:60px 20px;"><div style="font-size:50px;margin-bottom:15px;">⏳</div><h2 style="color:#f59e0b;margin-bottom:10px;">Loading Data...</h2><p style="color:#94a3b8;font-size:13px;">Database initialize ho raha hai</p><div id="load-status" style="margin-top:20px;color:#64748b;font-size:12px;">Reading data file...</div></div>';
    `).catch(() => {});
  }
  
  // Update config (fast - tiny file)
  const config = loadConfig();
  config.recentPaths = [folderPath, ...config.recentPaths.filter(p => p !== folderPath)].slice(0, 5);
  config.lastPath = null;
  saveConfig(config);

  // Initialize database
  console.log('[Startup] Loading database...');
  db = new JsonDatabase(folderPath);
  console.log(`[Startup] Database loaded in ${Date.now() - startTime}ms`);

  // === MIGRATION: Fix auto_ledger txn_type (v31 - double-entry fix) ===
  try {
    const migrationKey = 'migration_auto_ledger_v31';
    if (!db.data._migrations || !db.data._migrations[migrationKey]) {
      console.log('[Migration] Running auto_ledger txn_type fix...');
      let fixed = 0;
      const txns = db.data.cash_transactions || [];
      const autoLedgers = txns.filter(t => t.reference && t.reference.startsWith('auto_ledger:'));
      for (const al of autoLedgers) {
        const origIdShort = al.reference.replace('auto_ledger:', '');
        const orig = txns.find(t => t.id && t.id.startsWith(origIdShort) && t.account !== 'ledger');
        if (orig) {
          const correctType = orig.txn_type === 'jama' ? 'nikasi' : 'jama';
          if (al.txn_type !== correctType) {
            al.txn_type = correctType;
            fixed++;
          }
        }
      }
      if (!db.data._migrations) db.data._migrations = {};
      db.data._migrations[migrationKey] = { date: new Date().toISOString(), fixed };
      db.save();
      console.log(`[Migration] Fixed ${fixed} auto_ledger entries`);
    }
  } catch (migErr) {
    console.error('[Migration] Error:', migErr.message);
  }
  
  // Update loading status
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(`
      document.getElementById('load-status').textContent = 'Starting server...';
    `).catch(() => {});
  }

  // Start API server
  console.log('[Startup] Creating API server...');
  const port = await createApiServer(db);
  console.log(`[Startup] Server ready in ${Date.now() - startTime}ms`);

  // Close splash and open main window immediately
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
  await createMainWindow(port);
  console.log(`[Startup] Window created in ${Date.now() - startTime}ms`);

  // Deferred tasks - run AFTER window is visible (non-blocking)
  setTimeout(() => {
    if (!hasTodayBackup() && db && fs.existsSync(db.dbFile)) {
      createBackup(db, 'startup');
    }
    // Cleanup duplicate backup folders (Google Drive sync conflict)
    cleanupDuplicateBackupFolders();
  }, 3000);

  // Daily backup check
  setInterval(() => { if (!hasTodayBackup()) createBackup(db, 'daily'); }, 60 * 60 * 1000);

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
    http.get(`http://127.0.0.1:${server.address().port}/api/health`, () => {}).on('error', (err) => {
      logError('SERVER_WATCHDOG_PING_FAIL', err.message);
    });
  }, 30000);
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
