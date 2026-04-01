# Mill Entry System PRD

## Current Version: v61.0.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed
- [2026-04-01] FFmpeg Auto-Bundle Fix (v61.0.0)
  - Added `extraResources` in electron-builder to bundle ffmpeg.exe in packaged app
  - Smart path resolution: extraResources > ffmpeg-static > Windows paths > system PATH
  - GitHub Actions workflow verifies ffmpeg binary exists, downloads manually if missing
  - Diagnose endpoint now returns ffmpegPath for debugging
  - Applied to both desktop-app and local-server (triple backend parity)
- [2026-03-31] VIGI Camera Diagnostics Tool
- [2026-03-31] Camera Diagnostics Tool (IP Camera mode)
- [2026-03-31] VIGI NVR Integration (snapshot API, digest auth)
- [2026-03-31] Camera proxy: ffmpeg RTSP + HTTP snapshot fallback
- [2026-03-31] Vehicle Weight PDF + Print custom fields

## Key API Endpoints
- GET /api/camera-check?url=rtsp://... → Full IP camera diagnostics (returns ffmpegPath)
- GET /api/camera-stream?url=rtsp://... → RTSP to MJPEG via ffmpeg
- GET /api/camera-kill-all → Kill all ffmpeg processes
- GET /api/vigi-diagnose → VIGI camera diagnostics
- GET /api/vigi-stream → MJPEG from NVR
- GET /api/entries, /api/totals, /api/export/excel, /api/export/pdf

## 3rd Party Integrations
- 360Messenger API (WhatsApp), Telegram Bot API
- tmpfiles.org (free image/PDF hosting)
- VIGI NVR OpenAPI (direct snapshot)

## Known Issues
- VIGI Camera HTTP Snapshot: TP-Link proprietary token API blocks direct snapshot. Use RTSP mode instead.

## Backlog
- P1: Export Preview feature (preview data before Excel/PDF export)
- P2: Centralize payment/stock logic across triple backends
- P2: App.js refactor (~2500 lines) - state management + hooks
- P3: SQLite migration for desktop app (1 Lakh+ entries)

## Test Reports
- iteration_152.json: FFmpeg Auto-Bundle Fix v61.0.0 (All PASS - code review + frontend UI)
- iteration_150.json: IP Camera Diagnostics (100% PASS)
- iteration_151.json: VIGI Camera Diagnostics (100% PASS)
