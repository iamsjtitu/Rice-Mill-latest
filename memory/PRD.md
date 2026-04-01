# Mill Entry System PRD

## Current Version: v69.1.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed (Apr 2026)
- [v69.1] Badge count fix - type mismatch between VW rst_no (string) and Mill Entry rst_no (int) causing wrong pending count
- [v69] Camera captureFrame() await fix — images now save correctly during weight capture
- [v69] WhatsApp auto-notify sends images to individual numbers (not just groups)
- [v69] FY Carry Forward endpoint added to Desktop + Local-Server backends (triple parity)
- [v69] View modal now shows header extra fields (custom_fields from branding settings)
- [v69] Auto Weight Entries print button matches Completed Entries print format

## Key API Endpoints
- GET /api/vehicle-weight/pending-count (Badge count - fixed type normalization)
- POST /api/opening-stock/carry-forward (All 3 backends)
- POST /api/vehicle-weight/auto-notify (WhatsApp + Telegram with images)
- GET /api/vehicle-weight/:id/photos, GET /api/vehicle-weight/:id/slip-pdf
- GET /api/branding (Returns company info + custom_fields array)

## Backlog
- P1: Export Preview feature
- P2: Centralize payment/stock logic across triple backends
- P2: App.js refactor (~2500 lines) - state management + hooks
- P3: SQLite migration for desktop (1 Lakh+ entries)

## Test Reports
- iteration_154.json: Print/View modal custom_fields (All PASS - 100%)
- iteration_153.json: Carry Forward + Camera Image Fix (All PASS - 100%)
