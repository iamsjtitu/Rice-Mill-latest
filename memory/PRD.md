# Mill Entry System - PRD

## Current Version: v50.8.0

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON (FreeSans fonts bundled)
- Local Server: Express + Local JSON (FreeSans fonts bundled)
- Triple Backend Parity: 100% verified

## Credentials
- Username: admin, Password: admin123

## Key Features
- WhatsApp 360Messenger with PDF attachment: Daily Report, Party Ledger, Truck Payment, Truck Owner, Leased Truck
- Desktop WhatsApp PDF: Local PDF → file.io upload → public URL → 360Messenger (transparent)
- Backup System: Backup Now (folder), Auto Daily, ZIP Download, ZIP Restore
- Extra Fields: Placement above/below + Label optional
- FreeSans font bundled in electron-builder files list for Hindi PDF support
- Daily Report Export: PDF + Excel
- Mill Entries Export: PDF + Excel with Totals row

## Completed in v50.8.0 (28 Mar 2026)
1. WhatsApp Truck Payment + Truck Owner endpoints (all 3 backends)
2. WhatsApp buttons in Payments.jsx (Truck tab + Truck Owner tab) and LeasedTruck.jsx
3. PDF attachment via file.io for Desktop/Local (local PDF → upload → public URL → WhatsApp)
4. fonts/ directory added to electron-builder files list (fixes garbled PDF headers)
5. registerFonts comma fix across 7 route files × 2 backends
6. Better error messages in WhatsApp toast (actual API errors shown)
7. Version bump to 50.8.0

## Upcoming Tasks
- P1: Export Preview feature (Preview data before exporting to Excel/PDF)

## Backlog
- P2: Desktop/Local server code deduplication
- P2: Payment logic centralization into service layer
