/**
 * VIGI Camera/NVR Proxy – Direct snapshot via HTTP/HTTPS OpenAPI (no ffmpeg!)
 * Supports: NVR (with channels) + Direct Camera IP (single channel)
 * Uses Digest Authentication. Follows 301/302 redirects. Tries HTTP then HTTPS.
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const url = require('url');

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
    while ((match = regex.exec(header)) !== null) parts[match[1]] = match[2];
    const qopMatch = header.match(/qop=([^,\s]+)/);
    if (qopMatch && !parts.qop) parts.qop = qopMatch[1].replace(/"/g, '');
    return parts;
  }

  /** Single HTTP/HTTPS request that follows redirects (max 5) */
  function rawRequest(fullUrl, headers, maxRedirects) {
    return new Promise((resolve, reject) => {
      if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

      const parsed = new URL(fullUrl);
      const isHttps = parsed.protocol === 'https:';
      const mod = isHttps ? https : http;
      const agent = isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined;

      const opts = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { 'User-Agent': 'MillEntrySystem/1.0', ...headers },
        timeout: 10000
      };
      if (agent) opts.agent = agent;

      const req = mod.request(opts, (res) => {
        // Follow redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          let newUrl = res.headers.location;
          if (newUrl.startsWith('/')) {
            newUrl = `${parsed.protocol}//${parsed.host}${newUrl}`;
          }
          console.log(`[VIGI] Following redirect ${res.statusCode} → ${newUrl}`);
          return rawRequest(newUrl, headers, maxRedirects - 1).then(resolve).catch(reject);
        }

        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
          finalUrl: fullUrl
        }));
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.end();
    });
  }

  /**
   * Digest Auth request with redirect following.
   * Step 1: Hit the URL → get 401 + Digest challenge (or follow redirects)
   * Step 2: Build Digest auth header → hit again
   */
  async function digestRequest(deviceIp, path, username, password) {
    // Try HTTP first, then HTTPS
    const protocols = ['http', 'https'];
    let lastError = null;

    for (const proto of protocols) {
      try {
        const baseUrl = `${proto}://${deviceIp}${path}`;

        // Step 1: Initial request (expect 401 for Digest, or snapshot directly)
        const res1 = await rawRequest(baseUrl, {}, 5);

        // If we got the image directly (no auth needed)
        if (res1.status === 200 && res1.body.length > 100) {
          return res1;
        }

        // If NOT 401, this protocol doesn't work
        if (res1.status !== 401) {
          lastError = new Error(`${proto}: HTTP ${res1.status}, body ${res1.body.length} bytes`);
          console.log(`[VIGI] ${proto} returned ${res1.status} (not 401), trying next...`);
          continue;
        }

        // Step 2: Got 401, do Digest auth
        const wwwAuth = res1.headers['www-authenticate'] || '';
        const challenge = parseDigestChallenge(wwwAuth);
        if (!challenge || !challenge.nonce) {
          lastError = new Error(`${proto}: No digest nonce in 401 response`);
          continue;
        }

        const realm = challenge.realm || '';
        const nonce = challenge.nonce;
        const qop = challenge.qop || 'auth';
        const nc = '00000001';
        const cnonce = crypto.randomBytes(8).toString('hex');
        const algorithm = (challenge.algorithm || 'MD5').toUpperCase();

        // Use the final URL's path for the digest URI (in case of redirects)
        const digestPath = path;
        let ha1, ha2, response;
        if (algorithm === 'SHA-256') {
          const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
          ha1 = sha256(`${username}:${realm}:${password}`);
          ha2 = sha256(`GET:${digestPath}`);
          response = sha256(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
        } else {
          ha1 = md5(`${username}:${realm}:${password}`);
          ha2 = md5(`GET:${digestPath}`);
          response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
        }

        const authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${digestPath}", algorithm=${algorithm}, response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

        // Step 3: Authenticated request (also follows redirects)
        const res2 = await rawRequest(baseUrl, { 'Authorization': authHeader }, 5);
        return res2;

      } catch (err) {
        lastError = err;
        console.log(`[VIGI] ${proto} failed for ${deviceIp}: ${err.message}`);
      }
    }

    throw lastError || new Error('All protocols failed');
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
      const result = await digestRequest(deviceIp, `/snapshot?channel=${channel}`, username, password);
      if (result.status === 200 && result.body.length > 100) {
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'no-cache, no-store');
        res.send(result.body);
      } else {
        console.error(`[VIGI] Snapshot failed: status=${result.status}, bodyLen=${result.body.length}`);
        res.status(502).json({ error: 'Snapshot failed', status: result.status, bodyLength: result.body.length });
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
          const result = await digestRequest(deviceIp, `/snapshot?channel=${channel}`, username, password);
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

  /** GET /api/vigi-test → Test connection (tries HTTP then HTTPS, follows redirects) */
  router.get('/api/vigi-test', async (req, res) => {
    const config = getVigiConfig();
    const deviceIp = req.query.nvr_ip || config.nvr_ip;
    const username = req.query.username || config.username || 'admin';
    const password = req.query.password || config.password || '';
    const channel = req.query.channel || '1';

    if (!deviceIp) return res.json({ success: false, error: 'IP not set' });

    try {
      const result = await digestRequest(deviceIp, `/snapshot?channel=${channel}`, username, password);
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
