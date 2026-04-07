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
    const result = restoreBackup(database, req.body.filename);
    if (result.success) return res.json(result);
    res.status(400).json({ detail: result.error });
  }));

  router.delete('/api/backups/:filename', safeSync(async (req, res) => {
    const dir = getBackupDir();
    const fp = path.join(dir, req.params.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ detail: 'Not found' });
    try { fs.unlinkSync(fp); res.json({ success: true }); } catch(e) { res.status(500).json({ detail: e.message }); }
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
