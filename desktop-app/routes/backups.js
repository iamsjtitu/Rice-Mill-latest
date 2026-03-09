const express = require('express');
const { safeSync } = require('./safe_handler');
const router = express.Router();
const fs = require('fs');
const path = require('path');

module.exports = function(database, { getBackupsList, createBackup, restoreBackup, getBackupDir, MAX_BACKUPS }) {

  router.get('/api/backups', safeSync((req, res) => {
    const backups = getBackupsList();
    const today = new Date().toISOString().substring(0, 10);
    res.json({ backups, has_today_backup: backups.some(b => b.created_at.substring(0, 10) === today), max_backups: MAX_BACKUPS });
  }));

  router.post('/api/backups', safeSync((req, res) => {
    const result = createBackup(database, 'manual');
    if (result.success) return res.json({ success: true, message: 'Backup ban gaya!', backup: result });
    res.status(500).json({ detail: result.error });
  }));

  router.post('/api/backups/restore', safeSync((req, res) => {
    const result = restoreBackup(database, req.body.filename);
    if (result.success) return res.json(result);
    res.status(400).json({ detail: result.error });
  }));

  router.delete('/api/backups/:filename', safeSync((req, res) => {
    const dir = getBackupDir();
    const fp = path.join(dir, req.params.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ detail: 'Not found' });
    try { fs.unlinkSync(fp); res.json({ success: true }); } catch(e) { res.status(500).json({ detail: e.message }); }
  }));

  router.get('/api/backups/status', safeSync((req, res) => {
    const backups = getBackupsList();
    const today = new Date().toISOString().substring(0, 10);
    res.json({ has_today_backup: backups.some(b => b.created_at.substring(0, 10) === today), last_backup: backups[0] || null, total_backups: backups.length });
  }));

  return router;
};
