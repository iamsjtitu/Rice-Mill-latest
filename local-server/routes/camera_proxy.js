/**
 * Camera Proxy – RTSP → MJPEG stream via ffmpeg.
 * If ffmpeg not found, falls back to HTTP snapshot polling.
 * Desktop & Local-Server only (same LAN as IP cameras).
 */
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/** Resolve ffmpeg binary path - checks multiple locations for packaged Electron app */
function resolveFfmpegPath() {
  const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  // 1. Check extraResources in packaged Electron app (most reliable for production)
  if (process.resourcesPath) {
    const resPath = path.join(process.resourcesPath, exeName);
    if (fs.existsSync(resPath)) {
      console.log('[FFmpeg] Found in extraResources:', resPath);
      return resPath;
    }
  }

  // 2. Try ffmpeg-static npm package
  try {
    let staticPath = require('ffmpeg-static');
    if (staticPath) {
      if (staticPath.includes('app.asar')) {
        staticPath = staticPath.replace('app.asar', 'app.asar.unpacked');
      }
      if (fs.existsSync(staticPath)) {
        console.log('[FFmpeg] Found via ffmpeg-static:', staticPath);
        return staticPath;
      }
    }
  } catch (_e) {}

  // 3. Check common install locations on Windows
  if (process.platform === 'win32') {
    const winPaths = [
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ffmpeg\\ffmpeg.exe',
      path.join(process.env.LOCALAPPDATA || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
      path.join(process.env.ProgramFiles || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    ];
    for (const wp of winPaths) {
      if (wp && fs.existsSync(wp)) {
        console.log('[FFmpeg] Found at Windows path:', wp);
        return wp;
      }
    }
  }

  // 4. Fallback to system PATH
  console.log('[FFmpeg] Using system PATH fallback');
  return 'ffmpeg';
}

const ffmpegPath = resolveFfmpegPath();

module.exports = function cameraProxyRoutes(router) {

  // Global ffmpeg process tracking - max 2 simultaneous
  const activeProcesses = new Map();
  const MAX_FFMPEG = 2;

  function cleanupProcess(id) {
    const proc = activeProcesses.get(id);
    if (proc) {
      try { proc.kill('SIGKILL'); } catch (_e) {}
      activeProcesses.delete(id);
    }
  }

  function cleanupAllProcesses() {
    for (const [id] of activeProcesses) cleanupProcess(id);
  }

  /** GET /api/camera-kill-all → Force kill ALL active camera streams */
  router.get('/api/camera-kill-all', (req, res) => {
    const count = activeProcesses.size;
    cleanupAllProcesses();
    console.log(`[Camera] Force killed ${count} active streams`);
    res.json({ killed: count });
  });

  /** Encode special chars in RTSP credentials (e.g. @ in password) */
  function encodeRtspUrl(raw) {
    // Format: rtsp://user:pass@host
    const m1 = raw.match(/^(rtsp:\/\/)([^:]+):(.+)@([^@]+)$/);
    if (m1) {
      const [, scheme, user, pass, host] = m1;
      return `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}`;
    }
    // Format: rtsp://user@host (no password)
    const m2 = raw.match(/^(rtsp:\/\/)([^@:]+)@(.+)$/);
    if (m2) {
      const [, scheme, user, host] = m2;
      return `${scheme}${encodeURIComponent(user)}@${host}`;
    }
    return raw;
  }

  /** Parse RTSP URL to extract IP and credentials - handles all formats */
  function parseRtspUrl(raw) {
    // Format 1: rtsp://user:pass@host:port/path
    const m1 = raw.match(/^rtsp:\/\/([^:]+):(.+)@([^@:]+):?(\d+)?(\/.*)?$/);
    if (m1) return { user: m1[1], pass: m1[2], ip: m1[3], port: m1[4] || '554', path: m1[5] || '' };
    // Format 2: rtsp://user@host:port/path (no password)
    const m2 = raw.match(/^rtsp:\/\/([^@:]+)@([^:\/]+):?(\d+)?(\/.*)?$/);
    if (m2) return { user: m2[1], pass: '', ip: m2[2], port: m2[3] || '554', path: m2[4] || '' };
    // Format 3: rtsp://host:port/path (no auth)
    const m3 = raw.match(/^rtsp:\/\/([^:\/]+):?(\d+)?(\/.*)?$/);
    if (m3) return { user: '', pass: '', ip: m3[1], port: m3[2] || '554', path: m3[3] || '' };
    return null;
  }

  /* ─── Digest Auth helpers for HTTP snapshot fallback ─── */
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

  function httpSnapshot(host, path, username, password, protocol) {
    return new Promise((resolve, reject) => {
      const isHttps = protocol === 'https';
      const mod = isHttps ? https : http;
      const port = isHttps ? 443 : 80;
      const agent = isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined;
      const opts = { hostname: host, port, path, method: 'GET',
        headers: { 'User-Agent': 'MillEntrySystem/1.0' }, timeout: 8000 };
      if (agent) opts.agent = agent;

      const req1 = mod.request(opts, (res1) => {
        // Follow redirects
        if ([301, 302, 303, 307, 308].includes(res1.statusCode) && res1.headers.location) {
          res1.resume();
          let newUrl = res1.headers.location;
          try {
            const parsed = new URL(newUrl.startsWith('/') ? `${protocol}://${host}${newUrl}` : newUrl);
            const newProto = parsed.protocol === 'https:' ? 'https' : 'http';
            return httpSnapshot(parsed.hostname, parsed.pathname + parsed.search, username, password, newProto).then(resolve).catch(reject);
          } catch (_e) { reject(new Error('Bad redirect URL')); return; }
        }

        if (res1.statusCode !== 401) {
          const chunks = [];
          res1.on('data', c => chunks.push(c));
          res1.on('end', () => resolve({ status: res1.statusCode, body: Buffer.concat(chunks) }));
          return;
        }
        res1.resume();
        const challenge = parseDigestChallenge(res1.headers['www-authenticate'] || '');
        if (!challenge || !challenge.nonce) { reject(new Error('No digest challenge')); return; }

        const realm = challenge.realm || '';
        const nonce = challenge.nonce;
        const qop = challenge.qop || 'auth';
        const nc = '00000001';
        const cnonce = crypto.randomBytes(8).toString('hex');
        const ha1 = md5(`${username}:${realm}:${password}`);
        const ha2 = md5(`GET:${path}`);
        const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
        const authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${path}", algorithm=MD5, response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

        const opts2 = { hostname: host, port, path, method: 'GET',
          headers: { 'Authorization': authHeader, 'User-Agent': 'MillEntrySystem/1.0' }, timeout: 8000 };
        if (agent) opts2.agent = agent;
        const req2 = mod.request(opts2, (res2) => {
          // Follow redirects after auth too
          if ([301, 302, 303, 307, 308].includes(res2.statusCode) && res2.headers.location) {
            res2.resume();
            let newUrl = res2.headers.location;
            try {
              const parsed = new URL(newUrl.startsWith('/') ? `${protocol}://${host}${newUrl}` : newUrl);
              const newProto = parsed.protocol === 'https:' ? 'https' : 'http';
              return httpSnapshot(parsed.hostname, parsed.pathname + parsed.search, username, password, newProto).then(resolve).catch(reject);
            } catch (_e) { reject(new Error('Bad redirect URL')); return; }
          }
          const chunks = [];
          res2.on('data', c => chunks.push(c));
          res2.on('end', () => resolve({ status: res2.statusCode, body: Buffer.concat(chunks) }));
        });
        req2.on('error', reject);
        req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
        req2.end();
      });
      req1.on('error', reject);
      req1.on('timeout', () => { req1.destroy(); reject(new Error('connect timeout')); });
      req1.end();
    });
  }

  async function getSnapshot(ip, user, pass) {
    const paths = [
      '/snapshot?channel=1',           // TP-Link VIGI
      '/cgi-bin/snapshot.cgi',         // Dahua
      '/cgi-bin/snapshot.cgi?channel=1', // Dahua with channel
      '/ISAPI/Streaming/channels/101/picture', // Hikvision
      '/ISAPI/Streaming/channels/1/picture',   // Hikvision alt
      '/snap.jpg',                     // Generic
      '/capture',                      // Generic
      '/onvif-http/snapshot',          // ONVIF
      '/jpg/image.jpg',               // Some IP cameras
      '/cgi-bin/images_cgi?channel=0&user=' + encodeURIComponent(user) + '&pwd=' + encodeURIComponent(pass), // Direct auth URL
    ];
    for (const proto of ['http', 'https']) {
      for (const p of paths) {
        try {
          const r = await httpSnapshot(ip, p, user, pass, proto);
          if (r.status === 200 && r.body.length > 2000) {
            // Validate JPEG magic bytes
            if (r.body[0] === 0xFF && r.body[1] === 0xD8) {
              return r.body;
            }
          }
        } catch (_e) { /* next */ }
      }
    }
    return null;
  }

  /** GET /api/camera-stream?url=rtsp://... → MJPEG multipart stream */
  router.get('/api/camera-stream', (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: 'url required' });

    // Pass raw URL to ffmpeg - ffmpeg handles @ in passwords using last-@ split (same as VLC)
    // Do NOT use encodeRtspUrl here - %40 encoding breaks ffmpeg RTSP authentication
    const boundary = 'frame';

    res.writeHead(200, {
      'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });

    // Kill oldest ffmpeg if at max limit
    if (activeProcesses.size >= MAX_FFMPEG) {
      const oldest = activeProcesses.keys().next().value;
      console.log('[Camera] Killing oldest ffmpeg process to make room');
      cleanupProcess(oldest);
    }

    const processId = Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    // Original working ffmpeg flags - simple and stable
    const ffmpeg = spawn(ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-stimeout', '10000000',
      '-i', rawUrl,
      '-vf', 'scale=640:-1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '10',
      '-r', '3',
      '-an',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    activeProcesses.set(processId, ffmpeg);

    let gotFrame = false;
    let stderrLog = '';

    ffmpeg.stderr.on('data', (chunk) => {
      stderrLog += chunk.toString();
      if (stderrLog.length > 2000) stderrLog = stderrLog.slice(-1000);
    });

    // If ffmpeg fails within 10s, fall back to HTTP snapshot
    const fallbackTimeout = setTimeout(() => {
      if (!gotFrame) {
        console.log('[Camera] ffmpeg no frames in 10s, trying HTTP snapshot fallback...');
        try { ffmpeg.kill('SIGKILL'); } catch (_e) {}
        const parsed = parseRtspUrl(rawUrl);
        if (parsed) {
          startSnapshotFallback(res, parsed.ip, parsed.user, parsed.pass, req, boundary);
        } else {
          res.end();
        }
      }
    }, 10000);

    ffmpeg.on('error', (err) => {
      console.log('[Camera] ffmpeg spawn error:', err.message, '- using HTTP snapshot fallback');
      clearTimeout(fallbackTimeout);
      const parsed = parseRtspUrl(rawUrl);
      if (parsed) {
        startSnapshotFallback(res, parsed.ip, parsed.user, parsed.pass, req, boundary);
      } else {
        res.end();
      }
    });

    ffmpeg.on('close', (code) => {
      clearTimeout(fallbackTimeout);
      activeProcesses.delete(processId);
      console.log(`[Camera] ffmpeg exited code=${code}, gotFrame=${gotFrame}, stderr: ${stderrLog.slice(-300)}`);
      if (!gotFrame && code !== 0) {
        console.log('[Camera] ffmpeg exit', code, '- trying HTTP snapshot fallback');
        const parsed = parseRtspUrl(rawUrl);
        if (parsed) {
          startSnapshotFallback(res, parsed.ip, parsed.user, parsed.pass, req, boundary);
        } else {
          res.end();
        }
      } else if (gotFrame) {
        res.end();
      }
    });

    const SOI = Buffer.from([0xFF, 0xD8]);
    const EOI = Buffer.from([0xFF, 0xD9]);
    let buf = Buffer.alloc(0);

    ffmpeg.stdout.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const start = buf.indexOf(SOI);
        if (start === -1) { buf = Buffer.alloc(0); break; }
        const end = buf.indexOf(EOI, start);
        if (end === -1) { buf = buf.slice(start); break; }
        const frame = buf.slice(start, end + 2);
        buf = buf.slice(end + 2);
        if (!gotFrame) { gotFrame = true; clearTimeout(fallbackTimeout); console.log('[Camera] First frame received'); }
        try {
          res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
          res.write(frame);
          res.write('\r\n');
        } catch (_e) { /* client disconnected */ }
      }
    });

    req.on('close', () => {
      clearTimeout(fallbackTimeout);
      cleanupProcess(processId);
    });
  });

  /** HTTP snapshot polling fallback (when ffmpeg fails) */
  function startSnapshotFallback(res, ip, user, pass, req, boundary) {
    let running = true;
    req.on('close', () => { running = false; });

    const poll = async () => {
      console.log(`[Camera] Starting HTTP snapshot fallback for ${ip}`);
      while (running) {
        try {
          const jpeg = await getSnapshot(ip, user, pass);
          if (jpeg) {
            try {
              res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
              res.write(jpeg);
              res.write('\r\n');
            } catch (_e) { running = false; break; }
          }
        } catch (err) {
          console.error('[Camera Fallback] Error:', err.message);
        }
        await new Promise(r => setTimeout(r, 500));
      }
      res.end();
    };
    poll();
  }

  /** GET /api/camera-snapshot?url=rtsp://... → single JPEG */
  router.get('/api/camera-snapshot', (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: 'url required' });

    // Pass raw URL to ffmpeg - no encoding needed
    const ffmpeg = spawn(ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-stimeout', '10000000',
      '-i', rawUrl,
      '-frames:v', '1',
      '-f', 'image2',
      '-vcodec', 'mjpeg',
      '-q:v', '2',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let chunks = [];
    let stderrLog = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderrLog += chunk.toString();
      if (stderrLog.length > 2000) stderrLog = stderrLog.slice(-1000);
    });
    ffmpeg.stdout.on('data', (chunk) => { chunks.push(chunk); });
    ffmpeg.on('close', async (code) => {
      const data = Buffer.concat(chunks);
      if (data.length > 0) {
        res.set('Content-Type', 'image/jpeg');
        res.send(data);
      } else {
        // Fallback to HTTP snapshot
        const parsed = parseRtspUrl(rawUrl);
        if (parsed) {
          const jpeg = await getSnapshot(parsed.ip, parsed.user, parsed.pass);
          if (jpeg) { res.set('Content-Type', 'image/jpeg'); res.send(jpeg); }
          else { res.status(502).json({ error: 'Camera not reachable' }); }
        } else {
          res.status(502).json({ error: 'Camera not reachable' });
        }
      }
    });
    ffmpeg.on('error', async () => {
      const parsed = parseRtspUrl(rawUrl);
      if (parsed) {
        const jpeg = await getSnapshot(parsed.ip, parsed.user, parsed.pass);
        if (jpeg) { res.set('Content-Type', 'image/jpeg'); res.send(jpeg); }
        else { res.status(502).json({ error: 'Camera not reachable' }); }
      } else {
        res.status(502).json({ error: 'ffmpeg not available' });
      }
    });

    setTimeout(() => { try { ffmpeg.kill('SIGKILL'); } catch (_e) {} }, 15000);
  });

  /** TCP connect test helper */
  function tcpCheck(host, port, timeoutMs = 4000) {
    const net = require('net');
    return new Promise((resolve) => {
      const sock = new net.Socket();
      const timer = setTimeout(() => { sock.destroy(); resolve({ open: false, error: 'timeout' }); }, timeoutMs);
      sock.connect(port, host, () => { clearTimeout(timer); sock.destroy(); resolve({ open: true }); });
      sock.on('error', (e) => { clearTimeout(timer); sock.destroy(); resolve({ open: false, error: e.code || e.message }); });
    });
  }

  /** GET /api/camera-check → Full diagnostic info */
  router.get('/api/camera-check', async (req, res) => {
    const url = req.query.url || '';
    const result = {
      ffmpegAvailable: false,
      urlParsed: null,
      networkReachable: false,
      portScan: {},
      snapshotTest: null,
      diagnosis: '',
      diagnosisHi: ''
    };

    // 1. Check ffmpeg
    result.ffmpegPath = ffmpegPath;
    try {
      const { execSync } = require('child_process');
      execSync(`"${ffmpegPath}" -version`, { timeout: 5000, stdio: 'pipe' });
      result.ffmpegAvailable = true;
    } catch (e) {
      result.ffmpegError = e.message;
    }

    if (!url) {
      result.diagnosis = 'No URL provided';
      result.diagnosisHi = 'URL nahi diya gaya';
      return res.json(result);
    }

    // 2. Parse URL
    result.urlParsed = parseRtspUrl(url);
    result.encodedUrl = encodeRtspUrl(url);

    if (!result.urlParsed) {
      result.diagnosis = 'URL format invalid - cannot parse';
      result.diagnosisHi = 'URL ka format galat hai - parse nahi ho paya';
      return res.json(result);
    }

    const { ip, user, pass, port } = result.urlParsed;

    // 3. TCP port scan (80, 554, 443, 8080 + user port)
    const portsToCheck = [...new Set([80, 554, 443, 8080, parseInt(port) || 554])];
    const scanPromises = portsToCheck.map(async (p) => {
      const r = await tcpCheck(ip, p);
      return [p, r];
    });
    const scanResults = await Promise.all(scanPromises);
    for (const [p, r] of scanResults) {
      result.portScan[p] = r.open ? 'OPEN' : `CLOSED (${r.error})`;
      if (r.open) result.networkReachable = true;
    }

    // 4. Try HTTP snapshot
    if (result.networkReachable) {
      try {
        const jpeg = await getSnapshot(ip, user, pass);
        result.snapshotTest = jpeg ? `OK - ${jpeg.length} bytes received` : 'Failed - koi bhi snapshot path se image nahi mili';
      } catch (e) {
        result.snapshotTest = `Error: ${e.message}`;
      }
    }

    // 5. Final diagnosis
    if (!result.networkReachable) {
      const firstErr = scanResults[0]?.[1]?.error || 'unknown';
      if (firstErr === 'ECONNREFUSED') {
        result.diagnosis = `Camera IP ${ip} refused connection - camera OFF or firewall blocking`;
        result.diagnosisHi = `Camera IP ${ip} ne connection refuse kiya - camera band hai ya firewall block kar raha hai`;
      } else if (firstErr === 'EHOSTUNREACH' || firstErr === 'ENETUNREACH') {
        result.diagnosis = `Camera IP ${ip} is not reachable - you are NOT on the same network as the camera`;
        result.diagnosisHi = `Camera IP ${ip} tak pahuncha nahi ja raha - aap camera wale network (LAN) pe nahi ho. Mill ka WiFi connect karo`;
      } else if (firstErr === 'timeout') {
        result.diagnosis = `Camera IP ${ip} timed out - device not responding or different network`;
        result.diagnosisHi = `Camera IP ${ip} se koi response nahi aaya - camera band hai ya aap alag network pe ho`;
      } else {
        result.diagnosis = `Camera IP ${ip} not reachable: ${firstErr}`;
        result.diagnosisHi = `Camera IP ${ip} se connect nahi ho paya: ${firstErr}`;
      }
    } else if (result.snapshotTest && result.snapshotTest.startsWith('OK')) {
      result.diagnosis = `Camera is working! Snapshot received successfully`;
      result.diagnosisHi = `Camera chal raha hai! Snapshot mil gaya`;
    } else {
      const rtspOpen = result.portScan[parseInt(port) || 554] === 'OPEN';
      if (rtspOpen && result.ffmpegAvailable) {
        result.diagnosis = `Network OK, RTSP port open, but HTTP snapshot failed. ffmpeg RTSP stream should work`;
        result.diagnosisHi = `Network OK hai, RTSP port khula hai, HTTP snapshot nahi mila. ffmpeg RTSP stream chal sakta hai`;
      } else if (rtspOpen) {
        result.diagnosis = `Network OK, RTSP port open, but ffmpeg not found. Install ffmpeg for RTSP`;
        result.diagnosisHi = `Network OK hai, RTSP port khula hai lekin ffmpeg nahi mila. ffmpeg install karo`;
      } else {
        result.diagnosis = `Network reachable but camera ports closed. Check camera settings`;
        result.diagnosisHi = `Network mil raha hai lekin camera ke ports band hain. Camera ki settings check karo`;
      }
    }

    res.json(result);
  });

  return router;
};
