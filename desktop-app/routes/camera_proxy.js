/**
 * Camera Proxy – RTSP → MJPEG stream via ffmpeg.
 * If ffmpeg not found, falls back to HTTP snapshot polling.
 * Desktop & Local-Server only (same LAN as IP cameras).
 */
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath && ffmpegPath.includes('app.asar')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
} catch {
  ffmpegPath = 'ffmpeg';
}

module.exports = function cameraProxyRoutes(router) {

  /** Encode special chars in RTSP credentials (e.g. @ in password) */
  function encodeRtspUrl(raw) {
    const m = raw.match(/^(rtsp:\/\/)([^:]+):(.+)@([^@]+)$/);
    if (m) {
      const [, scheme, user, pass, host] = m;
      return `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}`;
    }
    return raw;
  }

  /** Parse RTSP URL to extract IP and credentials */
  function parseRtspUrl(raw) {
    const m = raw.match(/^rtsp:\/\/([^:]+):(.+)@([^@:]+):?(\d+)?(\/.*)?$/);
    if (m) return { user: m[1], pass: m[2], ip: m[3], port: m[4] || '554', path: m[5] || '' };
    const m2 = raw.match(/^rtsp:\/\/([^:\/]+):?(\d+)?(\/.*)?$/);
    if (m2) return { user: '', pass: '', ip: m2[1], port: m2[2] || '554', path: m2[3] || '' };
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
    const paths = ['/snapshot?channel=1', '/cgi-bin/snapshot.cgi', '/ISAPI/Streaming/channels/101/picture', '/snap.jpg'];
    for (const proto of ['http', 'https']) {
      for (const p of paths) {
        try {
          const r = await httpSnapshot(ip, p, user, pass, proto);
          if (r.status === 200 && r.body.length > 500) return r.body;
        } catch { /* next */ }
      }
    }
    return null;
  }

  /** GET /api/camera-stream?url=rtsp://... → MJPEG multipart stream */
  router.get('/api/camera-stream', (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: 'url required' });

    const safeUrl = encodeRtspUrl(rawUrl);
    const boundary = 'frame';

    res.writeHead(200, {
      'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });

    // Original working ffmpeg flags - simple and stable
    const ffmpeg = spawn(ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-stimeout', '10000000',
      '-i', safeUrl,
      '-vf', 'scale=640:-1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '10',
      '-r', '3',
      '-an',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let gotFrame = false;
    let stderrLog = '';

    ffmpeg.stderr.on('data', (chunk) => {
      stderrLog += chunk.toString();
      if (stderrLog.length > 2000) stderrLog = stderrLog.slice(-1000);
    });

    // If ffmpeg fails within 15s, fall back to HTTP snapshot
    const fallbackTimeout = setTimeout(() => {
      if (!gotFrame) {
        console.log('[Camera] ffmpeg no frames in 15s, trying HTTP snapshot fallback...');
        try { ffmpeg.kill('SIGKILL'); } catch {}
        const parsed = parseRtspUrl(rawUrl);
        if (parsed) {
          startSnapshotFallback(res, parsed.ip, parsed.user, parsed.pass, req, boundary);
        } else {
          res.end();
        }
      }
    }, 15000);

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
        } catch { /* client disconnected */ }
      }
    });

    req.on('close', () => {
      clearTimeout(fallbackTimeout);
      try { ffmpeg.kill('SIGKILL'); } catch {}
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
            } catch { running = false; break; }
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

    const safeUrl = encodeRtspUrl(rawUrl);

    const ffmpeg = spawn(ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-stimeout', '10000000',
      '-i', safeUrl,
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

    setTimeout(() => { try { ffmpeg.kill('SIGKILL'); } catch {} }, 15000);
  });

  return router;
};
