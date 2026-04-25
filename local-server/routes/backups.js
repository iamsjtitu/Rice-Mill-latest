const express = require('express');
const { safeSync, safeAsync } = require('./safe_handler');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require('multer');
const AdmZip = require('adm-zip');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

module.exports = function(database, { getBackupsList, createBackup, restoreBackup, getBackupDir, MAX_BACKUPS }) {

  router.get('/api/backups', safeSync(async (req, res) => {
    const backups = getBackupsList();
    const today = new Date().toISOString().substring(0, 10);
    const customDir = database.data?.settings?.custom_backup_dir || null;
    res.json({ backups, has_today_backup: backups.some(b => b.created_at.substring(0, 10) === today), max_backups: MAX_BACKUPS, custom_backup_dir: customDir });
  }));

  router.post('/api/backups', safeSync(async (req, res) => {
    const result = createBackup(database, 'manual');
    if (result.success) return res.json({ success: true, message: 'Backup ban gaya!', backup: result });
    res.status(500).json({ detail: result.error });
  }));

  router.post('/api/backups/restore', safeSync(async (req, res) => {
    const result = restoreBackup(database, req.body.filename, req.body.source_dir);
    if (result.success) return res.json(result);
    res.status(400).json({ detail: result.error });
  }));

  router.delete('/api/backups/:filename', safeSync(async (req, res) => {
    const dir = getBackupDir();
    const customDir = database.data?.settings?.custom_backup_dir;
    let deleted = 0;
    for (const folder of [dir, customDir].filter(Boolean)) {
      const fp = path.join(folder, req.params.filename);
      if (fs.existsSync(fp)) {
        try { fs.unlinkSync(fp); deleted++; } catch (_) {}
      }
    }
    if (deleted === 0) return res.status(404).json({ detail: 'Not found' });
    res.json({ success: true, deleted });
  }));

  // Bulk delete by filenames OR by source category (logout/manual/auto)
  router.post('/api/backups/bulk-delete', safeSync(async (req, res) => {
    const { filenames, source } = req.body || {};
    const dir = getBackupDir();
    const customDir = database.data?.settings?.custom_backup_dir;
    const allBackups = getBackupsList();
    const classify = (fname) => {
      if (fname.startsWith('backup_logout')) return 'logout';
      if (fname.startsWith('backup_manual')) return 'manual';
      if (fname.startsWith('backup_pre-')) return 'pre-restore';
      return 'auto';
    };
    let toDelete = [];
    if (Array.isArray(filenames) && filenames.length > 0) {
      toDelete = filenames;
    } else if (source) {
      toDelete = allBackups.filter(b => classify(b.filename) === source).map(b => b.filename);
    }
    // Dedup filenames + delete from BOTH dirs (a backup file may exist in both)
    const uniqueFilenames = [...new Set(toDelete)];
    let deleted = 0;
    for (const fname of uniqueFilenames) {
      for (const folder of [dir, customDir].filter(Boolean)) {
        try {
          const fp = path.join(folder, fname);
          if (fs.existsSync(fp)) { fs.unlinkSync(fp); deleted++; }
        } catch (_) {}
      }
    }
    res.json({ success: true, deleted });
  }));

  // Auto-cleanup: delete backups older than N days (default 7)
  router.post('/api/backups/cleanup-old', safeSync(async (req, res) => {
    const days = Math.max(1, parseInt(req.body?.days, 10) || 7);
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const dir = getBackupDir();
    const customDir = database.data?.settings?.custom_backup_dir;
    let deleted = 0;
    const tryDelete = (folder) => {
      if (!folder || !fs.existsSync(folder)) return;
      try {
        for (const f of fs.readdirSync(folder)) {
          if (!(f.startsWith('backup_') && f.endsWith('.json'))) continue;
          const fp = path.join(folder, f);
          try {
            const stat = fs.statSync(fp);
            if (stat.mtime.getTime() < cutoff) {
              fs.unlinkSync(fp); deleted++;
            }
          } catch (_) {}
        }
      } catch (_) {}
    };
    tryDelete(dir);
    if (customDir && customDir !== dir) tryDelete(customDir);
    res.json({ success: true, deleted, days });
  }));

  // Auto-delete settings (toggle + days)
  router.get('/api/backups/auto-delete', safeSync(async (req, res) => {
    const s = database.data?.settings || {};
    res.json({
      enabled: !!s.backup_auto_delete_enabled,
      days: parseInt(s.backup_auto_delete_days, 10) || 7,
    });
  }));
  router.put('/api/backups/auto-delete', safeSync(async (req, res) => {
    if (!database.data.settings) database.data.settings = {};
    if (typeof req.body.enabled === 'boolean') database.data.settings.backup_auto_delete_enabled = req.body.enabled;
    if (req.body.days !== undefined) database.data.settings.backup_auto_delete_days = Math.max(1, parseInt(req.body.days, 10) || 7);
    database.save();
    res.json({
      enabled: !!database.data.settings.backup_auto_delete_enabled,
      days: parseInt(database.data.settings.backup_auto_delete_days, 10) || 7,
    });
  }));

  router.get('/api/backups/status', safeSync(async (req, res) => {
    const backups = getBackupsList();
    const today = new Date().toISOString().substring(0, 10);
    const customDir = database.data?.settings?.custom_backup_dir || null;
    res.json({ has_today_backup: backups.some(b => b.created_at.substring(0, 10) === today), last_backup: backups[0] || null, total_backups: backups.length, custom_backup_dir: customDir });
  }));

  // Backup on logout
  router.post('/api/backups/on-logout', safeSync(async (req, res) => {
    const now = new Date();
    const label = 'logout_' + now.toTimeString().substring(0,8).replace(/:/g, '');
    const result = createBackup(database, label);
    // Also copy to custom backup dir if set
    const customDir = database.data?.settings?.custom_backup_dir;
    if (customDir && result.success) {
      try {
        if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });
        const srcFile = path.join(getBackupDir(), result.filename);
        fs.copyFileSync(srcFile, path.join(customDir, result.filename));
      } catch (e) { console.error('[Backup] Custom dir copy err:', e.message); }
    }
    res.json(result);
  }));

  // Set custom backup directory
  router.put('/api/backups/custom-dir', safeSync(async (req, res) => {
    const { dir } = req.body;
    if (!database.data.settings) database.data.settings = {};
    database.data.settings.custom_backup_dir = dir || null;
    database.save();
    res.json({ success: true, custom_backup_dir: dir || null });
  }));

  // Browse for custom backup folder (opens native dialog)
  router.post('/api/backups/browse-folder', safeAsync(async (req, res) => {
    try {
      const { dialog } = require('electron');
      const { BrowserWindow } = require('electron');
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(win, {
        title: 'Backup Folder Select Karein',
        properties: ['openDirectory', 'createDirectory']
      });
      if (result.canceled || !result.filePaths[0]) return res.json({ success: false, canceled: true });
      res.json({ success: true, dir: result.filePaths[0] });
    } catch (e) {
      res.status(500).json({ detail: e.message });
    }
  }));

  // JSON restore - upload raw JSON backup and restore
  router.post('/api/backups/restore-json', safeSync(async (req, res) => {
    const { data, filename } = req.body;
    if (!data) return res.status(400).json({ detail: 'JSON data missing' });
    let parsed;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) { return res.status(400).json({ detail: 'Invalid JSON format' }); }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return res.status(400).json({ detail: 'JSON must be an object with collection keys' });

    try {
      createBackup(database, 'pre-json-restore');
      let restoredCount = 0;
      for (const [key, val] of Object.entries(parsed)) {
        if (key.startsWith('_')) continue;
        if (Array.isArray(val)) {
          database.data[key] = val;
          restoredCount++;
        } else if (typeof val === 'object' && val !== null) {
          database.data[key] = val;
          restoredCount++;
        }
      }
      database.save();
      res.json({ success: true, message: `JSON Restore ho gaya! ${restoredCount} collections restored.` });
    } catch (e) {
      res.status(500).json({ detail: 'Restore error: ' + e.message });
    }
  }));

  // ZIP download - download all data as ZIP
  router.get('/api/backup/download', safeSync(async (req, res) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').substring(0, 15);
    const filename = `mill_backup_${timestamp}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    const meta = { backup_date: new Date().toISOString(), version: '50.6.0', collections: [] };
    const data = database.data || {};
    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val) && val.length > 0) {
        archive.append(JSON.stringify(val, null, 2), { name: `${key}.json` });
        meta.collections.push({ name: key, count: val.length });
      }
    }
    archive.append(JSON.stringify(meta, null, 2), { name: '_backup_meta.json' });
    archive.finalize();
  }));

  // ZIP restore - upload ZIP and restore data
  router.post('/api/backup/restore', upload.single('file'), safeAsync(async (req, res) => {
    if (!req.file) return res.status(400).json({ detail: 'ZIP file upload karein' });
    if (!req.file.originalname.endsWith('.zip')) return res.status(400).json({ detail: 'Sirf ZIP file' });

    try {
      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();
      const metaEntry = entries.find(e => e.entryName === '_backup_meta.json');
      if (!metaEntry) return res.status(400).json({ detail: 'Valid backup file nahi hai' });

      const meta = JSON.parse(metaEntry.getData().toString('utf8'));
      const restored = [];
      for (const entry of entries) {
        if (entry.entryName === '_backup_meta.json' || !entry.entryName.endsWith('.json')) continue;
        const collName = entry.entryName.replace('.json', '');
        try {
          const docs = JSON.parse(entry.getData().toString('utf8'));
          if (Array.isArray(docs) && docs.length > 0) {
            database.data[collName] = docs;
            restored.push({ name: collName, count: docs.length });
          }
        } catch (e) { /* skip bad entries */ }
      }
      database.save();
      res.json({ success: true, message: `Restore ho gaya! ${restored.length} collections restored.`, restored, backup_date: meta.backup_date });
    } catch (e) {
      res.status(500).json({ detail: 'Restore error: ' + e.message });
    }
  }));

  return router;
};
