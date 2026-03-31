/**
 * VIGI NVR Proxy – Direct snapshot via VIGI OpenAPI (no ffmpeg needed!)
 * Uses Digest Authentication to get JPEG snapshots from NVR channels.
 */
const https = require('https');
const crypto = require('crypto');

module.exports = function vigiProxyRoutes(router, database) {

  function getVigiConfig() {
    try {
      const settings = database.getData('/settings') || {};
      return settings.vigi_nvr || {};
    } catch { return {}; }
  }

  /** MD5 hash helper */
  function md5(str) { return crypto.createHash('md5').update(str).digest('hex'); }

  /** Parse Digest auth challenge from 401 response */
  function parseDigestChallenge(header) {
    if (!header) return null;
    const parts = {};
    const regex = /(\w+)="([^"]+)"/g;
    let match;
    while ((match = regex.exec(header)) !== null) {
      parts[match[1]] = match[2];
    }
    // Also parse qop without quotes
    const qopMatch = header.match(/qop=([^,\s]+)/);
    if (qopMatch && !parts.qop) parts.qop = qopMatch[1].replace(/"/g, '');
    return parts;
  }

  /** Make authenticated HTTPS request to NVR with Digest auth */
  function vigiRequest(nvrIp, path, username, password) {
    return new Promise((resolve, reject) => {
      const agent = new https.Agent({ rejectUnauthorized: false });

      // Step 1: Send request without auth to get Digest challenge
      const opts1 = {
        hostname: nvrIp, port: 443, path, method: 'GET', agent,
        headers: { 'User-Agent': 'MillEntrySystem/1.0' },
        timeout: 10000
      };

      const req1 = https.request(opts1, (res1) => {
        if (res1.statusCode !== 401) {
          // No auth needed? Collect response
          const chunks = [];
          res1.on('data', c => chunks.push(c));
          res1.on('end', () => resolve({ status: res1.statusCode, headers: res1.headers, body: Buffer.concat(chunks) }));
          return;
        }

        // Drain the 401 response body
        res1.resume();

        // Parse WWW-Authenticate header
        const wwwAuth = res1.headers['www-authenticate'] || '';
        const challenge = parseDigestChallenge(wwwAuth);
        if (!challenge || !challenge.nonce) {
          reject(new Error('No digest challenge received'));
          return;
        }

        // Step 2: Build Digest auth response
        const realm = challenge.realm || 'TP-LINK IP-Camera';
        const nonce = challenge.nonce;
        const qop = challenge.qop || 'auth';
        const nc = '00000001';
        const cnonce = crypto.randomBytes(8).toString('hex');
        const algorithm = (challenge.algorithm || 'MD5').toUpperCase();

        let ha1, ha2, response;
        if (algorithm === 'SHA-256') {
          const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
          ha1 = sha256(`${username}:${realm}:${password}`);
          ha2 = sha256(`GET:${path}`);
          response = sha256(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
        } else {
          ha1 = md5(`${username}:${realm}:${password}`);
          ha2 = md5(`GET:${path}`);
          response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
        }

        const authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${path}", algorithm=${algorithm}, response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

        // Step 3: Send authenticated request
        const opts2 = {
          hostname: nvrIp, port: 443, path, method: 'GET', agent,
          headers: { 'Authorization': authHeader, 'User-Agent': 'MillEntrySystem/1.0' },
          timeout: 10000
        };

        const req2 = https.request(opts2, (res2) => {
          const chunks = [];
          res2.on('data', c => chunks.push(c));
          res2.on('end', () => resolve({ status: res2.statusCode, headers: res2.headers, body: Buffer.concat(chunks) }));
        });
        req2.on('error', reject);
        req2.on('timeout', () => { req2.destroy(); reject(new Error('Request timeout')); });
        req2.end();
      });

      req1.on('error', reject);
      req1.on('timeout', () => { req1.destroy(); reject(new Error('Connection timeout')); });
      req1.end();
    });
  }

  /** GET /api/vigi-snapshot?channel=X → single JPEG from NVR */
  router.get('/api/vigi-snapshot', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).json({ error: 'channel required' });

    const config = getVigiConfig();
    const nvrIp = req.query.nvr_ip || config.nvr_ip;
    const username = config.username || 'admin';
    const password = config.password || '';

    if (!nvrIp) return res.status(400).json({ error: 'VIGI NVR IP not configured' });

    try {
      const result = await vigiRequest(nvrIp, `/snapshot?channel=${channel}`, username, password);
      if (result.status === 200 && result.body.length > 100) {
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'no-cache, no-store');
        res.send(result.body);
      } else {
        console.error(`[VIGI] Snapshot failed: status=${result.status}, bodyLen=${result.body.length}`);
        res.status(502).json({ error: 'NVR snapshot failed', status: result.status });
      }
    } catch (err) {
      console.error('[VIGI] Snapshot error:', err.message);
      res.status(502).json({ error: err.message });
    }
  });

  /** GET /api/vigi-stream?channel=X → MJPEG stream by polling snapshots */
  router.get('/api/vigi-stream', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).json({ error: 'channel required' });

    const config = getVigiConfig();
    const nvrIp = req.query.nvr_ip || config.nvr_ip;
    const username = config.username || 'admin';
    const password = config.password || '';
    const fps = parseInt(req.query.fps) || 2;
    const interval = Math.max(200, Math.floor(1000 / fps));

    if (!nvrIp) return res.status(400).json({ error: 'VIGI NVR IP not configured' });

    const boundary = 'vigiframe';
    res.writeHead(200, {
      'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    let running = true;
    req.on('close', () => { running = false; });

    const poll = async () => {
      while (running) {
        try {
          const result = await vigiRequest(nvrIp, `/snapshot?channel=${channel}`, username, password);
          if (result.status === 200 && result.body.length > 100) {
            try {
              res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${result.body.length}\r\n\r\n`);
              res.write(result.body);
              res.write('\r\n');
            } catch { running = false; break; }
          }
        } catch (err) {
          console.error('[VIGI Stream] Poll error:', err.message);
        }
        await new Promise(r => setTimeout(r, interval));
      }
      res.end();
    };
    poll();
  });

  /** GET /api/vigi-test → Test NVR connection */
  router.get('/api/vigi-test', async (req, res) => {
    const config = getVigiConfig();
    const nvrIp = req.query.nvr_ip || config.nvr_ip;
    const username = req.query.username || config.username || 'admin';
    const password = req.query.password || config.password || '';
    const channel = req.query.channel || '1';

    if (!nvrIp) return res.json({ success: false, error: 'NVR IP not set' });

    try {
      const result = await vigiRequest(nvrIp, `/snapshot?channel=${channel}`, username, password);
      if (result.status === 200 && result.body.length > 100) {
        res.json({ success: true, message: `Connected! Snapshot size: ${result.body.length} bytes`, imageSize: result.body.length });
      } else {
        res.json({ success: false, error: `HTTP ${result.status}, body ${result.body.length} bytes` });
      }
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });

  /** POST /api/vigi-config → Save VIGI NVR settings */
  router.post('/api/vigi-config', (req, res) => {
    try {
      let settings = {};
      try { settings = database.getData('/settings'); } catch {}
      settings.vigi_nvr = {
        nvr_ip: req.body.nvr_ip || '',
        username: req.body.username || 'admin',
        password: req.body.password || '',
        front_channel: req.body.front_channel || '',
        side_channel: req.body.side_channel || '',
        enabled: req.body.enabled !== false
      };
      database.push('/settings', settings, false);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/vigi-config → Get VIGI NVR settings */
  router.get('/api/vigi-config', (req, res) => {
    const config = getVigiConfig();
    res.json({
      nvr_ip: config.nvr_ip || '',
      username: config.username || 'admin',
      password: '',  // Don't expose password
      front_channel: config.front_channel || '',
      side_channel: config.side_channel || '',
      enabled: config.enabled !== false
    });
  });

  return router;
};
