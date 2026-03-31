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
        timeout: 5000
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
   * Tries HTTPS first (modern NVRs), then HTTP fallback.
   */
  const _protocolCache = {}; // Cache working protocol per IP
  async function digestRequest(deviceIp, path, username, password) {
    // Use cached protocol if known, otherwise try HTTPS first then HTTP
    const cached = _protocolCache[deviceIp];
    const protocols = cached ? [cached] : ['https', 'http'];
    let lastError = null;

    for (const proto of protocols) {
      try {
        const baseUrl = `${proto}://${deviceIp}${path}`;

        // Step 1: Initial request (expect 401 for Digest, or snapshot directly)
        const res1 = await rawRequest(baseUrl, {}, 5);

        // If we got the image directly (no auth needed)
        if (res1.status === 200 && res1.body.length > 100) {
          _protocolCache[deviceIp] = proto;
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
        _protocolCache[deviceIp] = proto; // Cache working protocol
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

    // Try multiple snapshot paths
    const paths = [
      `/snapshot?channel=${channel}`,
      '/cgi-bin/snapshot.cgi',
      `/cgi-bin/snapshot.cgi?channel=${channel}`,
      '/ISAPI/Streaming/channels/101/picture',
      '/snap.jpg',
      '/onvif-http/snapshot',
    ];

    for (const path of paths) {
      try {
        const result = await digestRequest(deviceIp, path, username, password);
        if (result.status === 200 && result.body.length > 100) {
          return res.json({ success: true, message: `Connected via ${path}! Snapshot: ${result.body.length} bytes`, imageSize: result.body.length, path });
        }
      } catch (err) {
        console.log(`[VIGI Test] ${path} failed: ${err.message}`);
      }
    }

    // All paths failed
    res.json({ success: false, error: `Camera ${deviceIp} pe koi snapshot endpoint nahi mila. Ye camera HTTP snapshot support nahi karta - RTSP mode use karein.` });
  });

  /** GET /api/vigi-diagnose → Full VIGI camera diagnostics */
  router.get('/api/vigi-diagnose', async (req, res) => {
    const deviceIp = req.query.ip || '';
    const username = req.query.username || 'admin';
    const password = req.query.password || '';
    const channel = req.query.channel || '1';

    const result = {
      ip: deviceIp,
      networkReachable: false,
      portScan: {},
      httpAccess: null,
      digestAuth: null,
      snapshotTest: null,
      snapshotPath: null,
      diagnosis: '',
      diagnosisHi: ''
    };

    if (!deviceIp) {
      result.diagnosis = 'No IP provided';
      result.diagnosisHi = 'Camera/NVR ka IP nahi diya gaya';
      return res.json(result);
    }

    // 1. TCP port scan
    const net = require('net');
    function tcpCheck(host, port, timeoutMs = 4000) {
      return new Promise((resolve) => {
        const sock = new net.Socket();
        const timer = setTimeout(() => { sock.destroy(); resolve({ open: false, error: 'timeout' }); }, timeoutMs);
        sock.connect(port, host, () => { clearTimeout(timer); sock.destroy(); resolve({ open: true }); });
        sock.on('error', (e) => { clearTimeout(timer); sock.destroy(); resolve({ open: false, error: e.code || e.message }); });
      });
    }

    const portsToCheck = [80, 443, 554, 8080];
    const scanResults = await Promise.all(portsToCheck.map(async (p) => {
      const r = await tcpCheck(deviceIp, p);
      return [p, r];
    }));
    for (const [p, r] of scanResults) {
      result.portScan[p] = r.open ? 'OPEN' : `CLOSED (${r.error})`;
      if (r.open) result.networkReachable = true;
    }

    if (!result.networkReachable) {
      const firstErr = scanResults[0]?.[1]?.error || 'unknown';
      if (firstErr === 'EHOSTUNREACH' || firstErr === 'ENETUNREACH') {
        result.diagnosis = `IP ${deviceIp} not reachable - not on same network`;
        result.diagnosisHi = `IP ${deviceIp} tak pahuncha nahi ja raha - aap camera wale network (LAN) pe nahi ho. Mill ka WiFi connect karo`;
      } else if (firstErr === 'ECONNREFUSED') {
        result.diagnosis = `IP ${deviceIp} refused connection - device OFF or firewall`;
        result.diagnosisHi = `IP ${deviceIp} ne connection refuse kiya - device band hai ya firewall block kar raha hai`;
      } else if (firstErr === 'timeout') {
        result.diagnosis = `IP ${deviceIp} timed out - device not responding or different network`;
        result.diagnosisHi = `IP ${deviceIp} se koi response nahi aaya - device band hai ya aap alag network pe ho`;
      } else {
        result.diagnosis = `IP ${deviceIp} not reachable: ${firstErr}`;
        result.diagnosisHi = `IP ${deviceIp} se connect nahi ho paya: ${firstErr}`;
      }
      return res.json(result);
    }

    // 2. HTTP access + Digest Auth + Snapshot test
    const paths = [
      `/snapshot?channel=${channel}`,
      '/cgi-bin/snapshot.cgi',
      `/cgi-bin/snapshot.cgi?channel=${channel}`,
      '/ISAPI/Streaming/channels/101/picture',
      '/snap.jpg',
      '/onvif-http/snapshot',
    ];

    for (const path of paths) {
      try {
        const r = await digestRequest(deviceIp, path, username, password);
        result.httpAccess = 'OK';
        if (r.status === 200 && r.body.length > 100) {
          result.digestAuth = 'OK';
          result.snapshotTest = `OK - ${r.body.length} bytes`;
          result.snapshotPath = path;
          result.diagnosis = 'Camera working! Snapshot received successfully';
          result.diagnosisHi = `Camera chal raha hai! Snapshot mil gaya (${path})`;
          return res.json(result);
        } else if (r.status === 401) {
          result.digestAuth = 'FAILED - wrong username/password';
        } else {
          result.httpAccess = `HTTP ${r.status}`;
        }
      } catch (err) {
        if (err.message.includes('No digest nonce')) {
          result.httpAccess = 'OK';
          result.digestAuth = 'No Digest Auth support on this path';
        }
      }
    }

    // No snapshot found
    if (result.digestAuth && result.digestAuth.startsWith('FAILED')) {
      result.snapshotTest = 'Not tested - auth failed';
      result.diagnosis = 'Network OK but wrong username/password';
      result.diagnosisHi = 'Network OK hai lekin username ya password galat hai. Credentials check karo';
    } else {
      result.snapshotTest = 'Failed - no working snapshot path found';
      result.diagnosis = 'Network OK but no HTTP snapshot endpoint found. Camera may not support HTTP snapshots';
      result.diagnosisHi = 'Network OK hai lekin koi snapshot endpoint nahi mila. Ye camera HTTP snapshot support nahi karta - RTSP mode try karo';
    }

    res.json(result);
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
