/**
 * Camera Proxy – RTSP → MJPEG stream via ffmpeg for browser display.
 * Desktop & Local-Server only (same LAN as IP cameras).
 */
const { spawn } = require('child_process');
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
      // Log connection info
      if (!gotFrame && stderrLog.includes('Input #0')) {
        console.log('[Camera] ffmpeg connected to stream');
      }
      if (stderrLog.length > 2000) stderrLog = stderrLog.slice(-1000);
    });
    ffmpeg.on('close', (code) => {
      if (code !== 0) console.error(`[Camera] ffmpeg exit ${code}:`, stderrLog.slice(-500));
      res.end();
    });

    // Timeout: if no frame in 20s, kill and log
    const frameTimeout = setTimeout(() => {
      if (!gotFrame) {
        console.error('[Camera] No frame received in 20s. ffmpeg log:', stderrLog.slice(-500));
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
        if (!gotFrame) {
          gotFrame = true;
          clearTimeout(frameTimeout);
          console.log('[Camera] First frame received');
        }
        try {
          res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
          res.write(frame);
          res.write('\r\n');
        } catch { /* client disconnected */ }
      }
    });

    ffmpeg.on('error', () => { clearTimeout(frameTimeout); res.end(); });

    req.on('close', () => {
      clearTimeout(frameTimeout);
      try { ffmpeg.kill('SIGKILL'); } catch {}
    });
  });

  /** GET /api/camera-snapshot?url=rtsp://... → single JPEG */
  router.get('/api/camera-snapshot', (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: 'url required' });

    const safeUrl = encodeRtspUrl(rawUrl);

    const ffmpeg = spawn(ffmpegPath, [
      '-fflags', 'nobuffer',
      '-rtsp_transport', 'tcp',
      '-rtsp_flags', 'prefer_tcp',
      '-stimeout', '10000000',
      '-analyzeduration', '500000',
      '-probesize', '500000',
      '-allowed_media_types', 'video',
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
    ffmpeg.on('close', (code) => {
      const data = Buffer.concat(chunks);
      if (data.length > 0) {
        res.set('Content-Type', 'image/jpeg');
        res.send(data);
      } else {
        console.error('[Camera Snapshot] Failed:', stderrLog.slice(-300));
        res.status(502).json({ error: 'Camera not reachable' });
      }
    });

    setTimeout(() => { try { ffmpeg.kill('SIGKILL'); } catch {} }, 15000);
  });

  return router;
};
