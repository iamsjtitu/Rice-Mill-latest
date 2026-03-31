# Mill Entry System PRD

## Current Version: v56.0.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed
- [2026-03-31] VIGI Camera Diagnostics Tool - "Diagnose" button in Settings > Camera > VIGI NVR mode
  - Backend `/api/vigi-diagnose` endpoint with: TCP port scan (80/443/554/8080), HTTP access, Digest Auth, snapshot path discovery
  - Hindi diagnosis messages (e.g., "Camera chal raha hai!", "Username ya password galat hai")
  - Added to both desktop-app and local-server Express backends
- [2026-03-31] Camera Diagnostics Tool - "Diagnose Camera" button in Settings > Camera > IP Camera mode
  - Backend `/api/camera-check` endpoint with: ffmpeg check, URL parse, TCP port scan, HTTP snapshot test
  - Hindi diagnosis messages for network reachability issues
  - Added to both desktop-app and local-server Express backends
- [2026-03-31] Tab switching crash fix (camera auto-start disabled)
- [2026-03-31] VIGI NVR Integration (snapshot API, digest auth)
- [2026-03-31] Camera proxy enhanced: ffmpeg RTSP + HTTP snapshot fallback
- [2026-03-31] Vehicle Weight PDF redesign + Print custom fields
- [2026-03-31] Smart Camera Proxy: fallback from ffmpeg to HTTP polling
- [2026-03-31] HTTP 302 Redirect handling for camera proxy

## Key API Endpoints
- GET /api/vigi-diagnose?ip=...&username=...&password=...&channel=... → Full VIGI diagnostics (Desktop/Local only)
- GET /api/camera-check?url=rtsp://... → Full IP camera diagnostics (Desktop/Local only)
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
- iteration_150.json: IP Camera Diagnostics feature (100% Frontend PASS, Express code review PASS)
- iteration_151.json: VIGI Camera Diagnostics feature (100% Frontend PASS, Triple backend parity PASS)
