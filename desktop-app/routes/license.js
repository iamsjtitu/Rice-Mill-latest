/**
 * License info API — exposed to frontend so Settings > License tab can show current status.
 * Reads from license-manager (encrypted cache).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const licenseManager = require('../license-manager');

module.exports = (database) => {
  const router = express.Router();

  // GET /api/license/info — full license status (for Settings page)
  router.get('/api/license/info', (req, res) => {
    try {
      const status = licenseManager.getStatus();
      if (status.activated) {
        return res.json({
          ...status,
          machine_fingerprint: licenseManager.getMachineFingerprint(),
          pc_info: licenseManager.getPcInfo(),
        });
      }
      // Not activated — include debug info so admin can diagnose
      let cachePath = '', cacheExists = false;
      try {
        const { app } = require('electron');
        cachePath = path.join(app.getPath('userData'), 'license.enc');
        cacheExists = fs.existsSync(cachePath);
      } catch { /* non-electron context */ }
      res.json({
        activated: false,
        debug: {
          cache_path: cachePath,
          cache_file_exists: cacheExists,
          cache_file_size: cacheExists ? fs.statSync(cachePath).size : 0,
          machine_fingerprint: licenseManager.getMachineFingerprint(),
        },
      });
    } catch (e) {
      res.status(500).json({ error: e.message, stack: (e.stack || '').split('\n').slice(0, 5).join('\n') });
    }
  });

  // POST /api/license/heartbeat — manual verify (button in Settings)
  router.post('/api/license/heartbeat', async (req, res) => {
    try {
      const result = await licenseManager.sendHeartbeat();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/license/repair — re-run activation sync with server using existing key
  // Useful when cache got corrupted/deleted post-update but license is still valid on server
  router.post('/api/license/repair', async (req, res) => {
    try {
      const { key } = req.body || {};
      if (!key) return res.status(400).json({ error: 'key required' });
      const result = await licenseManager.activateLicense(key);
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  return router;
};
