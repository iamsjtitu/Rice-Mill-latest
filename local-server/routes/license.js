/**
 * License info stub for LAN Local-Server (Node.js Express).
 *
 * The real license enforcement runs inside the Electron Desktop App. When a
 * customer installs the MillEntry on the mill-PC in "LAN mode" (this
 * local-server), there is no per-client license check; the whole LAN shares
 * the master's activation. Here we just expose a lightweight stub so the
 * frontend's Settings → License tab doesn't crash on LAN deployments.
 */
const express = require('express');

module.exports = (/* database */) => {
  const router = express.Router();

  router.get('/api/license/info', (req, res) => {
    res.json({
      activated: true,
      key: 'LAN-DEPLOYMENT',
      customer_name: 'LAN Deployment',
      mill_name: 'Local Network (Mill PC)',
      plan: 'lifetime',
      expires_at: null,
      is_master: true,
      last_validated_at: new Date().toISOString(),
      machine_fingerprint: 'lan-stub',
      pc_info: { hostname: 'mill-pc', platform: 'lan', app_version: 'lan' },
    });
  });

  router.post('/api/license/heartbeat', (req, res) => {
    res.json({ active: true, note: 'lan_deployment' });
  });

  return router;
};
