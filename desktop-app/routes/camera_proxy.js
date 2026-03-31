/**
 * Camera Proxy – RTSP → MJPEG stream via ffmpeg for browser display.
 * Desktop & Local-Server only (same LAN as IP cameras).
 */
const { spawn, execSync } = require('child_process');
let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
  // In production Electron build, asar needs unpacking
  if (ffmpegPath && ffmpegPath.includes('app.asar')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
} catch {
  ffmpegPath = 'ffmpeg'; // fallback to system ffmpeg
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
      'Pragma': 'no-cache'
    });

    const ffmpeg = spawn(ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-i', safeUrl,
      '-vf', 'scale=640:-1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '12',
      '-r', '3',
      '-an',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

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
        res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write('\r\n');
      }
    });

    ffmpeg.on('error', () => { res.end(); });
    ffmpeg.on('close', () => { res.end(); });

    req.on('close', () => {
      try { ffmpeg.kill('SIGKILL'); } catch {}
    });
  });

  /** GET /api/camera-snapshot?url=rtsp://... → single JPEG */
  router.get('/api/camera-snapshot', (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: 'url required' });

    const safeUrl = encodeRtspUrl(rawUrl);

    const ffmpeg = spawn(ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-i', safeUrl,
      '-frames:v', '1',
      '-f', 'image2',
      '-vcodec', 'mjpeg',
      '-q:v', '2',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    let chunks = [];
    ffmpeg.stdout.on('data', (chunk) => { chunks.push(chunk); });
    ffmpeg.on('close', (code) => {
      const data = Buffer.concat(chunks);
      if (data.length > 0) {
        res.set('Content-Type', 'image/jpeg');
        res.send(data);
      } else {
        res.status(502).json({ error: 'Camera not reachable' });
      }
    });

    setTimeout(() => { try { ffmpeg.kill('SIGKILL'); } catch {} }, 10000);
  });

  return router;
};
