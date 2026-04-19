/**
 * License info API — exposed to frontend so Settings > License tab can show current status.
 * Reads from license-manager (encrypted cache).
 */
const express = require('express');
const licenseManager = require('../license-manager');

module.exports = (database) => {
  const router = express.Router();

  // GET /api/license/info — full license status (for Settings page)
  router.get('/api/license/info', (req, res) => {
    try {
      const status = licenseManager.getStatus();
      if (!status.activated) return res.json({ activated: false });
      res.json({
        ...status,
        machine_fingerprint: licenseManager.getMachineFingerprint(),
        pc_info: licenseManager.getPcInfo(),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
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

  return router;
};
