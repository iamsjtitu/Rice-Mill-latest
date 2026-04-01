# Mill Entry System PRD

## Current Version: v70.0.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed (Apr 2026)
- [v70] G.Issued field added - form, table, edit, view modal, PDF slip, HTML print, Excel export, WhatsApp
- [v70] Farmer → Source rename everywhere (view, PDF, print, WhatsApp, Excel)
- [v70] PDF slip bordered table redesign matching view modal
- [v69.2] Badge count type mismatch fix (rst_no string vs int)
- [v69] Camera captureFrame await fix, WhatsApp image fix, FY Carry Forward

## Key API Endpoints
- POST/GET /api/vehicle-weight (includes g_issued field)
- PUT /api/vehicle-weight/{id}/edit (includes g_issued)
- GET /api/vehicle-weight/{id}/slip-pdf (PDF with Source + G.Issued)
- GET /api/vehicle-weight/export/excel, /export/pdf (Source + G.Issued columns)
- POST /api/opening-stock/carry-forward (All 3 backends)

## Backlog
- P1: Export Preview feature
- P2: Centralize payment/stock logic across triple backends
- P2: App.js refactor (~2500 lines)
- P3: SQLite migration for desktop

## Test Reports
- iteration_155.json: G.Issued + Source rename (All PASS - 100%)
- iteration_154.json: Print/View custom_fields (All PASS)
- iteration_153.json: Carry Forward + Camera Fix (All PASS)
