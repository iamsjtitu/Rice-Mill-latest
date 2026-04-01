# Mill Entry System PRD

## Current Version: v69.0.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed (Apr 2026)
- [v69] Camera captureFrame() await fix - images now save correctly during weight capture
- [v69] WhatsApp auto-notify sends images to individual numbers (not just groups)
- [v69] FY Carry Forward endpoint added to Desktop + Local-Server backends (triple parity)
- [v68] Entry form kms_year now matches filter FY
- [v67] saveImage crash fix (Object vs string type check)
- [v65] FFmpeg 6.0 compatibility: -stimeout to -timeout
- [v64] RTSP Deep Diagnostic Tool
- [v63] Raw URL passed to ffmpeg (@ in password fix)
- [v62] Bare catch blocks fixed for Electron compatibility

## Key API Endpoints
- POST /api/opening-stock/carry-forward (All 3 backends)
- POST /api/vehicle-weight/auto-notify (WhatsApp + Telegram with images)
- GET /api/vehicle-weight/:id/photos (base64 image data for view modal)
- GET/POST /api/entries, /api/vehicle-weight
- GET /api/camera-stream, /api/camera-test-rtsp

## Backlog
- P1: Export Preview feature
- P2: Centralize payment/stock logic across triple backends
- P2: App.js refactor (~2500 lines) - state management + hooks
- P3: SQLite migration for desktop (1 Lakh+ entries)

## Test Reports
- iteration_153.json: Carry Forward + Camera Image Fix (All PASS - 100%)
- iteration_152.json: FFmpeg bundle + v61 (All PASS)
