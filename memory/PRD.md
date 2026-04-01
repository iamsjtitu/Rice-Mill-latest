# Mill Entry System PRD

## Current Version: v70.1.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed (Apr 2026)
- [v70.1] Receive(Pur) → Receive(Purchase), Source → Source/Mandi, Trans type added to WhatsApp text
- [v70] G.Issued field added everywhere, Farmer → Source rename, PDF bordered table
- [v69.2] Badge count type mismatch fix
- [v69] Camera captureFrame await fix, WhatsApp image fix, FY Carry Forward

## Key API Endpoints
- POST/GET /api/vehicle-weight (includes g_issued, trans_type=Receive(Purchase))
- PUT /api/vehicle-weight/{id}/edit (includes g_issued)
- GET /api/vehicle-weight/{id}/slip-pdf (PDF with Source/Mandi + G.Issued)
- GET /api/vehicle-weight/export/excel, /export/pdf (Source/Mandi + G.Issued)
- POST /api/opening-stock/carry-forward (All 3 backends)

## Backlog
- P1: Export Preview feature
- P2: Centralize payment/stock logic across triple backends
- P2: App.js refactor (~2500 lines)
- P3: SQLite migration for desktop
