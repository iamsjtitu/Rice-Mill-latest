# Mill Entry System PRD

## Current Version: v55.49.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed (This Session)
- [2026-03-31] Tab switching hang fix (AbortController + debounce in App.js, CashBook.jsx)
- [2026-03-31] RAM fix: ffmpeg params optimized (scale=800, q:v=8, r=5)
- [2026-03-31] WhatsApp image sending via tmpfiles.org upload in auto-notify
- [2026-03-31] Paddy Purchase Register subtab with filters, PDF/Excel, WA/TG send
- [2026-03-31] Subtab styling fixed (Button component matching main tabs)
- [2026-03-31] Clear filters resets to today's date
- [2026-03-31] Toolbar hidden on non-Mill-Entries subtabs
- [2026-03-31] Serial handler improved (handles any line ending)
- [2026-03-31] Camera proxy enhanced: -fflags nobuffer, -flags low_delay, error logging
- [2026-03-31] **VIGI NVR Integration**: Direct snapshot API (no ffmpeg needed!)
  - New routes: /api/vigi-stream, /api/vigi-snapshot, /api/vigi-test, /api/vigi-config
  - Digest Authentication (MD5/SHA-256) support
  - Camera Setup UI: VIGI NVR mode (Recommended) with NVR IP, channels config
  - Snapshot polling at configurable FPS (no ffmpeg = 0 MB extra RAM)

## Key API Endpoints
- GET /api/vigi-stream?channel=X&fps=N → MJPEG stream from NVR
- GET /api/vigi-snapshot?channel=X → Single JPEG from NVR
- GET /api/vigi-test → Test NVR connection
- POST/GET /api/vigi-config → Save/Get VIGI NVR settings
- GET /api/camera-stream?url=rtsp://... → RTSP→MJPEG via ffmpeg (fallback)
- GET /api/entries, /api/totals, /api/export/excel, /api/export/pdf
- POST /api/whatsapp/send-pdf

## 3rd Party Integrations
- 360Messenger API (WhatsApp), Telegram Bot API
- tmpfiles.org (free image/PDF hosting for WhatsApp)
- **VIGI NVR OpenAPI** (direct snapshot, no ffmpeg)

## Backlog
- P1: Export Preview feature
- P2: App.js refactor, code deduplication
- P3: SQLite migration

## Test Reports
- iteration_148.json: PPR + subtab styling (13/13 PASS)
