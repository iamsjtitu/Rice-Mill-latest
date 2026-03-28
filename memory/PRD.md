# Mill Entry System - PRD

## Current Version: v50.2.0

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON
- Local Server: Express + Local JSON
- Triple Backend Parity enforced

## Credentials
- Username: admin, Password: admin123

## Latest Features (v50.x)
- v50.2.0: Backup Download ZIP + Backup Restore from ZIP (Settings page)
- v50.1.0: Extra Fields Placement (above/below) + Label optional
- v50.0.0: KMS fully removed, only FY (Apr-Mar) remains

## Key API Endpoints
- GET /api/backup/download - ZIP download of all data
- POST /api/backup/restore - ZIP upload to restore data
- GET/PUT /api/branding - Custom branding with placement
- GET /api/stock-summary, /api/paddy-stock
- POST /api/opening-stock/carry-forward

## Upcoming Tasks
- P1: Export Preview (preview before PDF/Excel download)
- P1: WhatsApp Share (wa.me links for PDFs/Daily Report)
- P2: WhatsApp Alerts via WA Client/similar service (user deciding)
- P2: Auto Daily Backup (scheduled)

## Backlog
- P2: Desktop/Local server code deduplication
- P2: Payment logic centralization
