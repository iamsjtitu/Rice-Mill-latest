"""Camera Proxy – converts RTSP to MJPEG stream via ffmpeg for browser display."""

import re
import subprocess
import logging
from urllib.parse import quote
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse, Response

router = APIRouter()
logger = logging.getLogger("camera_proxy")


def _encode_rtsp_url(raw_url: str) -> str:
    """Encode special chars in RTSP credentials (e.g. @ in password)."""
    m = re.match(r'^(rtsp://)([^:]+):(.+)@([^@]+)$', raw_url)
    if m:
        scheme, user, password, host = m.groups()
        return f"{scheme}{quote(user, safe='')}:{quote(password, safe='')}@{host}"
    return raw_url


@router.get("/camera-stream")
async def camera_stream(url: str = Query(...)):
    """Stream RTSP as MJPEG via ffmpeg for browser <img> tag."""
    safe_url = _encode_rtsp_url(url)

    def generate():
        proc = subprocess.Popen(
            [
                "ffmpeg", "-rtsp_transport", "tcp",
                "-i", safe_url,
                "-f", "image2pipe", "-vcodec", "mjpeg",
                "-q:v", "3", "-r", "10", "-an",
                "pipe:1"
            ],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            bufsize=10**6
        )
        SOI = b'\xff\xd8'
        EOI = b'\xff\xd9'
        buf = b''
        boundary = b'--frame\r\n'
        try:
            while True:
                chunk = proc.stdout.read(4096)
                if not chunk:
                    break
                buf += chunk
                while True:
                    start = buf.find(SOI)
                    if start == -1:
                        buf = b''
                        break
                    end = buf.find(EOI, start)
                    if end == -1:
                        buf = buf[start:]
                        break
                    frame = buf[start:end + 2]
                    buf = buf[end + 2:]
                    yield (
                        boundary +
                        b'Content-Type: image/jpeg\r\n' +
                        f'Content-Length: {len(frame)}\r\n\r\n'.encode() +
                        frame + b'\r\n'
                    )
        finally:
            proc.kill()

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@router.get("/camera-snapshot")
async def camera_snapshot(url: str = Query(...)):
    """Take a single JPEG snapshot from RTSP via ffmpeg."""
    safe_url = _encode_rtsp_url(url)
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-rtsp_transport", "tcp",
                "-i", safe_url,
                "-frames:v", "1", "-f", "image2",
                "-vcodec", "mjpeg", "-q:v", "2",
                "pipe:1"
            ],
            capture_output=True, timeout=10
        )
        if result.returncode == 0 and result.stdout:
            return Response(content=result.stdout, media_type="image/jpeg")
        return Response(content=b'', status_code=502)
    except subprocess.TimeoutExpired:
        return Response(content=b'', status_code=504)
