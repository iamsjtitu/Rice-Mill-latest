/**
 * VIGI Camera/NVR Proxy – Direct snapshot via HTTP/HTTPS OpenAPI (no ffmpeg!)
 * Supports: NVR (with channels) + Direct Camera IP (single channel)
 * Uses Digest Authentication. Tries HTTP first, then HTTPS.
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');

module.exports = function vigiProxyRoutes(router, database) {

  function getVigiConfig() {
    try {
      const settings = database.getData('/settings') || {};
      return settings.vigi_nvr || {};
    } catch { return {}; }
  }

  function md5(str) { return crypto.createHash('md5').update(str).digest('hex'); }

  function parseDigestChallenge(header) {
    if (!header) return null;
    const parts = {};
    const regex = /(\w+)="([^"]+)"/g;
    let match;
    while ((match = regex.exec(header)) !== null) {
      parts[match[1]] = match[2];
    }
    const qopMatch = header.match(/qop=([^,\s]+)/);
    if (qopMatch && !parts.qop) parts.qop = qopMatch[1].replace(/"/g, '');
    return parts;
  }

  /**
   * Make authenticated request to VIGI device with Digest auth.
   * Tries HTTP first (port 80), then HTTPS (port 443) as fallback.
   */
  function vigiRequest(deviceIp, path, username, password, forceProtocol) {
    return new Promise(async (resolve, reject) => {
      const protocols = forceProtocol === 'https' ? ['https'] :
                        forceProtocol === 'http'  ? ['http'] :
                        ['http', 'https']; // Try HTTP first (most NVRs/cameras use HTTP)

      let lastError = null;
      for (const proto of protocols) {
        try {
          const result = await _doDigestRequest(deviceIp, path, username, password, proto);
          return resolve(result);
        } catch (err) {
          lastError = err;
          console.log(`[VIGI] ${proto.toUpperCase()} failed for ${deviceIp}: ${err.message}, trying next...`);
        }
      }
      reject(lastError || new Error('All protocols failed'));
    });
  }

  function _doDigestRequest(host, path, username, password, protocol) {
    return new Promise((resolve, reject) => {
      const isHttps = protocol === 'https';
      const mod = isHttps ? https : http;
      const port = isHttps ? 443 : 80;
      const agent = isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined;

      const opts1 = {
        hostname: host, port, path, method: 'GET',
        headers: { 'User-Agent': 'MillEntrySystem/1.0' },
        timeout: 8000
      };
      if (agent) opts1.agent = agent;

      const req1 = mod.request(opts1, (res1) => {
        if (res1.statusCode !== 401) {
          const chunks = [];
          res1.on('data', c => chunks.push(c));
          res1.on('end', () => resolve({ status: res1.statusCode, headers: res1.headers, body: Buffer.concat(chunks) }));
          return;
        }
        res1.resume();

        const wwwAuth = res1.headers['www-authenticate'] || '';
        const challenge = parseDigestChallenge(wwwAuth);
        if (!challenge || !challenge.nonce) {
          reject(new Error('No digest challenge received'));
          return;
        }

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

        const opts2 = {
          hostname: host, port, path, method: 'GET',
          headers: { 'Authorization': authHeader, 'User-Agent': 'MillEntrySystem/1.0' },
          timeout: 8000
        };
        if (agent) opts2.agent = agent;

        const req2 = mod.request(opts2, (res2) => {
          const chunks = [];
          res2.on('data', c => chunks.push(c));
          res2.on('end', () => resolve({ status: res2.statusCode, headers: res2.headers, body: Buffer.concat(chunks) }));
        });
        req2.on('error', reject);
        req2.on('timeout', () => { req2.destroy(); reject(new Error(`${protocol} timeout`)); });
        req2.end();
      });

      req1.on('error', reject);
      req1.on('timeout', () => { req1.destroy(); reject(new Error(`${protocol} connection timeout`)); });
      req1.end();
    });
  }

  /** GET /api/vigi-snapshot?channel=X&nvr_ip=...&username=...&password=... */
  router.get('/api/vigi-snapshot', async (req, res) => {
    const channel = req.query.channel || '1';
    const config = getVigiConfig();
    const deviceIp = req.query.nvr_ip || config.nvr_ip;
    const username = req.query.username || config.username || 'admin';
    const password = req.query.password || config.password || '';

    if (!deviceIp) return res.status(400).json({ error: 'Device IP not configured' });

    try {
      const result = await vigiRequest(deviceIp, `/snapshot?channel=${channel}`, username, password);
      if (result.status === 200 && result.body.length > 100) {
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'no-cache, no-store');
        res.send(result.body);
      } else {
        console.error(`[VIGI] Snapshot failed: status=${result.status}, bodyLen=${result.body.length}`);
        res.status(502).json({ error: 'Snapshot failed', status: result.status });
      }
    } catch (err) {
      console.error('[VIGI] Snapshot error:', err.message);
      res.status(502).json({ error: err.message });
    }
  });

  /** GET /api/vigi-stream?channel=X → MJPEG stream by polling snapshots */
  router.get('/api/vigi-stream', async (req, res) => {
    const channel = req.query.channel || '1';
    const config = getVigiConfig();
    const deviceIp = req.query.nvr_ip || config.nvr_ip;
    const username = req.query.username || config.username || 'admin';
    const password = req.query.password || config.password || '';
    const fps = parseInt(req.query.fps) || 2;
    const interval = Math.max(200, Math.floor(1000 / fps));

    if (!deviceIp) return res.status(400).json({ error: 'Device IP not configured' });

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
          const result = await vigiRequest(deviceIp, `/snapshot?channel=${channel}`, username, password);
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

  /** GET /api/vigi-test → Test connection (tries HTTP then HTTPS) */
  router.get('/api/vigi-test', async (req, res) => {
    const config = getVigiConfig();
    const deviceIp = req.query.nvr_ip || config.nvr_ip;
    const username = req.query.username || config.username || 'admin';
    const password = req.query.password || config.password || '';
    const channel = req.query.channel || '1';

    if (!deviceIp) return res.json({ success: false, error: 'IP not set' });

    try {
      const result = await vigiRequest(deviceIp, `/snapshot?channel=${channel}`, username, password);
      if (result.status === 200 && result.body.length > 100) {
        res.json({ success: true, message: `Connected! Snapshot: ${result.body.length} bytes`, imageSize: result.body.length });
      } else {
        res.json({ success: false, error: `HTTP ${result.status}, body ${result.body.length} bytes` });
      }
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });

  /** POST /api/vigi-config → Save settings */
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
        front_ip: req.body.front_ip || '',
        side_ip: req.body.side_ip || '',
        enabled: req.body.enabled !== false
      };
      database.push('/settings', settings, false);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/vigi-config → Get settings */
  router.get('/api/vigi-config', (req, res) => {
    const config = getVigiConfig();
    res.json({
      nvr_ip: config.nvr_ip || '',
      username: config.username || 'admin',
      password: '',
      front_channel: config.front_channel || '',
      side_channel: config.side_channel || '',
      front_ip: config.front_ip || '',
      side_ip: config.side_ip || '',
      enabled: config.enabled !== false
    });
  });

  return router;
};
