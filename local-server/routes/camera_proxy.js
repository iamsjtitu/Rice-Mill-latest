/**
 * Camera Proxy – RTSP → MJPEG stream via ffmpeg OR HTTP snapshot fallback.
 * If ffmpeg is not available, automatically falls back to HTTP snapshot polling
 * using Digest Auth (works with TP-Link VIGI, Dahua, Hikvision cameras).
 */
const { spawn, execSync } = require('child_process');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

// Check ffmpeg availability
let ffmpegPath = null;
let ffmpegAvailable = false;
try {
  ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath && ffmpegPath.includes('app.asar')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
  // Verify it actually works
  execSync(`"${ffmpegPath}" -version`, { timeout: 5000, stdio: 'ignore' });
  ffmpegAvailable = true;
  console.log('[Camera] ffmpeg-static found:', ffmpegPath);
} catch {
  // Try system ffmpeg
  try {
    execSync('ffmpeg -version', { timeout: 5000, stdio: 'ignore' });
    ffmpegPath = 'ffmpeg';
    ffmpegAvailable = true;
    console.log('[Camera] System ffmpeg found');
  } catch {
    console.log('[Camera] ffmpeg NOT available - will use HTTP snapshot fallback');
  }
}

module.exports = function cameraProxyRoutes(router) {

  /* ─── URL Parsing Helpers ─── */

  /** Parse RTSP URL into components: {ip, port, user, pass, path} */
  function parseRtspUrl(raw) {
    // rtsp://user:pass@host:port/path
    const m = raw.match(/^rtsp:\/\/([^:]+):(.+)@([^@:]+):?(\d+)?(\/.*)?$/);
    if (m) {
      return { user: m[1], pass: m[2], ip: m[3], port: m[4] || '554', path: m[5] || '' };
    }
    // rtsp://host:port/path (no auth)
    const m2 = raw.match(/^rtsp:\/\/([^:\/]+):?(\d+)?(\/.*)?$/);
    if (m2) {
      return { user: '', pass: '', ip: m2[1], port: m2[2] || '554', path: m2[3] || '' };
    }
    return null;
  }

  /** Encode special chars in RTSP credentials (e.g. @ in password) */
  function encodeRtspUrl(raw) {
    const m = raw.match(/^(rtsp:\/\/)([^:]+):(.+)@([^@]+)$/);
    if (m) {
      const [, scheme, user, pass, host] = m;
      return `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}`;
    }
    return raw;
  }

  /* ─── Digest Auth for HTTP Snapshot Fallback ─── */

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

  /** HTTP request with Digest Auth - tries HTTP first, then HTTPS */
  function httpSnapshotRequest(host, path, username, password) {
    return new Promise(async (resolve, reject) => {
      for (const proto of ['http', 'https']) {
        try {
          const result = await _digestRequest(host, path, username, password, proto);
          return resolve(result);
        } catch (err) {
          // Try next protocol
        }
      }
      reject(new Error('HTTP snapshot failed on both HTTP and HTTPS'));
    });
  }

  function _digestRequest(host, path, username, password, protocol) {
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
          res1.on('end', () => resolve({ status: res1.statusCode, body: Buffer.concat(chunks) }));
          return;
        }
        res1.resume();

        const wwwAuth = res1.headers['www-authenticate'] || '';
        const challenge = parseDigestChallenge(wwwAuth);
        if (!challenge || !challenge.nonce) { reject(new Error('No digest challenge')); return; }

        const realm = challenge.realm || '';
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

        const opts2 = { hostname: host, port, path, method: 'GET',
          headers: { 'Authorization': authHeader, 'User-Agent': 'MillEntrySystem/1.0' },
          timeout: 8000
        };
        if (agent) opts2.agent = agent;

        const req2 = mod.request(opts2, (res2) => {
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

  /* ─── HTTP Snapshot MJPEG Stream (ffmpeg-free fallback) ─── */

  function startSnapshotStream(res, cameraIp, username, password, fps, req) {
    const boundary = 'frame';
    res.writeHead(200, {
      'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    let running = true;
    req.on('close', () => { running = false; });
    const interval = Math.max(200, Math.floor(1000 / fps));

    // Try multiple snapshot paths - different camera brands use different paths
    const snapshotPaths = [
      '/snapshot?channel=1',           // TP-Link VIGI
      '/cgi-bin/snapshot.cgi',         // Dahua
      '/ISAPI/Streaming/channels/101/picture', // Hikvision
      '/snap.jpg',                     // Generic
      '/capture',                      // Generic
    ];

    let workingPath = null;

    const poll = async () => {
      while (running) {
        try {
          let result;
          if (workingPath) {
            result = await httpSnapshotRequest(cameraIp, workingPath, username, password);
          } else {
            // Try each path until one works
            for (const path of snapshotPaths) {
              try {
                result = await httpSnapshotRequest(cameraIp, path, username, password);
                if (result.status === 200 && result.body.length > 500) {
                  workingPath = path;
                  console.log(`[Camera] Found working snapshot path: ${path} for ${cameraIp}`);
                  break;
                }
              } catch { /* try next */ }
            }
            if (!workingPath) {
              console.error(`[Camera] No snapshot endpoint found for ${cameraIp}`);
              await new Promise(r => setTimeout(r, 3000));
              continue;
            }
          }

          if (result && result.status === 200 && result.body.length > 500) {
            try {
              res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${result.body.length}\r\n\r\n`);
              res.write(result.body);
              res.write('\r\n');
            } catch { running = false; break; }
          }
        } catch (err) {
          workingPath = null; // Reset so it retries all paths
          console.error('[Camera Snapshot] Poll error:', err.message);
        }
        await new Promise(r => setTimeout(r, interval));
      }
      res.end();
    };
    poll();
  }

  /* ─── ffmpeg RTSP Stream ─── */

  function startFfmpegStream(res, safeUrl, req) {
    const boundary = 'frame';
    res.writeHead(200, {
      'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });

    const ffmpeg = spawn(ffmpegPath, [
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-rtsp_transport', 'tcp',
      '-rtsp_flags', 'prefer_tcp',
      '-stimeout', '10000000',
      '-analyzeduration', '500000',
      '-probesize', '500000',
      '-allowed_media_types', 'video',
      '-i', safeUrl,
      '-vf', 'scale=800:-1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '8',
      '-r', '5',
      '-an',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrLog = '';
    let gotFrame = false;
    ffmpeg.stderr.on('data', (chunk) => {
      stderrLog += chunk.toString();
      if (!gotFrame && stderrLog.includes('Input #0')) console.log('[Camera] ffmpeg connected');
      if (stderrLog.length > 2000) stderrLog = stderrLog.slice(-1000);
    });
    ffmpeg.on('close', (code) => {
      if (code !== 0) console.error(`[Camera] ffmpeg exit ${code}:`, stderrLog.slice(-500));
      res.end();
    });

    const frameTimeout = setTimeout(() => {
      if (!gotFrame) {
        console.error('[Camera] No frame in 20s:', stderrLog.slice(-500));
        try { ffmpeg.kill('SIGKILL'); } catch {}
      }
    }, 20000);

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
        if (!gotFrame) { gotFrame = true; clearTimeout(frameTimeout); console.log('[Camera] First frame!'); }
        try {
          res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
          res.write(frame);
          res.write('\r\n');
        } catch { /* client disconnected */ }
      }
    });

    ffmpeg.on('error', () => { clearTimeout(frameTimeout); res.end(); });
    req.on('close', () => { clearTimeout(frameTimeout); try { ffmpeg.kill('SIGKILL'); } catch {} });
  }

  /* ─── Routes ─── */

  /** GET /api/camera-stream?url=rtsp://... → MJPEG stream */
  router.get('/api/camera-stream', (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: 'url required' });

    // Parse RTSP URL to extract camera IP and credentials
    const parsed = parseRtspUrl(rawUrl);

    if (ffmpegAvailable) {
      // Try ffmpeg first
      const safeUrl = encodeRtspUrl(rawUrl);
      startFfmpegStream(res, safeUrl, req);
    } else if (parsed) {
      // Fallback: HTTP snapshot polling (no ffmpeg needed!)
      console.log(`[Camera] Using HTTP snapshot fallback for ${parsed.ip}`);
      startSnapshotStream(res, parsed.ip, parsed.user, parsed.pass, 3, req);
    } else {
      // Can't parse URL and no ffmpeg
      res.status(502).json({ error: 'ffmpeg not available and cannot parse camera URL. Use VIGI Camera mode instead.' });
    }
  });

  /** GET /api/camera-snapshot?url=rtsp://... → single JPEG */
  router.get('/api/camera-snapshot', (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: 'url required' });

    const parsed = parseRtspUrl(rawUrl);

    if (ffmpegAvailable) {
      // Use ffmpeg for single frame
      const safeUrl = encodeRtspUrl(rawUrl);
      const ffmpeg = spawn(ffmpegPath, [
        '-fflags', 'nobuffer', '-rtsp_transport', 'tcp', '-rtsp_flags', 'prefer_tcp',
        '-stimeout', '10000000', '-analyzeduration', '500000', '-probesize', '500000',
        '-allowed_media_types', 'video', '-i', safeUrl,
        '-frames:v', '1', '-f', 'image2', '-vcodec', 'mjpeg', '-q:v', '2', 'pipe:1'
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      let chunks = [];
      ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
      ffmpeg.on('close', () => {
        const data = Buffer.concat(chunks);
        if (data.length > 0) { res.set('Content-Type', 'image/jpeg'); res.send(data); }
        else { res.status(502).json({ error: 'Camera not reachable via ffmpeg' }); }
      });
      setTimeout(() => { try { ffmpeg.kill('SIGKILL'); } catch {} }, 15000);
    } else if (parsed) {
      // HTTP snapshot fallback
      const paths = ['/snapshot?channel=1', '/cgi-bin/snapshot.cgi', '/ISAPI/Streaming/channels/101/picture', '/snap.jpg'];
      (async () => {
        for (const path of paths) {
          try {
            const result = await httpSnapshotRequest(parsed.ip, path, parsed.user, parsed.pass);
            if (result.status === 200 && result.body.length > 500) {
              res.set('Content-Type', 'image/jpeg');
              return res.send(result.body);
            }
          } catch { /* try next */ }
        }
        res.status(502).json({ error: 'No snapshot endpoint found' });
      })();
    } else {
      res.status(502).json({ error: 'ffmpeg not available' });
    }
  });

  /** GET /api/camera-check → Check if ffmpeg is available */
  router.get('/api/camera-check', (req, res) => {
    res.json({ ffmpeg: ffmpegAvailable, ffmpegPath: ffmpegPath || 'not found', fallback: 'http-snapshot' });
  });

  return router;
};
