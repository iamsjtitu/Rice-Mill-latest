/**
 * SqliteDatabase - Drop-in replacement for JsonDatabase
 * Uses better-sqlite3 for storage with WAL mode for crash safety
 * Maintains same in-memory interface (this.data) so routes need ZERO changes
 */
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// All known collections (arrays) — kept as initial seed list; we also auto-detect
// any new collection that routes start using (see _persistedCollections() and _doSave()).
// IMPORTANT: NEVER remove items from this list — we only add. Removing means SQLite
// won't load existing rows back into memory → silent data loss after update.
const ARRAY_COLLECTIONS = [
  'entries', 'mandi_targets', 'truck_payments', 'agent_payments',
  'milling_entries', 'bank_accounts', 'opening_balances',
  'sale_vouchers', 'purchase_vouchers', 'local_party_accounts',
  'voucher_payments', 'stock_summary', 'cash_transactions',
  'dc_entries', 'dc_deliveries', 'dc_msp_payments', 'dc_stacks', 'dc_stack_lots',
  'gunny_bags', 'diesel_accounts', 'private_paddy',
  'truck_owner_payments', 'rice_sales', 'byproduct_sales',
  'frk_purchases', 'truck_leases', 'truck_lease_payments',
  'staff', 'mill_parts', 'mill_parts_stock', 'diesel_pumps',
  'msp_payments', 'staff_payments', 'staff_advances', 'staff_attendance',
  'vehicle_weights', 'hemali_entries', 'hemali_payments', 'hemali_items',
  'private_payments', 'app_settings', 'party_ledger',
  'audit_log', 'paddy_cutting',
  // v104.28.12 — added previously-missing collections (caused data loss on update):
  'byproduct_categories', 'cmr_deliveries', 'frk_register',
  'govt_gunny_bag_register', 'oil_premium', 'opening_stock', 'paddy_release',
  'party_opening_balances', 'private_rice_sales', 'bp_sale_register',
  'cash_book_categories', 'salebook', 'security_deposits', 'store_rooms',
  'telegram_logs', 'verification_history',
];

// KV items (non-array objects)
const KV_KEYS = ['branding', 'users', 'gst_opening_balances', '_migrations', 'settings',
  'fy_settings', 'gst_company_settings', 'gst_settings'];

class SqliteDatabase {
  constructor(dataFolder) {
    this.dataFolder = dataFolder;
    this.dbFile = path.join(dataFolder, 'millentry-data.db');
    this.jsonFile = path.join(dataFolder, 'millentry-data.json');

    // Detect if folder is on cloud storage (Google Drive, iCloud, OneDrive, Dropbox, etc.)
    const normalizedPath = dataFolder.toLowerCase().replace(/\\/g, '/');
    const isCloudPath = normalizedPath.includes('cloudstorage') || 
                        normalizedPath.includes('google drive') ||
                        normalizedPath.includes('googledrive') ||
                        normalizedPath.includes('my drive') ||
                        normalizedPath.includes('icloud') ||
                        normalizedPath.includes('onedrive') ||
                        normalizedPath.includes('dropbox') ||
                        normalizedPath.includes('box sync');
    this._isCloudPath = isCloudPath;

    // Lazy-load better-sqlite3 (native module)
    const Database = require('better-sqlite3');
    this.sqlite = new Database(this.dbFile);

    // FIRST: Checkpoint any existing WAL data into main DB (prevent data loss)
    try {
      const modeResult = this.sqlite.pragma('journal_mode');
      const currentMode = Array.isArray(modeResult) ? modeResult[0]?.journal_mode : modeResult;
      if (currentMode === 'wal') {
        console.log('[SQLite] WAL mode detected, checkpointing data into main DB...');
        this.sqlite.pragma('wal_checkpoint(TRUNCATE)');
        console.log('[SQLite] WAL checkpoint complete');
      }
    } catch (e) {
      console.warn('[SQLite] WAL checkpoint warning:', e.message);
    }

    // ALWAYS use DELETE mode for cloud paths (no WAL/SHM = no Google Drive conflicts)
    if (isCloudPath) {
      console.log('[SQLite] Cloud storage detected (' + normalizedPath.substring(0, 50) + '...) - FORCING DELETE journal mode');
      this.sqlite.pragma('journal_mode = DELETE');
    } else {
      this.sqlite.pragma('journal_mode = WAL');
    }
    this.sqlite.pragma('synchronous = NORMAL');
    this.sqlite.pragma('cache_size = -8000'); // 8MB cache

    // Verify journal mode
    try {
      const verifyResult = this.sqlite.pragma('journal_mode');
      const verifyMode = Array.isArray(verifyResult) ? verifyResult[0]?.journal_mode : verifyResult;
      console.log('[SQLite] Active journal_mode:', verifyMode);
    } catch (e) {
      console.log('[SQLite] pragma verify skipped:', e.message);
    }

    // Clean up WAL/SHM files and Google Drive conflict copies AFTER checkpoint
    this._cleanupWalFiles();

    this._initTables();
    this._migrateFromJsonIfNeeded();
    this._recoverMissingCollectionsFromJson();
    this.data = this._loadAll();

    // Run data migration (same as JsonDatabase)
    this.migrateOldEntries(this.data);

    console.log(`[SQLite] Database ready: ${this.dbFile}`);
  }

  _cleanupWalFiles() {
    const walFile = this.dbFile + '-wal';
    const shmFile = this.dbFile + '-shm';
    try {
      // Remove main WAL/SHM (already checkpointed)
      if (fs.existsSync(walFile)) { fs.unlinkSync(walFile); console.log('[SQLite] Cleaned WAL file'); }
      if (fs.existsSync(shmFile)) { fs.unlinkSync(shmFile); console.log('[SQLite] Cleaned SHM file'); }
      // Remove Google Drive conflict copies: "millentry-data (1).db-wal", "millentry-data (1).db-shm", etc.
      const dir = path.dirname(this.dbFile);
      const files = fs.readdirSync(dir);
      files.forEach(f => {
        if (f.match(/millentry-data\s*\(\d+\)\.db-(wal|shm)$/i) || f.match(/millentry-data\.db-(wal|shm)\s*\(\d+\)$/i)) {
          const fp = path.join(dir, f);
          fs.unlinkSync(fp);
          console.log(`[SQLite] Cleaned conflict file: ${f}`);
        }
      });
    } catch (e) {
      console.warn('[SQLite] Cleanup warning:', e.message);
    }
  }


  _initTables() {
    // KV store for objects (branding, users, etc.)
    this.sqlite.exec(`CREATE TABLE IF NOT EXISTS _kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);

    // One table per collection
    for (const col of ARRAY_COLLECTIONS) {
      this.sqlite.exec(`CREATE TABLE IF NOT EXISTS "${col}" (
        id TEXT PRIMARY KEY,
        doc TEXT NOT NULL
      )`);
    }

    // Indexes for frequently queried collections
    try {
      this.sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(id)`);
      this.sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_cash_txn ON cash_transactions(id)`);
      this.sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_vehicle_weights ON vehicle_weights(id)`);
    } catch (e) { /* ignore if table doesn't exist yet */ }
  }

  _migrateFromJsonIfNeeded() {
    // Check if SQLite is empty and JSON file exists
    const count = this.sqlite.prepare('SELECT COUNT(*) as c FROM _kv').get().c;
    const hasCollectionData = ARRAY_COLLECTIONS.some(col => {
      try {
        return this.sqlite.prepare(`SELECT COUNT(*) as c FROM "${col}"`).get().c > 0;
      } catch { return false; }
    });

    if (count === 0 && !hasCollectionData && fs.existsSync(this.jsonFile)) {
      console.log('[SQLite] Migrating from JSON file...');
      try {
        const jsonData = JSON.parse(fs.readFileSync(this.jsonFile, 'utf8'));
        this._importData(jsonData);
        console.log('[SQLite] JSON → SQLite migration complete!');
      } catch (e) {
        console.error('[SQLite] Migration failed:', e.message);
      }
    }
  }

  /**
   * RECOVERY: If SQLite was already populated but a particular collection is empty
   * AND the legacy JSON file has rows for it, copy them in. This recovers data lost
   * because earlier versions had collections missing from ARRAY_COLLECTIONS list
   * (e.g. hemali_items in v<=104.28.11). Idempotent — runs only when SQLite empty
   * for that specific collection.
   */
  _recoverMissingCollectionsFromJson() {
    if (!fs.existsSync(this.jsonFile)) return;
    let jsonData;
    try {
      jsonData = JSON.parse(fs.readFileSync(this.jsonFile, 'utf8'));
    } catch (e) {
      console.warn('[SQLite] Recovery: cannot parse JSON file:', e.message);
      return;
    }
    let recovered = 0;
    for (const col of ARRAY_COLLECTIONS) {
      const jsonRows = Array.isArray(jsonData[col]) ? jsonData[col] : null;
      if (!jsonRows || jsonRows.length === 0) continue;
      let sqliteCount = 0;
      try {
        sqliteCount = this.sqlite.prepare(`SELECT COUNT(*) as c FROM "${col}"`).get().c;
      } catch { sqliteCount = 0; }
      if (sqliteCount > 0) continue; // already has data
      // Copy JSON rows into SQLite
      try {
        const insert = this.sqlite.prepare(`INSERT OR REPLACE INTO "${col}" (id, doc) VALUES (?, ?)`);
        const tx = this.sqlite.transaction(() => {
          for (const item of jsonRows) {
            const id = (item && item.id) || uuidv4();
            if (item && !item.id) item.id = id;
            insert.run(id, JSON.stringify(item));
          }
        });
        tx();
        recovered += jsonRows.length;
        console.log(`[SQLite Recovery] Restored ${jsonRows.length} rows into '${col}' from JSON backup`);
      } catch (e) {
        console.warn(`[SQLite Recovery] Failed for '${col}':`, e.message);
      }
    }
    if (recovered > 0) {
      console.log(`[SQLite Recovery] Total: ${recovered} rows recovered from JSON backup`);
    }
  }

  _importData(jsonData) {
    const transaction = this.sqlite.transaction(() => {
      for (const [key, value] of Object.entries(jsonData)) {
        if (Array.isArray(value) && ARRAY_COLLECTIONS.includes(key)) {
          // Array collection → insert rows
          const insert = this.sqlite.prepare(`INSERT OR REPLACE INTO "${key}" (id, doc) VALUES (?, ?)`);
          for (const item of value) {
            const id = item.id || uuidv4();
            if (!item.id) item.id = id;
            insert.run(id, JSON.stringify(item));
          }
        } else if (!Array.isArray(value)) {
          // KV item
          this.sqlite.prepare('INSERT OR REPLACE INTO _kv (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
        }
      }
    });
    transaction();
  }

  _loadAll() {
    const data = {};

    // Load KV items
    const kvRows = this.sqlite.prepare('SELECT key, value FROM _kv').all();
    for (const kv of kvRows) {
      try { data[kv.key] = JSON.parse(kv.value); } catch { data[kv.key] = null; }
    }

    // Load collections — DYNAMIC: query SQLite for all user tables (excluding _kv)
    // and load each one. Falls back to ARRAY_COLLECTIONS for tables not yet created.
    let userTables = [];
    try {
      const rows = this.sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_kv'"
      ).all();
      userTables = rows.map(r => r.name);
    } catch { userTables = []; }
    const allCols = new Set([...ARRAY_COLLECTIONS, ...userTables]);
    for (const col of allCols) {
      try {
        const rows = this.sqlite.prepare(`SELECT doc FROM "${col}"`).all();
        data[col] = rows.map(r => {
          try { return JSON.parse(r.doc); } catch { return null; }
        }).filter(Boolean);
      } catch { data[col] = []; }
    }

    // Ensure defaults
    if (!data.branding) {
      data.branding = {
        company_name: 'NAVKAR AGRO',
        tagline: 'JOLKO, KESINGA',
        updated_at: new Date().toISOString()
      };
    }
    if (!data.users || !Array.isArray(data.users) || data.users.length === 0) {
      data.users = [
        { username: 'admin', password: 'admin123', role: 'admin' },
        { username: 'staff', password: 'staff123', role: 'staff' }
      ];
    } else {
      if (!data.users.find(u => u.username === 'admin')) {
        data.users.push({ username: 'admin', password: 'admin123', role: 'admin' });
      }
      if (!data.users.find(u => u.username === 'staff')) {
        data.users.push({ username: 'staff', password: 'staff123', role: 'staff' });
      }
    }
    if (!data.gst_opening_balances) data.gst_opening_balances = {};
    if (!data._migrations) data._migrations = {};

    // Ensure all collections exist as arrays
    for (const col of ARRAY_COLLECTIONS) {
      if (!data[col]) data[col] = [];
    }

    return data;
  }

  // ============ SAVE (Debounced) ============
  
  logAudit(collection, recordId, action, username, oldData, newData, summary) {
    if (!this.data.audit_log) this.data.audit_log = [];
    const changes = {};
    const skipKeys = new Set(['_id', '_v', 'updated_at', 'created_at']);
    if (action === 'update' && oldData && newData) {
      for (const key of new Set([...Object.keys(oldData), ...Object.keys(newData)])) {
        if (skipKeys.has(key)) continue;
        if (oldData[key] !== newData[key]) changes[key] = { old: oldData[key], new: newData[key] };
      }
      if (Object.keys(changes).length === 0) return;
    }
    if (action === 'create' && newData) {
      for (const key of ['truck_no', 'party_name', 'amount', 'kg', 'bag', 'category', 'description', 'total_amount', 'quantity_qntl']) {
        if (newData[key]) changes[key] = { new: newData[key] };
      }
    }
    if (action === 'delete' && oldData) {
      for (const key of ['truck_no', 'party_name', 'amount', 'kg', 'bag', 'category', 'description', 'total_amount', 'quantity_qntl']) {
        if (oldData[key]) changes[key] = { old: oldData[key] };
      }
    }
    if (!summary) {
      if (action === 'create') summary = `${username} ne naya record banaya`;
      else if (action === 'delete') summary = `${username} ne record delete kiya`;
      else if (action === 'update') {
        const parts = Object.entries(changes).slice(0, 3).map(([k, v]) => v.old !== undefined && v.new !== undefined ? `${k}: ${v.old} → ${v.new}` : k);
        summary = `${username} ne ${parts.join(', ')} change kiya`;
      }
    }
    this.data.audit_log.push({
      id: uuidv4(), collection, record_id: String(recordId), action,
      changes, username: username || 'system', summary: summary || '',
      timestamp: new Date().toISOString()
    });
  }

  save() {
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
    this.lastSaveTime = new Date().toISOString();
    this._lastOwnSaveTime = Date.now();
    try {
      const transaction = this.sqlite.transaction(() => {
        // Save KV items
        const upsertKv = this.sqlite.prepare('INSERT OR REPLACE INTO _kv (key, value) VALUES (?, ?)');
        for (const key of KV_KEYS) {
          if (this.data[key] !== undefined) {
            upsertKv.run(key, JSON.stringify(this.data[key]));
          }
        }

        // Save array collections — DYNAMIC: persist every array key in this.data,
        // not just the hardcoded ARRAY_COLLECTIONS list. This prevents data loss when
        // routes start using a new collection that's not in the list yet.
        const allCols = new Set([
          ...ARRAY_COLLECTIONS,
          ...Object.keys(this.data).filter(k => Array.isArray(this.data[k]) && !KV_KEYS.includes(k))
        ]);
        for (const col of allCols) {
          if (!this.data[col]) continue;
          const items = this.data[col];
          if (!Array.isArray(items)) continue;

          // Lazy-create table if missing (for collections not in initial CREATE list)
          try {
            this.sqlite.exec(`CREATE TABLE IF NOT EXISTS "${col}" (id TEXT PRIMARY KEY, doc TEXT NOT NULL)`);
          } catch (e) { console.warn(`[SQLite] Cannot ensure table '${col}':`, e.message); continue; }

          // Full rewrite: DELETE all + INSERT all (within transaction = fast)
          this.sqlite.prepare(`DELETE FROM "${col}"`).run();
          if (items.length > 0) {
            const insert = this.sqlite.prepare(`INSERT INTO "${col}" (id, doc) VALUES (?, ?)`);
            for (const item of items) {
              const id = (item && item.id) || uuidv4();
              insert.run(id, JSON.stringify(item));
            }
          }
        }
      });
      transaction();
      
      // After save: briefly release file lock so Google Drive can sync
      if (this._isCloudPath) {
        this._releaseLockBriefly();
      }
    } catch (e) {
      console.error('[SQLite] Save error:', e.message);
    }
  }

  // Release SQLite file lock briefly so Google Drive desktop app can sync
  _releaseLockBriefly() {
    try {
      this.sqlite.close();
      // Reopen immediately - the close itself is enough for GDrive to detect the file change
      const Database = require('better-sqlite3');
      this.sqlite = new Database(this.dbFile);
      this.sqlite.pragma('journal_mode = DELETE');
      this.sqlite.pragma('synchronous = NORMAL');
      this.sqlite.pragma('cache_size = -8000');
      this._cleanupWalFiles();
      // Update our known mtime so we don't falsely detect our own save as external change
      try {
        const stat = fs.statSync(this.dbFile);
        this._lastKnownMtime = stat.mtimeMs;
        this._lastKnownSize = stat.size;
      } catch (_) {}
    } catch (e) {
      console.error('[SQLite] Lock release error:', e.message);
      try {
        const Database = require('better-sqlite3');
        this.sqlite = new Database(this.dbFile);
      } catch (_) {}
    }
  }

  // ============ Google Drive / External Sync - Auto Sync ============
  startFileWatcher() {
    if (this._fileWatcher) return;
    this._lastOwnSaveTime = this._lastOwnSaveTime || Date.now();
    this._lastKnownMtime = 0;
    this._lastKnownSize = 0;
    this._lastSyncWindowTime = Date.now();
    this._prevDataHash = '';
    try {
      const stat = fs.statSync(this.dbFile);
      this._lastKnownMtime = stat.mtimeMs;
      this._lastKnownSize = stat.size;
    } catch (_) {}
    // Build a quick data fingerprint for change detection
    this._prevDataHash = this._getDataFingerprint();

    const SYNC_WINDOW_INTERVAL = 10000; // Every 10 sec, release file lock for Google Drive
    const POLL_INTERVAL = 5000; // Check file every 5 sec

    this._fileWatcher = setInterval(async () => {
      try {
        const now = Date.now();
        
        // Check 1: File mtime/size changed (Google Drive downloaded new version)
        if (fs.existsSync(this.dbFile)) {
          const stat = fs.statSync(this.dbFile);
          if (stat.mtimeMs > this._lastKnownMtime && (stat.mtimeMs - (this._lastOwnSaveTime || 0)) > 2000) {
            console.log('[AutoSync] External file change detected, reloading...');
            this._lastKnownMtime = stat.mtimeMs;
            this._lastKnownSize = stat.size;
            this._reloadFromDisk();
            this._prevDataHash = this._getDataFingerprint();
            this._lastSyncWindowTime = now;
            return;
          }
          this._lastKnownMtime = stat.mtimeMs;
          this._lastKnownSize = stat.size;
        }

        // Check 2: Periodic sync window - close DB to let Google Drive sync
        if (this._isCloudPath && (now - this._lastSyncWindowTime) >= SYNC_WINDOW_INTERVAL) {
          this._lastSyncWindowTime = now;
          // Close connection to release Windows file lock
          try { this.sqlite.close(); } catch(_) {}
          // Brief pause for Google Drive to read/write
          await new Promise(resolve => setTimeout(resolve, 500));
          // Reopen
          const Database = require('better-sqlite3');
          this.sqlite = new Database(this.dbFile);
          try { this.sqlite.pragma('wal_checkpoint(TRUNCATE)'); } catch(_) {}
          this.sqlite.pragma('journal_mode = DELETE');
          this.sqlite.pragma('synchronous = NORMAL');
          this.sqlite.pragma('cache_size = -8000');
          this._cleanupWalFiles();
          // Reload and check if data changed
          this.data = this._loadAll();
          this.migrateOldEntries(this.data);
          const newHash = this._getDataFingerprint();
          if (newHash !== this._prevDataHash) {
            console.log('[AutoSync] New data from Google Drive! Entries:', (this.data.entries||[]).length);
            this._prevDataHash = newHash;
          }
        }
      } catch (e) {
        // Recover connection if something broke
        try {
          const Database = require('better-sqlite3');
          this.sqlite = new Database(this.dbFile);
          this.data = this._loadAll();
        } catch(_) {}
      }
    }, POLL_INTERVAL);
    console.log('[SQLite] Auto-sync started (cloud:', this._isCloudPath, ', interval:', POLL_INTERVAL, 'ms, sync window:', SYNC_WINDOW_INTERVAL, 'ms)');
  }

  _getDataFingerprint() {
    try {
      const e = (this.data.entries || []).length;
      const v = (this.data.vehicle_weights || []).length;
      const c = (this.data.cash_transactions || []).length;
      const lastEntry = (this.data.entries || []).slice(-1)[0];
      const lastId = lastEntry ? (lastEntry.id || '') : '';
      return `${e}-${v}-${c}-${lastId}`;
    } catch(_) { return ''; }
  }

  stopFileWatcher() {
    if (this._fileWatcher) {
      clearInterval(this._fileWatcher);
      this._fileWatcher = null;
      console.log('[SQLite] File watcher stopped');
    }
  }

  _reloadFromDisk() {
    try {
      // Close current connection to release file lock
      try { this.sqlite.close(); } catch(_) {}
      // Reopen fresh connection
      const Database = require('better-sqlite3');
      this.sqlite = new Database(this.dbFile);
      try { this.sqlite.pragma('wal_checkpoint(TRUNCATE)'); } catch(_) {}
      if (this._isCloudPath) {
        this.sqlite.pragma('journal_mode = DELETE');
      }
      this.sqlite.pragma('synchronous = NORMAL');
      this.sqlite.pragma('cache_size = -8000');
      this._cleanupWalFiles();
      this.data = this._loadAll();
      this.migrateOldEntries(this.data);
      console.log('[SQLite] Reload complete - Entries:', (this.data.entries||[]).length);
    } catch (e) {
      console.error('[SQLite] Reload error:', e.message);
      try {
        const Database = require('better-sqlite3');
        this.sqlite = new Database(this.dbFile);
        this.data = this._loadAll();
      } catch(e2) {
        console.error('[SQLite] Recovery failed:', e2.message);
      }
    }
  }

  // Manual sync/reload
  manualReload() {
    this._reloadFromDisk();
    return { entries: (this.data.entries || []).length, vehicle_weights: (this.data.vehicle_weights || []).length };
  }


  // ============ EXPORT to JSON (for backup compatibility) ============
  exportToJson() {
    return JSON.stringify(this.data);
  }

  // ============ IMPORT from JSON (for restore) ============
  importFromJson(jsonStr) {
    const jsonData = JSON.parse(jsonStr);
    // Clear all tables
    const transaction = this.sqlite.transaction(() => {
      this.sqlite.prepare('DELETE FROM _kv').run();
      for (const col of ARRAY_COLLECTIONS) {
        try { this.sqlite.prepare(`DELETE FROM "${col}"`).run(); } catch {}
      }
    });
    transaction();
    // Import
    this._importData(jsonData);
    this.data = this._loadAll();
    this.migrateOldEntries(this.data);
  }

  // ============ All JsonDatabase methods below (copied as-is) ============

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
    if (!Array.isArray(this.data.users)) return undefined;
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
    entries.sort((a, b) => {
      const dateComp = (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10));
      if (dateComp !== 0) return dateComp;
      return (parseInt(b.rst_no) || 0) - (parseInt(a.rst_no) || 0);
    });
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
   * Upserts ONE row per group — total achieved QNTL × base_rate accumulates.
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
    const newEntry = {
      id: uuidv4(), ...entry, ...this.calculateFields(entry),
      _v: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    this.data.entries.push(newEntry);
    if (!this.data.cash_transactions) this.data.cash_transactions = [];

    const truckNo = newEntry.truck_no || '';
    const entryDate = newEntry.date || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

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

      const jamaEntry = {
        id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'jama', category: truckNo,
        party_type: 'Truck',
        description: `Truck Entry: ${truckNo} - ${finalQntl}Q @ Rs.${rate}` + (deductions > 0 ? ` (Ded: Rs.${deductions})` : ''),
        amount: Math.round(grossAmount * 100) / 100, reference: `truck_entry:${newEntry.id.slice(0,8)}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now, updated_at: now
      };
      this.data.cash_transactions.push(jamaEntry);
      this.logAudit('cash_transactions', jamaEntry.id, 'create', newEntry.created_by || '', null, jamaEntry);

      if (dieselTaken > 0) {
        const dieselDed = {
          id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'nikasi', category: truckNo,
          party_type: 'Truck',
          description: `Truck Diesel Advance: ${truckNo} - Rs.${dieselTaken}`,
          amount: Math.round(dieselTaken * 100) / 100, reference: `truck_diesel_ded:${newEntry.id.slice(0,8)}`,
          kms_year: newEntry.kms_year||'', season: newEntry.season||'',
          created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
          created_at: now, updated_at: now
        };
        this.data.cash_transactions.push(dieselDed);
        this.logAudit('cash_transactions', dieselDed.id, 'create', newEntry.created_by || '', null, dieselDed);
      }
    }

    const cashPaid = parseFloat(newEntry.cash_paid) || 0;
    if (cashPaid > 0) {
      const cashNikasi = {
        id: uuidv4(), date: entryDate, account: 'cash', txn_type: 'nikasi', category: truckNo || 'Cash Paid (Entry)',
        party_type: 'Truck',
        description: `Cash Paid: Truck ${truckNo} - Mandi ${newEntry.mandi_name||''} - Rs.${cashPaid}`,
        amount: Math.round(cashPaid * 100) / 100, reference: `entry_cash:${newEntry.id.slice(0,8)}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now, updated_at: now
      };
      this.data.cash_transactions.push(cashNikasi);
      this.logAudit('cash_transactions', cashNikasi.id, 'create', newEntry.created_by || '', null, cashNikasi);
      if (truckNo) {
        const cashDed = {
          id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'nikasi', category: truckNo,
          party_type: 'Truck',
          description: `Truck Cash Advance: ${truckNo} - Rs.${cashPaid}`,
          amount: Math.round(cashPaid * 100) / 100, reference: `truck_cash_ded:${newEntry.id.slice(0,8)}`,
          kms_year: newEntry.kms_year||'', season: newEntry.season||'',
          created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
          created_at: now, updated_at: now
        };
        this.data.cash_transactions.push(cashDed);
        this.logAudit('cash_transactions', cashDed.id, 'create', newEntry.created_by || '', null, cashDed);
      }
    }

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
        amount: Math.round(dieselPaid * 100) / 100, txn_type: 'debit',
        description: `Diesel: Truck ${truckNo} - Mandi ${newEntry.mandi_name||''}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now
      });
      const dieselJama = {
        id: uuidv4(), date: entryDate, account: 'ledger', txn_type: 'jama', category: pumpName,
        party_type: 'Diesel',
        description: `Diesel Fill: Truck ${truckNo} - ${pumpName} - Rs.${dieselPaid}`,
        amount: Math.round(dieselPaid * 100) / 100, reference: `diesel_fill:${newEntry.id.slice(0,8)}`,
        kms_year: newEntry.kms_year||'', season: newEntry.season||'',
        created_by: newEntry.created_by||'system', linked_entry_id: newEntry.id,
        created_at: now, updated_at: now
      };
      this.data.cash_transactions.push(dieselJama);
      this.logAudit('cash_transactions', dieselJama.id, 'create', newEntry.created_by || '', null, dieselJama);
    }

    this._createGunnyEntriesForMill(newEntry);

    // Auto Jama (Ledger) for AGENT — CONSOLIDATED per (mandi, kms_year, season)
    this.recomputeAgentLedger(
      newEntry.mandi_name || '',
      newEntry.kms_year || '',
      newEntry.season || '',
      newEntry.created_by || 'system',
    );

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
      const current = this.data.entries[index];
      const oldSnapshot = { mandi_name: current.mandi_name, kms_year: current.kms_year, season: current.season };
      // Optimistic locking: check _v if provided
      if (entry._v !== undefined && entry._v !== null && current._v !== undefined) {
        if (parseInt(entry._v) !== current._v) {
          return { _conflict: true, message: 'Ye record kisi aur ne update kar diya hai. Data refresh ho raha hai.' };
        }
      }
      const clientV = entry._v;
      delete entry._v;
      this.data.entries[index] = {
        ...current, ...entry, ...this.calculateFields(entry),
        _v: (current._v || 0) + 1,
        updated_at: new Date().toISOString()
      };
      const updated = this.data.entries[index];
      const now = new Date().toISOString();
      const truckNo = updated.truck_no || '';
      const entryDate = updated.date || new Date().toISOString().split('T')[0];

      if (this.data.cash_transactions) this.data.cash_transactions = this.data.cash_transactions.filter(t => t.linked_entry_id !== id);
      if (this.data.diesel_accounts) this.data.diesel_accounts = this.data.diesel_accounts.filter(t => t.linked_entry_id !== id);
      if (this.data.gunny_bags) this.data.gunny_bags = this.data.gunny_bags.filter(t => t.linked_entry_id !== id);
      if (!this.data.cash_transactions) this.data.cash_transactions = [];

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

      this._createGunnyEntriesForMill(updated);

      // Sync cash/diesel to linked vehicle_weight entry (same RST + kms_year)
      const rstNo = String(updated.rst_no || '').trim();
      if (rstNo && this.data.vehicle_weights) {
        const vwIdx = this.data.vehicle_weights.findIndex(v => 
          String(v.rst_no) === rstNo && v.kms_year === (updated.kms_year || '')
        );
        if (vwIdx >= 0) {
          this.data.vehicle_weights[vwIdx].cash_paid = parseFloat(updated.cash_paid || 0);
          this.data.vehicle_weights[vwIdx].diesel_paid = parseFloat(updated.diesel_paid || 0);
          this.data.vehicle_weights[vwIdx].updated_at = new Date().toISOString();
        }
      }

      // Recompute consolidated agent ledger for new (and old, if changed) group
      const oldM = oldSnapshot.mandi_name || '';
      const oldK = oldSnapshot.kms_year || '';
      const oldS = oldSnapshot.season || '';
      const newM = updated.mandi_name || '';
      const newK = updated.kms_year || '';
      const newS = updated.season || '';
      if (oldM && (oldM !== newM || oldK !== newK || oldS !== newS)) {
        this.recomputeAgentLedger(oldM, oldK, oldS, updated.created_by || 'system');
      }
      this.recomputeAgentLedger(newM, newK, newS, updated.created_by || 'system');

      this.save();
      return updated;
    }
    return null;
  }

  deleteEntry(id) {
    const removed = this.data.entries.find(e => e.id === id);
    this.data.entries = this.data.entries.filter(e => e.id !== id);
    if (this.data.cash_transactions) this.data.cash_transactions = this.data.cash_transactions.filter(t => t.linked_entry_id !== id);
    if (this.data.diesel_accounts) this.data.diesel_accounts = this.data.diesel_accounts.filter(t => t.linked_entry_id !== id);
    if (this.data.gunny_bags) this.data.gunny_bags = this.data.gunny_bags.filter(t => t.linked_entry_id !== id);
    if (removed) {
      this.recomputeAgentLedger(removed.mandi_name || '', removed.kms_year || '', removed.season || '', removed.created_by || 'system');
    }
    this.save();
  }

  bulkDeleteEntries(ids) {
    const idSet = new Set(ids);
    const removed = this.data.entries.filter(e => idSet.has(e.id));
    this.data.entries = this.data.entries.filter(e => !idSet.has(e.id));
    if (this.data.cash_transactions) this.data.cash_transactions = this.data.cash_transactions.filter(t => !idSet.has(t.linked_entry_id));
    if (this.data.diesel_accounts) this.data.diesel_accounts = this.data.diesel_accounts.filter(t => !idSet.has(t.linked_entry_id));
    if (this.data.gunny_bags) this.data.gunny_bags = this.data.gunny_bags.filter(t => !idSet.has(t.linked_entry_id));
    // Recompute agent ledger for each unique (mandi, kms, season) group affected
    const groups = new Set();
    removed.forEach(e => groups.add(`${e.mandi_name || ''}|${e.kms_year || ''}|${e.season || ''}`));
    groups.forEach(key => {
      const [m, k, s] = key.split('|');
      this.recomputeAgentLedger(m, k, s, 'system');
    });
    this.save();
  }

  calculateFields(data) {
    const kg = parseFloat(data.kg) || 0;
    const bag = parseInt(data.bag) || 0;
    const g_deposite = parseFloat(data.g_deposite) || 0;
    const gbw_cut = parseFloat(data.gbw_cut) || Math.round(g_deposite * 0.5 * 100) / 100;
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
      total_kg: acc.total_kg + (e.kg || 0), total_qntl: acc.total_qntl + (e.qntl || 0),
      total_bag: acc.total_bag + (e.bag || 0), total_g_deposite: acc.total_g_deposite + (e.g_deposite || 0),
      total_gbw_cut: acc.total_gbw_cut + (e.gbw_cut || 0), total_mill_w: acc.total_mill_w + (e.mill_w || 0),
      total_p_pkt_cut: acc.total_p_pkt_cut + (e.p_pkt_cut || 0), total_cutting: acc.total_cutting + (e.cutting || 0),
      total_disc_dust_poll: acc.total_disc_dust_poll + (e.disc_dust_poll || 0),
      total_final_w: acc.total_final_w + (e.final_w || 0),
      total_g_issued: acc.total_g_issued + (e.g_issued || 0),
      total_cash_paid: acc.total_cash_paid + (e.cash_paid || 0),
      total_diesel_paid: acc.total_diesel_paid + (e.diesel_paid || 0),
      total_tp_weight: acc.total_tp_weight + (parseFloat(e.tp_weight || 0) || 0)
    }), { total_kg: 0, total_qntl: 0, total_bag: 0, total_g_deposite: 0,
      total_gbw_cut: 0, total_mill_w: 0, total_p_pkt_cut: 0, total_cutting: 0,
      total_disc_dust_poll: 0, total_final_w: 0, total_g_issued: 0, total_cash_paid: 0, total_diesel_paid: 0, total_tp_weight: 0 });
  }

  getSuggestions(field) {
    const values = new Set();
    this.data.entries.forEach(e => { if (e[field]) values.add(e[field]); });
    return Array.from(values);
  }

  getMandiTargets(filters = {}) {
    let targets = [...this.data.mandi_targets];
    if (filters.kms_year) targets = targets.filter(t => t.kms_year === filters.kms_year);
    if (filters.season) targets = targets.filter(t => t.season === filters.season);
    return targets;
  }

  addMandiTarget(target) {
    const newTarget = {
      id: uuidv4(), ...target,
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
        ...this.data.mandi_targets[index], ...target,
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

  getTruckPayment(entryId) {
    const found = this.data.truck_payments.find(p => p.entry_id === entryId);
    if (found) return { rate_per_qntl: 32, paid_amount: 0, status: 'pending', payment_history: [], ...found };
    return { entry_id: entryId, rate_per_qntl: 32, paid_amount: 0, status: 'pending', payment_history: [] };
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

  getAgentPayment(mandiName, kmsYear, season) {
    return this.data.agent_payments.find(p =>
      (p.mandi_name||'').toLowerCase() === (mandiName||'').toLowerCase() && p.kms_year === kmsYear && p.season === season
    ) || { mandi_name: mandiName, kms_year: kmsYear, season: season, paid_amount: 0, status: 'pending', payment_history: [] };
  }

  updateAgentPayment(mandiName, kmsYear, season, payment) {
    const index = this.data.agent_payments.findIndex(p =>
      (p.mandi_name||'').toLowerCase() === (mandiName||'').toLowerCase() && p.kms_year === kmsYear && p.season === season
    );
    if (index !== -1) {
      this.data.agent_payments[index] = { ...this.data.agent_payments[index], ...payment };
    } else {
      this.data.agent_payments.push({ id: uuidv4(), mandi_name: mandiName, kms_year: kmsYear, season: season, ...payment });
    }
    this.save();
    return this.getAgentPayment(mandiName, kmsYear, season);
  }

  // Milling
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
      ...data, husk_percent: huskPct, rice_qntl: riceQntl,
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
    return entries.sort((a, b) => {
      const dateComp = (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10));
      if (dateComp !== 0) return dateComp;
      return (parseInt(b.rst_no) || 0) - (parseInt(a.rst_no) || 0);
    });
  }

  createMillingEntry(data) {
    if (!this.data.milling_entries) this.data.milling_entries = [];
    const calculated = this.calculateMillingFields(data);
    const entry = {
      id: uuidv4(), date: calculated.date || new Date().toISOString().split('T')[0],
      rice_type: calculated.rice_type || 'parboiled', paddy_input_qntl: calculated.paddy_input_qntl || 0,
      rice_percent: calculated.rice_percent || 0, bran_percent: calculated.bran_percent || 0,
      kunda_percent: calculated.kunda_percent || 0, broken_percent: calculated.broken_percent || 0,
      kanki_percent: calculated.kanki_percent || 0, husk_percent: calculated.husk_percent,
      rice_qntl: calculated.rice_qntl, bran_qntl: calculated.bran_qntl,
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

  // ============ DATA MIGRATION (same as JsonDatabase) ============
  migrateOldEntries(data) {
    if (!data) return;
    if (!data._migrations) data._migrations = {};
    if (data._migrations.accounting_entries_v2) return;
    console.log('[Migration] Starting accounting entries migration (v2)...');
    let created = 0;
    const now = new Date().toISOString();
    if (!data.cash_transactions) data.cash_transactions = [];
    const existingRefs = new Set(data.cash_transactions.map(t => t.reference).filter(Boolean));
    const refExists = (ref) => existingRefs.has(ref);

    (data.rice_sales || []).forEach(rs => {
      const buyer = (rs.buyer_name || rs.party_name || '').trim();
      const total = parseFloat(rs.total_amount) || 0;
      if (buyer && total > 0 && !refExists(`rice_sale:${rs.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: rs.date || '', account: 'ledger', txn_type: 'jama', amount: total, category: buyer, party_type: 'Rice Sale', description: `Rice sale to ${buyer} [migrated]`, reference: `rice_sale:${rs.id}`, kms_year: rs.kms_year || '', season: rs.season || '', created_by: rs.created_by || '', created_at: now, updated_at: now });
        created++;
      }
    });

    (data.frk_purchases || []).forEach(fp => {
      const seller = (fp.seller_name || fp.party_name || '').trim();
      const total = parseFloat(fp.total_amount) || 0;
      if (seller && total > 0 && !refExists(`frk_purchase:${fp.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: fp.date || '', account: 'ledger', txn_type: 'jama', amount: total, category: seller, party_type: 'FRK Purchase', description: `FRK purchase from ${seller} [migrated]`, reference: `frk_purchase:${fp.id}`, kms_year: fp.kms_year || '', season: fp.season || '', created_by: fp.created_by || '', created_at: now, updated_at: now });
        created++;
      }
    });

    (data.byproduct_sales || []).forEach(bp => {
      const buyer = (bp.buyer_name || '').trim();
      const total = parseFloat(bp.total_amount) || 0;
      if (buyer && total > 0 && !refExists(`byproduct:${bp.id}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: bp.date || '', account: 'ledger', txn_type: 'jama', amount: total, category: buyer, party_type: 'By-Product Sale', description: `${(bp.product || 'Byproduct')} sale [migrated]`, reference: `byproduct:${bp.id}`, kms_year: bp.kms_year || '', season: bp.season || '', created_by: bp.created_by || '', created_at: now, updated_at: now });
        created++;
      }
    });

    (data.mill_parts_stock || []).forEach(mp => {
      const party = (mp.party_name || '').trim();
      const total = parseFloat(mp.total_amount) || 0;
      if (mp.txn_type === 'in' && party && total > 0 && !refExists(`lp_mill_part:${mp.id.slice(0,8)}`)) {
        data.cash_transactions.push({ id: uuidv4(), date: mp.date || '', account: 'ledger', txn_type: 'jama', amount: total, category: party, party_type: 'Local Party', description: `Mill Part: ${mp.part_name || ''} [migrated]`, reference: `lp_mill_part:${mp.id.slice(0,8)}`, kms_year: mp.kms_year || '', season: mp.season || '', created_by: mp.created_by || '', created_at: now, updated_at: now });
        created++;
      }
    });

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
    if (created > 0) this.save();
  }

  // getData - used by vigi_proxy for /settings path
  getData(path) {
    if (path === '/settings') {
      const settings = (this.data.app_settings || []);
      return settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
    }
    const key = path.replace(/^\//, '');
    return this.data[key];
  }

  // push - used by vigi_proxy to save settings
  push(path, value, _save = true) {
    const key = path.replace(/^\//, '');
    if (key === 'settings') {
      // Save as app_settings items
      if (!this.data.app_settings) this.data.app_settings = [];
      for (const [k, v] of Object.entries(value)) {
        const idx = this.data.app_settings.findIndex(s => s.key === k);
        if (idx >= 0) {
          this.data.app_settings[idx].value = v;
        } else {
          this.data.app_settings.push({ id: uuidv4(), key: k, value: v });
        }
      }
    } else {
      this.data[key] = value;
    }
    this.save();
  }

  // Close database connection
  close() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._doSave();
    }
    try {
      // Force WAL checkpoint before close (merges WAL into main DB file)
      // This ensures Google Drive syncs a complete, self-contained .db file
      this.sqlite.pragma('wal_checkpoint(TRUNCATE)');
      this.sqlite.close();
    } catch {}
  }
}

module.exports = { SqliteDatabase, ARRAY_COLLECTIONS, KV_KEYS };
