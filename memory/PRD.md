# Mill Entry System PRD

## Current Version: v69.3.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed (Apr 2026)
- [v69.3] PDF slip completely rewritten - proper bordered table with cell borders matching view modal exactly (all 3 backends)
- [v69.2] Badge count fix - type mismatch between VW rst_no (string) and Mill Entry rst_no (int)
- [v69] Camera captureFrame() await fix, WhatsApp image fix, FY Carry Forward, View modal custom_fields, Auto Weight print match

## Key API Endpoints
- GET /api/vehicle-weight/:id/slip-pdf (Redesigned PDF with bordered table)
- GET /api/vehicle-weight/pending-count (Badge count - fixed type normalization)
- POST /api/opening-stock/carry-forward (All 3 backends)
- GET /api/branding (Returns company info + custom_fields array)

## Backlog
- P1: Export Preview feature
- P2: Centralize payment/stock logic across triple backends
- P2: App.js refactor (~2500 lines)
- P3: SQLite migration for desktop
