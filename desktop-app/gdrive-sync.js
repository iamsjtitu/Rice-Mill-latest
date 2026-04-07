/**
 * Google Drive Direct API Sync for Mill Entry System
 * Fast sync: upload on save (3s debounce), poll for changes (10-15s)
 * Client ID & Secret are user-configurable via Settings UI
 */
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const DB_FILENAME = 'millentry-data.db';
const DRIVE_FOLDER = 'MillEntrySync';

class GDriveSync {
  constructor(opts) {
    this.configDir = opts.configDir;
    this.dbFile = opts.dbFile;
    this.port = opts.port;
    this.onReloadNeeded = opts.onReloadNeeded || (() => {});

    this.configFile = path.join(this.configDir, 'gdrive-tokens.json');

    this.oauth2Client = null;
    this.drive = null;
    this.syncing = false;
    this.autoSyncTimer = null;
    this.uploadDebouncer = null;
    this.driveFileId = null;
    this.lastSyncTime = null;
    this.lastSyncDirection = null;
    this.autoSyncEnabled = false;
    this.autoSyncSecs = 10;
    this.lastError = null;
    this._driveModTime = null;
    this.clientId = null;
    this.clientSecret = null;

    this._init();
  }

  _init() {
    try {
      const { google } = require('googleapis');
      this.google = google;

      const config = this._loadConfig();
      this.clientId = config.clientId || null;
      this.clientSecret = config.clientSecret || null;

      if (this.clientId && this.clientSecret) {
        this._setupOAuth(config);
      }
    } catch (e) {
      console.error('[GDrive] Init error:', e.message);
    }
  }

  _getRedirectUri() {
    return `http://localhost:${this.port}/api/gdrive/callback`;
  }

  _setupOAuth(config) {
    this.oauth2Client = new this.google.auth.OAuth2(this.clientId, this.clientSecret, this._getRedirectUri());

    this.oauth2Client.on('tokens', (tokens) => {
      const saved = this._loadConfig();
      if (tokens.refresh_token) saved.refresh_token = tokens.refresh_token;
      if (tokens.access_token) saved.access_token = tokens.access_token;
      if (tokens.expiry_date) saved.expiry_date = tokens.expiry_date;
      this._saveConfig(saved);
    });

    if (config.refresh_token) {
      this.oauth2Client.setCredentials({
        refresh_token: config.refresh_token,
        access_token: config.access_token,
        expiry_date: config.expiry_date
      });
      this.drive = this.google.drive({ version: 'v3', auth: this.oauth2Client });
      this.driveFileId = config.driveFileId || null;
      this.autoSyncEnabled = config.autoSyncEnabled || false;
      this.autoSyncSecs = config.autoSyncSecs || 10;
      this.lastSyncTime = config.lastSyncTime || null;
      this.lastSyncDirection = config.lastSyncDirection || null;
      this._driveModTime = config._driveModTime || null;
      console.log('[GDrive] Loaded credentials, connected');
    }
  }

  // Save Client ID & Secret from Settings UI, then re-init OAuth
  setCredentials(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this._saveConfig({ clientId, clientSecret });
    // Reset connection with new credentials
    this.drive = null;
    this.driveFileId = null;
    const config = this._loadConfig();
    this._setupOAuth(config);
    console.log('[GDrive] Credentials updated');
  }

  _loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    } catch (_) {}
    return {};
  }

  _saveConfig(extra = {}) {
    try {
      if (!fs.existsSync(this.configDir)) fs.mkdirSync(this.configDir, { recursive: true });
      const config = { ...this._loadConfig(), ...extra,
        driveFileId: this.driveFileId,
        autoSyncEnabled: this.autoSyncEnabled,
        autoSyncSecs: this.autoSyncSecs,
        lastSyncTime: this.lastSyncTime,
        lastSyncDirection: this.lastSyncDirection,
        _driveModTime: this._driveModTime
      };
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    } catch (e) { console.error('[GDrive] Config save err:', e.message); }
  }

  isConnected() {
    return !!(this.oauth2Client?.credentials?.refresh_token);
  }

  hasCredentials() {
    return !!(this.clientId && this.clientSecret);
  }

  getAuthUrl() {
    if (!this.oauth2Client || !this.hasCredentials()) return null;
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline', scope: SCOPES, prompt: 'consent'
    });
  }

  async handleCallback(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.drive = this.google.drive({ version: 'v3', auth: this.oauth2Client });
    this._saveConfig({
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date
    });
    this.lastError = null;
    console.log('[GDrive] Connected successfully');
    return { success: true };
  }

  disconnect() {
    this.stopAutoSync();
    if (this.oauth2Client) this.oauth2Client.setCredentials({});
    this.drive = null;
    this.driveFileId = null;
    this.lastSyncTime = null;
    this.lastSyncDirection = null;
    this._driveModTime = null;
    // Keep clientId/clientSecret, only remove tokens
    const config = this._loadConfig();
    delete config.refresh_token;
    delete config.access_token;
    delete config.expiry_date;
    config.driveFileId = null;
    config.lastSyncTime = null;
    config.lastSyncDirection = null;
    config._driveModTime = null;
    try { fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2)); } catch (_) {}
    console.log('[GDrive] Disconnected');
  }

  // ---- Drive Operations ----

  async _ensureFolder() {
    const res = await this.drive.files.list({
      q: `name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)', spaces: 'drive'
    });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const f = await this.drive.files.create({
      requestBody: { name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id'
    });
    return f.data.id;
  }

  async _findDriveFile(folderId) {
    const res = await this.drive.files.list({
      q: `name='${DB_FILENAME}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id,modifiedTime,size)', spaces: 'drive'
    });
    return res.data.files.length > 0 ? res.data.files[0] : null;
  }

  async _getDriveFileInfo() {
    if (this.driveFileId) {
      try {
        const res = await this.drive.files.get({
          fileId: this.driveFileId, fields: 'id,modifiedTime,size'
        });
        return res.data;
      } catch (_) { this.driveFileId = null; }
    }
    const folderId = await this._ensureFolder();
    return await this._findDriveFile(folderId);
  }

  async upload() {
    if (!this.drive || this.syncing) return { success: false, reason: this.syncing ? 'busy' : 'not connected' };
    this.syncing = true;
    const t0 = Date.now();
    try {
      const folderId = await this._ensureFolder();
      const existing = this.driveFileId ? { id: this.driveFileId } : await this._findDriveFile(folderId);
      const media = { mimeType: 'application/x-sqlite3', body: fs.createReadStream(this.dbFile) };

      let result;
      if (existing?.id) {
        result = await this.drive.files.update({ fileId: existing.id, media, fields: 'id,modifiedTime,size' });
      } else {
        result = await this.drive.files.create({
          requestBody: { name: DB_FILENAME, parents: [folderId] },
          media, fields: 'id,modifiedTime,size'
        });
      }

      this.driveFileId = result.data.id;
      this._driveModTime = result.data.modifiedTime;
      this.lastSyncTime = new Date().toISOString();
      this.lastSyncDirection = 'upload';
      this.lastError = null;
      this._saveConfig({});
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[GDrive] Upload ${elapsed}s (${(result.data.size / 1024).toFixed(0)}KB)`);
      return { success: true, direction: 'upload', elapsed };
    } catch (e) {
      this.lastError = e.message;
      console.error('[GDrive] Upload err:', e.message);
      return { success: false, error: e.message };
    } finally { this.syncing = false; }
  }

  async download(database) {
    if (!this.drive || this.syncing) return { success: false, reason: this.syncing ? 'busy' : 'not connected' };
    this.syncing = true;
    const t0 = Date.now();
    try {
      const driveFile = await this._getDriveFileInfo();
      if (!driveFile) return { success: false, reason: 'No file on Drive' };

      const tmpPath = this.dbFile + '.gdrive-tmp';
      const dest = fs.createWriteStream(tmpPath);
      const res = await this.drive.files.get(
        { fileId: driveFile.id, alt: 'media' }, { responseType: 'stream' }
      );
      await new Promise((resolve, reject) => {
        res.data.pipe(dest);
        dest.on('finish', resolve);
        dest.on('error', reject);
      });

      // Validate SQLite header
      const hdr = Buffer.alloc(16);
      const fd = fs.openSync(tmpPath, 'r');
      fs.readSync(fd, hdr, 0, 16, 0);
      fs.closeSync(fd);
      if (hdr.toString('utf8', 0, 6) !== 'SQLite') {
        fs.unlinkSync(tmpPath);
        return { success: false, reason: 'Invalid SQLite file from Drive' };
      }

      // Close DB → backup → replace → reload
      if (database?.close) { try { database.close(); } catch (_) {} }
      try { fs.copyFileSync(this.dbFile, this.dbFile + '.pre-sync.bak'); } catch (_) {}
      fs.renameSync(tmpPath, this.dbFile);
      this.onReloadNeeded();

      this._driveModTime = driveFile.modifiedTime;
      this.driveFileId = driveFile.id;
      this.lastSyncTime = new Date().toISOString();
      this.lastSyncDirection = 'download';
      this.lastError = null;
      this._saveConfig({});
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[GDrive] Download ${elapsed}s`);
      return { success: true, direction: 'download', elapsed };
    } catch (e) {
      this.lastError = e.message;
      console.error('[GDrive] Download err:', e.message);
      this.onReloadNeeded(); // try to recover
      return { success: false, error: e.message };
    } finally { this.syncing = false; }
  }

  async smartSync(database) {
    if (!this.drive || this.syncing) return { success: false };
    try {
      const driveFile = await this._getDriveFileInfo();
      if (!driveFile) return await this.upload();

      const localMtime = fs.statSync(this.dbFile).mtimeMs;
      const driveMtime = new Date(driveFile.modifiedTime).getTime();

      // If Drive file modifiedTime hasn't changed from our last known, skip download check
      if (this._driveModTime && driveFile.modifiedTime === this._driveModTime && localMtime > driveMtime) {
        // Local has changes, drive same as before → upload
        return await this.upload();
      }

      if (driveMtime > localMtime + 1500) {
        return await this.download(database);
      } else if (localMtime > driveMtime + 1500) {
        return await this.upload();
      }
      return { success: true, direction: 'none' };
    } catch (e) {
      this.lastError = e.message;
      return { success: false, error: e.message };
    }
  }

  startAutoSync(database) {
    this.stopAutoSync();
    if (!this.isConnected()) return;
    this.autoSyncEnabled = true;
    this._saveConfig({});
    const ms = (this.autoSyncSecs || 10) * 1000;
    this.autoSyncTimer = setInterval(async () => {
      if (this.syncing) return;
      try { await this.smartSync(database); } catch (_) {}
    }, ms);
    console.log(`[GDrive] Auto-sync ON: ${this.autoSyncSecs}s`);
  }

  stopAutoSync() {
    if (this.autoSyncTimer) { clearInterval(this.autoSyncTimer); this.autoSyncTimer = null; }
    this.autoSyncEnabled = false;
    this._saveConfig({});
  }

  // Called after each database.save() - debounced upload
  notifySave() {
    if (!this.isConnected() || !this.autoSyncEnabled) return;
    if (this.uploadDebouncer) clearTimeout(this.uploadDebouncer);
    this.uploadDebouncer = setTimeout(() => this.upload(), 3000);
  }

  getStatus() {
    return {
      connected: this.isConnected(),
      hasCredentials: this.hasCredentials(),
      syncing: this.syncing,
      autoSyncEnabled: this.autoSyncEnabled,
      autoSyncSecs: this.autoSyncSecs,
      lastSyncTime: this.lastSyncTime,
      lastSyncDirection: this.lastSyncDirection,
      driveFileId: this.driveFileId,
      lastError: this.lastError,
      clientId: this.clientId ? this.clientId.substring(0, 12) + '...' : null
    };
  }
}

module.exports = { GDriveSync };
