/**
 * Mill Entry System - Standalone Local Server
 * Same web version, runs on localhost, data saved locally
 * Usage: node server.js
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { roundAmount } = require('./routes/safe_handler');


const PORT = 8080;
let DATA_DIR = null;  // Will be set after user input
let BACKUP_DIR = null;
let dbEngine = 'sqlite';
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
    // Debounced save - prevents excessive disk writes
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._doSave(), 300);
  }

  saveImmediate() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._doSave();
  }

  _doSave() {
    try {
      fs.writeFileSync(this.dbFile, JSON.stringify(this.data, null, 2));
      this._lastOwnSaveTime = Date.now();
    } catch (e) {
      console.error('[DB] Save error:', e.message);
    }
  }

  // --- Google Drive / External Sync File Watcher ---
  startFileWatcher() {
    if (this._fileWatcher) return;
    this._lastOwnSaveTime = Date.now();
    this._lastKnownMtime = 0;
    try {
      const stat = fs.statSync(this.dbFile);
      this._lastKnownMtime = stat.mtimeMs;
    } catch (_) {}

    this._fileWatcher = setInterval(() => {
      try {
        if (!fs.existsSync(this.dbFile)) return;
        const stat = fs.statSync(this.dbFile);
        const fileMtime = stat.mtimeMs;
        if (fileMtime > this._lastKnownMtime && (fileMtime - this._lastOwnSaveTime) > 2000) {
          console.log('[FileWatcher] External file change detected, reloading data...');
          this._lastKnownMtime = fileMtime;
          const newData = JSON.parse(fs.readFileSync(this.dbFile, 'utf8'));
          this.data = newData;
          console.log('[FileWatcher] Data reloaded. Entries:', (this.data.entries || []).length);
        } else {
          this._lastKnownMtime = fileMtime;
        }
      } catch (_) {}
    }, 5000);
  }

  stopFileWatcher() {
    if (this._fileWatcher) {
      clearInterval(this._fileWatcher);
      this._fileWatcher = null;
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
      // Critical security operation - persist immediately, no debounce
      this.saveImmediate();
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
    
    entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return entries;
  }

  getEntriesPaginated(filters = {}) {
    const entries = this.getEntries(filters);
    const total = entries.length;
    const pageSize = parseInt(filters.page_size) || 200;
    const page = parseInt(filters.page) || 1;
    let paged = entries;
    if (pageSize > 0) {
      const skip = (page - 1) * pageSize;
      paged = entries.slice(skip, skip + pageSize);
    }
    return { entries: paged, total, page, page_size: pageSize, total_pages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1 };
  }

  /**
   * Recompute consolidated Agent ledger jama for (mandi, kms_year, season).
   * Upserts a SINGLE row per group — total achieved QNTL × base_rate accumulates.
   */
  recomputeAgentLedger(mandiName, kmsYear, season, username) {
    if (!mandiName) return;
    if (!this.data.cash_transactions) this.data.cash_transactions = [];
    const refKey = `agent_mandi:${mandiName}|${kmsYear || ''}|${season || ''}`;
    const target = (this.data.mandi_targets || []).find(t =>
      t.mandi_name === mandiName &&
      (t.kms_year || '') === (kmsYear || '') &&
      (t.season || '') === (season || '')
    );
    if (!target) {
      this.data.cash_transactions = this.data.cash_transactions.filter(t => t.reference !== refKey);
      return;
    }
    const entries = (this.data.entries || []).filter(e =>
      e.mandi_name === mandiName &&
      (e.kms_year || '') === (kmsYear || '') &&
      (e.season || '') === (season || '')
    );
    if (entries.length === 0) {
      this.data.cash_transactions = this.data.cash_transactions.filter(t => t.reference !== refKey);
      return;
    }
    const totalFinalW = entries.reduce((s, e) => s + (parseFloat(e.final_w) || 0), 0);
    const totalQntl = Math.round((totalFinalW / 100) * 100) / 100;
    const baseRate = Number(target.base_rate) || 10;
    const amount = Math.round(totalQntl * baseRate * 100) / 100;
    const latestDate = entries.reduce((d, e) => (e.date && e.date > d) ? e.date : d, '');
    if (totalQntl <= 0 || amount <= 0) {
      this.data.cash_transactions = this.data.cash_transactions.filter(t => t.reference !== refKey);
      return;
    }
    const description = `Agent Entry: ${mandiName} - ${totalQntl}Q × Rs.${baseRate} = Rs.${amount} (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'})`;
    const nowIso = new Date().toISOString();
    const idx = this.data.cash_transactions.findIndex(t => t.reference === refKey);
    if (idx === -1) {
      this.data.cash_transactions.push({
        id: uuidv4(),
        date: latestDate, account: 'ledger', txn_type: 'jama',
        category: mandiName, party_type: 'Agent',
        description, amount, reference: refKey,
        kms_year: kmsYear || '', season: season || '',
        linked_target_id: target.id || '',
        created_by: username || 'system',
        created_at: nowIso, updated_at: nowIso,
      });
    } else {
      Object.assign(this.data.cash_transactions[idx], {
        date: latestDate, description, amount,
        kms_year: kmsYear || '', season: season || '',
        linked_target_id: target.id || '',
        updated_at: nowIso,
      });
    }
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
    if (!this.data.cash_transactions) this.data.cash_transactions = [];

    const truckNo = newEntry.truck_no || '';
    const entryDate = newEntry.date || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // Auto Jama (Ledger) entry for truck purchase
    const finalQntl = Math.round(((newEntry.qntl || 0) - (newEntry.bag || 0) / 100) * 100) / 100;
    if (finalQntl > 0 && truckNo) {
      const existingRateDoc = this.data.truck_payments.find(p => {
        const e = this.data.entries.find(en => en.id === p.entry_id && en.truck_no === truckNo && en.mandi_name === (newEntry.mandi_name || ''));
        return !!e;
      });
      const rate = existingRateDoc ? (existingRateDoc.rate_per_qntl ?? 0) : 0;
      const grossAmount = roundAmount(finalQntl * rate);
      const cashTaken = parseFloat(newEntry.cash_paid) || 0;
      const dieselTaken = parseFloat(newEntry.diesel_paid) || 0;
      const deductions = cashTaken + dieselTaken;

      this.data.cash_transactions.push({
        id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'jama', category: truckNo,
        party_type: 'Truck',
        description: `Truck Entry: ${truckNo} - ${finalQntl}Q @ Rs.${rate}` + (deductions > 0 ? ` (Ded: Rs.${deductions})` : ''),
        amount: roundAmount(grossAmount), reference: `truck_entry:${newEntry.id.slice(0,8)}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now, updated_at: now
      });

      if (dieselTaken > 0) {
        this.data.cash_transactions.push({
          id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'nikasi', category: truckNo,
          party_type: 'Truck',
          description: `Truck Diesel Advance: ${truckNo} - Rs.${dieselTaken}`,
          amount: roundAmount(dieselTaken), reference: `truck_diesel_ded:${newEntry.id.slice(0,8)}`,
          kms_year: newEntry.kms_year||'', season: newEntry.season||'',
          created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
          created_at: now, updated_at: now
        });
      }
    }

    // Auto Jama (Ledger) entry for AGENT — CONSOLIDATED per (mandi, kms_year, season)
    this.recomputeAgentLedger(
      newEntry.mandi_name || '',
      newEntry.kms_year || '',
      newEntry.season || '',
      newEntry.created_by || 'system',
    );

    // Auto Cash Book Nikasi for cash_paid
    const cashPaid = parseFloat(newEntry.cash_paid) || 0;
    if (cashPaid > 0) {
      this.data.cash_transactions.push({
        id: uuidv4(), date: entryDate, account: 'cash', txn_type: 'nikasi', category: truckNo || 'Cash Paid (Entry)',
        party_type: 'Truck',
        description: `Cash Paid: Truck ${truckNo} - Mandi ${newEntry.mandi_name||''} - Rs.${cashPaid}`,
        amount: roundAmount(cashPaid), reference: `entry_cash:${newEntry.id.slice(0,8)}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now, updated_at: now
      });
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
        id: uuidv4(), date: entryDate, pump_id: pumpId, pump_name: pumpName,
        truck_no: truckNo, agent_name: newEntry.agent_name||'', mandi_name: newEntry.mandi_name||'',
        amount: roundAmount(dieselPaid), txn_type: 'debit',
        description: `Diesel: Truck ${truckNo} - Mandi ${newEntry.mandi_name||''}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now
      });

      this.data.cash_transactions.push({
        id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'jama', category: pumpName,
        party_type: 'Diesel',
        description: `Diesel Fill: Truck ${truckNo} - ${pumpName} - Rs.${dieselPaid}`,
        amount: roundAmount(dieselPaid), reference: `diesel_fill:${newEntry.id.slice(0,8)}`,
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

  updateEntry(id, updates) {
    const index = this.data.entries.findIndex(e => e.id === id);
    if (index === -1) return null;
    const existing = { ...this.data.entries[index] }; // snapshot before replacement (for old-group recompute)
    const merged = { ...this.data.entries[index], ...updates };
    const calculated = this.calculateFields(merged);
    this.data.entries[index] = { ...merged, ...calculated, updated_at: new Date().toISOString() };
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
      const rate = paymentDoc ? (paymentDoc.rate_per_qntl ?? 0) : 0;
      const grossAmount = roundAmount(finalQntl * rate);
      const cashTaken = parseFloat(updated.cash_paid) || 0;
      const dieselTaken = parseFloat(updated.diesel_paid) || 0;
      const deductions = cashTaken + dieselTaken;

      this.data.cash_transactions.push({
        id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'jama', category: truckNo,
        party_type: 'Truck',
        description: `Truck Entry: ${truckNo} - ${finalQntl}Q @ Rs.${rate}` + (deductions > 0 ? ` (Ded: Rs.${deductions})` : ''),
        amount: roundAmount(grossAmount), reference: `truck_entry:${id.slice(0,8)}`,
        kms_year: updated.kms_year||'', season: updated.season||'',
        created_by: updated.created_by||'system', linked_entry_id: id,
        created_at: now, updated_at: now
      });

      if (dieselTaken > 0) {
        this.data.cash_transactions.push({
          id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'nikasi', category: truckNo,
          party_type: 'Truck',
          description: `Truck Diesel Advance: ${truckNo} - Rs.${dieselTaken}`,
          amount: roundAmount(dieselTaken), reference: `truck_diesel_ded:${id.slice(0,8)}`,
          kms_year: updated.kms_year||'', season: updated.season||'',
          created_by: updated.created_by||'system', linked_entry_id: id,
          created_at: now, updated_at: now
        });
      }
    }

    // Recreate Agent Jama (Ledger) — CONSOLIDATED per (mandi, kms_year, season).
    // If user changed mandi/kms/season, also recompute the OLD group.
    const oldMandi = existing.mandi_name || '';
    const oldKms = existing.kms_year || '';
    const oldSeason = existing.season || '';
    const newMandi = updated.mandi_name || '';
    const newKms = updated.kms_year || '';
    const newSeason = updated.season || '';
    if (oldMandi && (oldMandi !== newMandi || oldKms !== newKms || oldSeason !== newSeason)) {
      this.recomputeAgentLedger(oldMandi, oldKms, oldSeason, updated.created_by || 'system');
    }
    this.recomputeAgentLedger(newMandi, newKms, newSeason, updated.created_by || 'system');

    // Recreate Cash Book Nikasi for cash_paid
    const cashPaid = parseFloat(updated.cash_paid) || 0;
    if (cashPaid > 0) {
      this.data.cash_transactions.push({
        id: uuidv4(), date: entryDate, account: 'cash', txn_type: 'nikasi', category: truckNo || 'Cash Paid (Entry)',
        party_type: 'Truck',
        description: `Cash Paid: Truck ${truckNo} - Mandi ${updated.mandi_name||''} - Rs.${cashPaid}`,
        amount: roundAmount(cashPaid), reference: `entry_cash:${id.slice(0,8)}`,
        kms_year: updated.kms_year||'', season: updated.season||'',
        created_by: updated.created_by||'system', linked_entry_id: id,
        created_at: now, updated_at: now
      });
    }

    // Recreate diesel account and diesel JAMA ledger
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
        amount: roundAmount(dieselPaid), txn_type: 'debit',
        description: `Diesel: Truck ${truckNo} - Mandi ${updated.mandi_name||''}`,
        kms_year: updated.kms_year||'', season: updated.season||'',
        created_by: updated.created_by||'system', linked_entry_id: id,
        created_at: now
      });

      this.data.cash_transactions.push({
        id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'jama', category: pumpName,
        party_type: 'Diesel',
        description: `Diesel Fill: Truck ${truckNo} - ${pumpName} - Rs.${dieselPaid}`,
        amount: roundAmount(dieselPaid), reference: `diesel_fill:${id.slice(0,8)}`,
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

  deleteEntry(id) {
    const removed = this.data.entries.find(e => e.id === id);
    const len = this.data.entries.length;
    this.data.entries = this.data.entries.filter(e => e.id !== id);
    if (this.data.cash_transactions) this.data.cash_transactions = this.data.cash_transactions.filter(t => t.linked_entry_id !== id);
    if (this.data.diesel_accounts) this.data.diesel_accounts = this.data.diesel_accounts.filter(t => t.linked_entry_id !== id);
    if (this.data.gunny_bags) this.data.gunny_bags = this.data.gunny_bags.filter(g => g.linked_entry_id !== id);
    if (removed) {
      this.recomputeAgentLedger(removed.mandi_name || '', removed.kms_year || '', removed.season || '', removed.created_by || 'system');
    }
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
    const p_pkt_cut = Math.round(plastic_bag * 0.5 * 100) / 100;
    const mill_w = kg - gbw_cut - p_pkt_cut;
    const mill_w_qntl = mill_w / 100;

    const moisture_cut_percent = Math.max(0, moisture - 17);
    const moisture_cut_qntl = Math.round((mill_w_qntl * moisture_cut_percent / 100) * 100) / 100;
    const moisture_cut = Math.round(moisture_cut_qntl * 100 * 100) / 100;

    const cutting_qntl = Math.round((mill_w_qntl * cutting_percent / 100) * 100) / 100;
    const cutting = Math.round(cutting_qntl * 100 * 100) / 100;

    const p_pkt_cut_qntl = p_pkt_cut / 100;
    const disc_dust_poll_qntl = disc_dust_poll / 100;
    const final_w_qntl = mill_w_qntl - moisture_cut_qntl - cutting_qntl - disc_dust_poll_qntl;
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
      total_diesel_paid: acc.total_diesel_paid + (e.diesel_paid || 0),
      total_tp_weight: acc.total_tp_weight + (parseFloat(e.tp_weight || 0) || 0)
    }), {
      total_kg: 0, total_qntl: 0, total_bag: 0, total_g_deposite: 0,
      total_gbw_cut: 0, total_mill_w: 0, total_p_pkt_cut: 0, total_cutting: 0,
      total_disc_dust_poll: 0, total_final_w: 0, total_g_issued: 0,
      total_cash_paid: 0, total_diesel_paid: 0, total_tp_weight: 0
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
    if (existing) return { error: `${target.mandi_name} ka target already set hai is FY Year aur Season ke liye` };

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
  // Truck Payments
  // Used as fallback when a truck payment has no explicit rate set yet.
  _getMandiDefaultBhadaRate(entryId) {
    const entry = (this.data.entries || []).find(e => e.id === entryId);
    if (!entry || !entry.mandi_name) return 0;
    const tgt = (this.data.mandi_targets || []).find(t =>
      t.mandi_name === entry.mandi_name &&
      (entry.kms_year ? t.kms_year === entry.kms_year : true) &&
      (entry.season ? t.season === entry.season : true)
    );
    if (tgt && Number.isFinite(parseFloat(tgt.default_bhada_rate))) return parseFloat(tgt.default_bhada_rate);
    // fallback: any target for this mandi (regardless of FY/season)
    const any = (this.data.mandi_targets || []).find(t => t.mandi_name === entry.mandi_name && Number.isFinite(parseFloat(t.default_bhada_rate)));
    return any ? parseFloat(any.default_bhada_rate) : 0;
  }

  getTruckPayment(entryId) {
    const found = this.data.truck_payments.find(p => p.entry_id === entryId);
    const def = this._getMandiDefaultBhadaRate(entryId);
    if (found) {
      const merged = { rate_per_qntl: 0, paid_amount: 0, status: 'pending', payment_history: [], ...found };
      // If user never set a rate (still 0), surface mandi's default for UI auto-fill.
      // Stored value stays 0 in DB until user explicitly saves.
      if (!merged.rate_per_qntl && def) {
        merged.rate_per_qntl = def;
        merged._is_default_rate = true;
      }
      return merged;
    }
    return {
      entry_id: entryId,
      rate_per_qntl: def || 0,
      paid_amount: 0,
      status: 'pending',
      payment_history: [],
      _is_default_rate: !!def,
    };
  }

  updateTruckPayment(entryId, payment) {
    const index = this.data.truck_payments.findIndex(p => p.entry_id === entryId);
    if (index !== -1) {
      this.data.truck_payments[index] = { ...this.data.truck_payments[index], ...payment, updated_at: new Date().toISOString() };
    } else {
      this.data.truck_payments.push({ entry_id: entryId, rate_per_qntl: 0, paid_amount: 0, payments_history: [], ...payment, updated_at: new Date().toISOString() });
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
    const paddy = parseFloat(data.paddy_input_qntl || 0);
    const ricePct = parseFloat(data.rice_percent || 0);
    const frkUsed = parseFloat(data.frk_used_qntl || 0);
    const riceQntl = +(paddy * ricePct / 100).toFixed(2);
    
    // Dynamic by-product categories
    const cats = this.data.byproduct_categories && this.data.byproduct_categories.length > 0
      ? [...this.data.byproduct_categories].sort((a,b) => (a.order||0)-(b.order||0))
      : [{id:'bran',is_auto:false},{id:'kunda',is_auto:false},{id:'broken',is_auto:false},{id:'kanki',is_auto:false},{id:'husk',is_auto:true}];
    
    let usedPct = ricePct;
    let autoCatId = null;
    const result = { ...data };
    
    for (const cat of cats) {
      if (cat.is_auto) { autoCatId = cat.id; continue; }
      const pct = parseFloat(data[`${cat.id}_percent`] || 0);
      usedPct += pct;
      result[`${cat.id}_qntl`] = +(paddy * pct / 100).toFixed(2);
    }
    if (autoCatId) {
      const autoPct = Math.max(0, +(100 - usedPct).toFixed(2));
      result[`${autoCatId}_percent`] = autoPct;
      result[`${autoCatId}_qntl`] = +(paddy * autoPct / 100).toFixed(2);
    }
    
    result.rice_qntl = riceQntl;
    result.cmr_delivery_qntl = +(riceQntl + frkUsed).toFixed(2);
    result.outturn_ratio = paddy > 0 ? +((riceQntl + frkUsed) / paddy * 100).toFixed(2) : 0;
    return result;
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
      ...calculated,
      id: uuidv4(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
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
    const totalCmr = entries.reduce((s, e) => s + (e.cmr_delivery_qntl || 0), 0);
    const avgOutturn = totalPaddy > 0 ? +(totalCmr / totalPaddy * 100).toFixed(2) : 0;
    
    // Dynamic by-product totals
    const cats = this.data.byproduct_categories && this.data.byproduct_categories.length > 0
      ? this.data.byproduct_categories : [{id:'bran'},{id:'kunda'},{id:'broken'},{id:'kanki'},{id:'husk'}];
    const bpTotals = {};
    cats.forEach(c => { bpTotals[`total_${c.id}_qntl`] = +entries.reduce((s, e) => s + (e[`${c.id}_qntl`] || 0), 0).toFixed(2); });

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
      ...bpTotals, total_cmr_qntl: +totalCmr.toFixed(2),
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
    // Works for both JSON and SQLite databases
    const data = database.exportToJson ? database.exportToJson() : fs.readFileSync(database.dbFile, 'utf8');
    fs.writeFileSync(backupPath, data);
    console.log(`[Backup] Created: ${filename}`);
    cleanupOldBackups();
    // Copy to custom backup dir if set
    const customDir = database.data?.settings?.custom_backup_dir;
    if (customDir) {
      try {
        if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });
        fs.copyFileSync(backupPath, path.join(customDir, filename));
      } catch (e) { console.error('[Backup] Custom dir copy err:', e.message); }
    }
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
    // Detect encrypted backup format (created by Desktop App with license key)
    try {
      const backupCrypto = require('./utils/backup-crypto');
      if (backupCrypto.isEncrypted(data)) {
        return { success: false, error: 'Ye backup encrypted hai (Desktop App ne license key se bani thi). LAN local-server mein license nahi hota — restore ke liye Desktop App use karein.' };
      }
    } catch (_) { /* crypto util optional */ }
    JSON.parse(data); // Validate JSON
    if (database.importFromJson) {
      // SQLite mode: import via method
      database.importFromJson(data);
    } else {
      // JSON mode: write file and reload
      fs.writeFileSync(database.dbFile, data);
      database.data = database.load();
    }
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
// NOTE: compression() removed entirely - local network pe compression unnecessary hai
// aur PDFKit streaming ke saath ERR_STREAM_WRITE_AFTER_END crash karta hai
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== NO-CACHE FOR ALL /api RESPONSES =====
// Prevents Cloudflare tunnel and browser from caching API data, which was causing
// stale lists to appear after CREATE/UPDATE operations (e.g. new Hemali payment
// entry not showing until browser reload).
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// ===== LAN CLIENT TRACKING =====
const lanClients = new Map();
app.use((req, res, next) => {
  const rawIp = req.ip || req.connection?.remoteAddress || '';
  const ip = rawIp.replace('::ffff:', '');
  if (ip && ip !== '127.0.0.1' && ip !== '::1') {
    lanClients.set(ip, { ip, lastSeen: Date.now() });
  }
  next();
});

app.get('/api/lan-clients', (req, res) => {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const active = [];
  for (const [ip, client] of lanClients.entries()) {
    if (client.lastSeen > fiveMinAgo) {
      active.push({ ip: client.ip, minutes_ago: Math.round((Date.now() - client.lastSeen) / 60000) });
    } else {
      lanClients.delete(ip);
    }
  }
  res.json({ host_computer: true, lan_clients: active, total_connected: active.length + 1 });
});

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

  // Initialize database - SQLite is default, JSON fallback if better-sqlite3 not available
  console.log('[Startup] Loading database...');
  dbEngine = 'sqlite';
  try {
    const { SqliteDatabase } = require('./sqlite-database');
    database = new SqliteDatabase(DATA_DIR);
    console.log(`[Startup] SQLite database loaded`);
  } catch (e) {
    console.warn('[Startup] SQLite failed:', e.message);
    const dbFile = path.join(DATA_DIR, 'millentry-data.db');
    const jsonFile = path.join(DATA_DIR, 'millentry-data.json');
    if (fs.existsSync(dbFile) && !fs.existsSync(jsonFile)) {
      console.warn('[Startup] SQLite DB exists but failed. Retrying after WAL cleanup...');
      try {
        const walF = dbFile + '-wal';
        const shmF = dbFile + '-shm';
        if (fs.existsSync(walF)) fs.unlinkSync(walF);
        if (fs.existsSync(shmF)) fs.unlinkSync(shmF);
        const { SqliteDatabase } = require('./sqlite-database');
        database = new SqliteDatabase(DATA_DIR);
        console.log('[Startup] SQLite database loaded (retry)');
      } catch (e2) {
        console.error('[Startup] SQLite retry also failed:', e2.message);
        database = new JsonDatabase(DATA_DIR);
        dbEngine = 'json';
      }
    } else {
      database = new JsonDatabase(DATA_DIR);
      dbEngine = 'json';
      console.log(`[Startup] JSON fallback database loaded`);
    }
  }

  // Auto-backup on startup
  if (!hasTodayBackup() && fs.existsSync(database.dbFile)) {
    createBackup('startup');
  }

  // Hourly schedule check — runs daily backup at user's configured hour (parity with desktop-app)
  setInterval(() => {
    try {
      if (hasTodayBackup()) return;
      const settings = (database.data || {}).settings || {};
      const enabled = settings.backup_schedule_enabled !== false;
      if (!enabled) return;
      const scheduledHour = Number.isInteger(settings.backup_schedule_hour) ? settings.backup_schedule_hour : 0;
      const currentHour = new Date().getHours();
      if (currentHour >= scheduledHour) {
        createBackup('daily');
      }
    } catch (e) { console.warn('[AutoBackup] schedule check error:', e.message); }
  }, 60 * 60 * 1000);

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
    const reportsRoutes = require('./routes/reports')(database);
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
    app.use(reportsRoutes);
    app.use(ledgersRoutes);
    app.use(millPartsRoutes);
    app.use(staffRoutes);
    app.use(dailyReportRoutes);
    app.use(reportsPnlRoutes);
    app.use(localPartyRoutes);
    app.use(importExcelRoutes);

    // Diesel routes
    const dieselRoutes = require('./routes/diesel')(database);
    app.use(dieselRoutes);

    // FY Summary routes
    const fySummaryRoutes = require('./routes/fy_summary')(database);
    app.use(fySummaryRoutes);

    // Telegram routes
    const telegramRoutes = require('./routes/telegram')(database);
    app.use(telegramRoutes);

    // Bank Accounts routes
    const bankAccountsRoutes = require('./routes/bank_accounts')(database);
    app.use(bankAccountsRoutes);

    // Owner Accounts routes (v104.31.0)
    const ownerAccountsRoutes = require('./routes/owner_accounts')(database);
    app.use(ownerAccountsRoutes);

    // Backups routes
    const backupsRoutes = require('./routes/backups')(database, {
      createBackup: (_db, label) => createBackup(label),
      getBackupsList,
      restoreBackup: (_db, filename) => restoreBackup(filename),
      getBackupDir: () => BACKUP_DIR,
      MAX_BACKUPS
    });
    app.use(backupsRoutes);

    // GST Ledger routes
    const gstLedgerRoutes = require('./routes/gst_ledger')(database);
    app.use(gstLedgerRoutes);

    // Gunny Bags routes
    const gunnyBagsRoutes = require('./routes/gunny_bags')(database);
    app.use(gunnyBagsRoutes);

    // Hemali routes
    const hemaliRoutes = require('./routes/hemali')(database);
    app.use(hemaliRoutes);

    // WhatsApp routes
    const whatsappRoutes = require('./routes/whatsapp')(database);
    app.use(whatsappRoutes);

    // License info stub (for LAN deployment — real enforcement is desktop-app only)
    const licenseRoutes = require('./routes/license')(database);
    app.use(licenseRoutes);

    // Milling routes
    const millingRoutes = require('./routes/milling')(database);
    app.use(millingRoutes);

    // Purchase Vouchers routes
    const purchaseVouchersRoutes = require('./routes/purchase_vouchers')(database);
    app.use(purchaseVouchersRoutes);

    // Salebook routes
    const salebookRoutes = require('./routes/salebook')(database);
    app.use(salebookRoutes);

    // Truck Lease routes
    const truckLeaseRoutes = require('./routes/truck_lease')(database);
    app.use(truckLeaseRoutes);

    // Voucher Payments routes
    const voucherPaymentsRoutes = require('./routes/voucher_payments')(database);
    app.use(voucherPaymentsRoutes);

    // Vehicle Weight routes
    const vehicleWeightRoutes = require('./routes/vehicle_weight')(database);
    app.use(vehicleWeightRoutes);

    const cameraProxyRoutes = require('./routes/camera_proxy')(require('express').Router());
    app.use(cameraProxyRoutes);

    const vigiProxyRoutes = require('./routes/vigi_proxy')(require('express').Router(), database);
    app.use(vigiProxyRoutes);

    const quickSearchRoutes = require('./routes/quick_search')(database);
    app.use(quickSearchRoutes);

    const govtRegistersRoutes = require('./routes/govt_registers')(database);
    app.use(govtRegistersRoutes);

    const bpSaleRegisterRoutes = require('./routes/bp_sale_register')(database);
    app.use(bpSaleRegisterRoutes);

    const oilPremiumRoutes = require('./routes/oil_premium')(database);
    app.use(oilPremiumRoutes);

    const paddyReleaseRoutes = require('./routes/paddy_release')(database);
    app.use(paddyReleaseRoutes);

    const letterPadRoutes = require('./routes/letter_pad')(database);
    app.use(letterPadRoutes);

    const rstCheckRoutes = require('./routes/rst_check')(database);
    app.use(rstCheckRoutes);

    const partyWeightRoutes = require('./routes/party_weight')(database);
    app.use(partyWeightRoutes);

    console.log('  [Routes] All modular routes loaded successfully');

    // ===== DATE FORMAT VALIDATOR - Startup Health Check =====
    try {
      const { runStartupDateCheck } = require('./shared/report_helper');
      runStartupDateCheck();
    } catch (e) {
      console.error('[DATE VALIDATOR] Failed to run:', e.message);
    }
  } catch (e) {
    console.log('  [Note] Some route modules not found:', e.message);
  }

  // ===== ERROR LOG =====
  app.get('/api/health/date-format', (req, res) => {
    try {
      const { validateDateFormats } = require('./shared/report_helper');
      const report = validateDateFormats();
      res.json(report);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Diagnostic: full DB stats — shows record counts for every collection so
  // user can spot which collection is empty/missing.
  app.get('/api/diagnostics/db-stats', (req, res) => {
    try {
      const stats = {};
      const data = database.data || {};
      Object.keys(data).sort().forEach(k => {
        const v = data[k];
        if (Array.isArray(v)) stats[k] = { type: 'array', count: v.length };
        else if (v && typeof v === 'object') stats[k] = { type: 'object', keys: Object.keys(v).length };
        else stats[k] = { type: typeof v, value: typeof v === 'string' ? v.slice(0, 30) : v };
      });
      res.json({
        data_folder: database.dataFolder,
        db_file: database.dbFile || null,
        db_file_exists: database.dbFile ? require('fs').existsSync(database.dbFile) : false,
        engine: database.sqlite ? 'sqlite' : 'json',
        collections: stats,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });


  app.post('/api/sync/reload', async (req, res) => {
    try {
      console.log('[Sync] Manual reload triggered');
      if (database.sqlite) {
        try { database.sqlite.close(); } catch(_) {}
        await new Promise(resolve => setTimeout(resolve, 1500));
        const Database = require('better-sqlite3');
        database.sqlite = new Database(database.dbFile);
        try { database.sqlite.pragma('wal_checkpoint(TRUNCATE)'); } catch(_) {}
        if (database._isCloudPath) database.sqlite.pragma('journal_mode = DELETE');
        database.sqlite.pragma('synchronous = NORMAL');
        database.sqlite.pragma('cache_size = -8000');
        if (database._cleanupWalFiles) database._cleanupWalFiles();
        database.data = database._loadAll();
        if (database.migrateOldEntries) database.migrateOldEntries(database.data);
        const counts = { entries: (database.data.entries||[]).length, vehicle_weights: (database.data.vehicle_weights||[]).length };
        console.log('[Sync] Reload complete:', counts);
        res.json({ success: true, message: 'Sync complete!', ...counts });
      } else if (database.manualReload) {
        const counts = database.manualReload();
        res.json({ success: true, message: 'Data reload ho gaya!', ...counts });
      } else {
        res.status(400).json({ success: false, message: 'Reload not supported' });
      }
    } catch (e) {
      res.status(500).json({ success: false, message: 'Sync failed: ' + e.message });
    }
  });

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

  app.delete('/api/error-log', (req, res) => {
    const logPath = path.join(DATA_DIR, 'error.log');
    try {
      if (fs.existsSync(logPath)) fs.writeFileSync(logPath, '');
      res.json({ success: true, message: 'Error log clear ho gaya' });
    } catch (err) {
      res.status(500).json({ detail: 'Log clear nahi ho paya: ' + err.message });
    }
  });

  // ===== SESSION HEARTBEAT SYSTEM =====
  const computerName = os.hostname();
  const sessionsDir = path.join(DATA_DIR, 'sessions');
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

  const sessionFile = path.join(sessionsDir, `session_${computerName}.json`);

  function writeHeartbeat(active = true) {
    try {
      const data = {
        computer_name: computerName,
        active,
        last_heartbeat: new Date().toISOString(),
        started_at: fs.existsSync(sessionFile)
          ? JSON.parse(fs.readFileSync(sessionFile, 'utf8')).started_at || new Date().toISOString()
          : new Date().toISOString()
      };
      fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
    } catch (e) { console.error('Heartbeat write error:', e.message); }
  }

  writeHeartbeat(true);
  const heartbeatInterval = setInterval(() => writeHeartbeat(true), 30000);
  process.on('exit', () => { clearInterval(heartbeatInterval); writeHeartbeat(false); });
  process.on('SIGINT', () => { writeHeartbeat(false); process.exit(); });

  app.get('/api/session-status', (req, res) => {
    const self = { computer_name: computerName, active: true };
    const others = [];
    try {
      if (fs.existsSync(sessionsDir)) {
        const files = fs.readdirSync(sessionsDir).filter(f => f.startsWith('session_') && f.endsWith('.json'));
        const now = Date.now();
        for (const f of files) {
          try {
            const s = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
            if (s.computer_name === computerName) continue;
            const minutesAgo = (now - new Date(s.last_heartbeat).getTime()) / 60000;
            others.push({
              computer_name: s.computer_name,
              active: s.active && minutesAgo < 3,
              last_heartbeat: s.last_heartbeat,
              minutes_ago: Math.round(minutesAgo * 10) / 10
            });
          } catch { /* skip */ }
        }
      }
    } catch (e) { console.error('Session status error:', e.message); }
    res.json({ self, others });
  });

  app.post('/api/data-refresh', (req, res) => {
    try {
      if (database._loadAll) {
        // SQLite mode
        database.data = database._loadAll();
      } else {
        // JSON mode
        database.data = database.load();
      }
      res.json({ success: true, message: 'Data refreshed from file' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // ===== SYNC STATUS API =====
  app.get('/api/sync-status', (req, res) => {
    const d = database.data;
    res.json({
      last_save: database.lastSaveTime || null,
      entries: (d.entries || []).length,
      vehicle_weights: (d.vehicle_weights || []).length,
      cash_transactions: (d.cash_transactions || []).length,
      engine: dbEngine,
      pending_save: !!database._pendingSave
    });
  });

  // ===== STORAGE ENGINE API =====
  app.get('/api/settings/storage-engine', (req, res) => {
    res.json({ engine: dbEngine });
  });

  // ===== WEIGHBRIDGE PROXY (forward to Desktop App serial port) =====
  app.get('/api/weighbridge/live-weight', async (req, res) => {
    try {
      const settings = database.data.app_settings || [];
      const wbSetting = settings.find(s => s.setting_id === 'weighbridge_host');
      const desktopUrl = wbSetting?.value;
      if (!desktopUrl) {
        return res.json({ weight: 0, stable: false, connected: false, error: 'weighbridge_host not configured. Settings > Weighbridge mai Desktop App URL set karein.' });
      }
      const http = require('http');
      const url = `${desktopUrl}/api/weighbridge/live-weight`;
      const proxyReq = http.get(url, { timeout: 2000 }, (proxyRes) => {
        let body = '';
        proxyRes.on('data', chunk => { body += chunk; });
        proxyRes.on('end', () => {
          try { res.json(JSON.parse(body)); }
          catch (e) { res.json({ weight: 0, stable: false, connected: false }); }
        });
      });
      proxyReq.on('error', () => {
        res.json({ weight: 0, stable: false, connected: false, error: 'Desktop App connect nahi ho paya' });
      });
      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        res.json({ weight: 0, stable: false, connected: false, error: 'Desktop App timeout' });
      });
    } catch (e) {
      res.json({ weight: 0, stable: false, connected: false });
    }
  });

  // ===== WEIGHBRIDGE HOST SETTINGS =====
  app.get('/api/settings/weighbridge-host', (req, res) => {
    const settings = database.data.app_settings || [];
    const wbSetting = settings.find(s => s.setting_id === 'weighbridge_host');
    res.json({ url: wbSetting?.value || '' });
  });

  app.put('/api/settings/weighbridge-host', async (req, res) => {
    const { url } = req.body || {};
    if (!database.data.app_settings) database.data.app_settings = [];
    const idx = database.data.app_settings.findIndex(s => s.setting_id === 'weighbridge_host');
    const setting = { setting_id: 'weighbridge_host', value: (url || '').trim(), updated_at: new Date().toISOString() };
    if (idx >= 0) database.data.app_settings[idx] = setting;
    else database.data.app_settings.push(setting);
    await database.save();
    res.json({ success: true, url: setting.value });
  });

  // ===== SERVE FRONTEND (AFTER all API routes) =====
  if (fs.existsSync(PUBLIC_DIR)) {
    // Serve static assets (JS/CSS/images) but NOT index.html (we inject API URL into it)
    app.use(express.static(PUBLIC_DIR, {
      index: false,
      maxAge: '1y',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    }));
    // Serve index.html with API URL injected so it works from both localhost AND network IPs
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
        const hostUrl = `http://${req.headers.host}`;
        html = html.replace('<head>', `<head><script>window.ELECTRON_API_URL='${hostUrl}';window.REACT_APP_BACKEND_URL='${hostUrl}';</script>`);
        res.type('html').send(html);
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

    // Start file watcher for Google Drive / external sync detection
    if (database && database.startFileWatcher) {
      database.startFileWatcher();
      console.log('[Server] File watcher started for external sync detection');
    }
  });
}

startServer();

// Graceful shutdown - save data
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down... data save ho raha hai...');
  if (database) {
    if (database.stopFileWatcher) database.stopFileWatcher();
    if (database.close) database.close();
    else database.save();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (database) {
    if (database.stopFileWatcher) database.stopFileWatcher();
    if (database.close) database.close();
    else database.save();
  }
  process.exit(0);
});
