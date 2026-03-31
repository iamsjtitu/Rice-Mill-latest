# Mill Entry System PRD

## Current Version: v55.61.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed
- [2026-03-31] Camera Diagnostics Tool - "Diagnose Camera" button in Settings > Camera > IP Camera mode
  - Backend `/api/camera-check` endpoint with: ffmpeg check, URL parse, TCP port scan (80/554/443/8080), HTTP snapshot test
  - Hindi diagnosis messages (e.g., "Network nahi mil raha", "Camera chal raha hai!")
  - Added to both desktop-app and local-server Express backends
  - Frontend results panel shows URL Parse, Network, Ports, ffmpeg, Snapshot status
- [2026-03-31] Tab switching crash fix (camera auto-start disabled)
- [2026-03-31] VIGI NVR Integration (snapshot API, digest auth)
- [2026-03-31] Camera proxy enhanced: ffmpeg RTSP + HTTP snapshot fallback
- [2026-03-31] Vehicle Weight PDF redesign + Print custom fields
- [2026-03-31] Smart Camera Proxy: fallback from ffmpeg to HTTP polling
- [2026-03-31] HTTP 302 Redirect handling for camera proxy

## Key API Endpoints
- GET /api/camera-check?url=rtsp://... → Full camera diagnostics (Desktop/Local only)
- GET /api/camera-stream?url=rtsp://... → RTSP→MJPEG via ffmpeg
- GET /api/camera-kill-all → Kill all ffmpeg processes
- GET /api/vigi-stream?channel=X&fps=N → MJPEG from NVR
- GET /api/vigi-snapshot?channel=X → Single JPEG from NVR
- GET /api/vigi-test → Test NVR connection
- POST/GET /api/vigi-config → Save/Get VIGI NVR settings
- GET /api/entries, /api/totals, /api/export/excel, /api/export/pdf

## 3rd Party Integrations
- 360Messenger API (WhatsApp), Telegram Bot API
- tmpfiles.org (free image/PDF hosting)
- VIGI NVR OpenAPI (direct snapshot)

## Backlog
- P1: Export Preview feature (preview data before Excel/PDF export)
- P2: Centralize payment/stock logic across triple backends
- P2: App.js refactor (~2500 lines) - state management + hooks
- P3: SQLite migration for desktop app (1 Lakh+ entries)

## Test Reports
- iteration_149.json: Backend/Frontend tests (All PASS)
- iteration_150.json: Camera Diagnostics feature (100% Frontend PASS, Express code review PASS)
