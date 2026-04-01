# Mill Entry System PRD

## Current Version: v68.0.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed (Apr 2026)
- [v68] Entry form kms_year now matches filter FY → entries + tick marks work correctly
- [v67] saveImage crash fix (Object → empty string instead of Buffer.from error)
- [v66] Better error messages in safe_handler (error_message field in 500 response)
- [v65] FFmpeg 6.0 compatibility: -stimeout → -timeout (camera stream fix)
- [v64] RTSP Deep Diagnostic Tool (Test RTSP button with stderr output)
- [v63] Raw URL passed to ffmpeg (no encoding of @ in password)
- [v62] Bare catch blocks → catch (_e) for Electron compatibility

## Key Bug Fixes
- FFmpeg bundled via extraResources in electron-builder
- Smart ffmpeg path resolution: extraResources > ffmpeg-static > Windows paths > system PATH
- GitHub Actions workflow verifies ffmpeg binary exists
- Snapshot validation: min 2KB + JPEG magic bytes check
- Route syntax errors fixed across all JS backends

## Key API Endpoints
- GET/POST /api/entries (Mill Entries CRUD)
- GET /api/vehicle-weight (list weights)
- POST /api/vehicle-weight (capture weight)
- GET /api/vehicle-weight/linked-rst (RST numbers linked to Mill Entries)
- GET /api/camera-test-rtsp (RTSP diagnostic tool)
- GET /api/camera-stream (MJPEG stream via ffmpeg)

## Backlog
- P1: Export Preview feature
- P2: Centralize payment/stock logic across triple backends
- P2: App.js refactor (~2500 lines) - state management + hooks
- P3: SQLite migration for desktop (1 Lakh+ entries)

## Test Reports
- iteration_152.json: FFmpeg bundle + v61 (All PASS)
- iteration_150.json: IP Camera Diagnostics (All PASS)
- iteration_151.json: VIGI Camera Diagnostics (All PASS)
