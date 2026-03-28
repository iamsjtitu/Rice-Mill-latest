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
- WhatsApp 360Messenger: Settings, Default Numbers, Group ID, Payment Reminders, Daily Reports, **Party Ledger Send**, **Truck Payment Send**, **Truck Owner Send**, **Leased Truck Send**
- Backup System: Backup Now (folder), Auto Daily, ZIP Download, ZIP Restore
- Extra Fields: Placement above/below + Label optional
- FY Only (KMS removed)
- Daily Report Export: PDF (Paragraph wrapping headers) + Excel (per-section column widths)
- Mill Entries Export: PDF + Excel with Totals row + P.Pkt/P.Cut columns
- FreeSans font bundled in Desktop/Local for Hindi text support in all PDFs

## Completed in v50.8.0 (22 Feb 2026)
1. **WhatsApp Truck Payment**: New endpoint POST /api/whatsapp/send-truck-payment. Sends trip details, net amount, paid, balance via WhatsApp. Button in Payments > Truck Payments > Actions column (Send icon).
2. **WhatsApp Truck Owner**: New endpoint POST /api/whatsapp/send-truck-owner. Sends consolidated truck owner payment summary (trips, gross, deductions, net, paid, balance). Button in Payments > Truck Owner > Actions column ("WhatsApp" text button).
3. **WhatsApp Leased Truck**: Reuses send-truck-owner endpoint. Button in Payments > Leased Truck > Actions column (Send icon).
4. **Version Bump**: v50.7.2 -> v50.8.0 across desktop-app, local-server, WhatsNew.jsx
5. **All 3 backends synced**: Python, Desktop JS, Local Server JS all have identical endpoints

## Previous Session Fixes
- PDF Header garbled text: FreeSans font across ALL desktop PDF exports
- Mill Entries PDF/Excel: Totals row, P.Pkt/P.Cut columns, wider column widths
- Party Ledger WhatsApp: send-party-ledger endpoint + CashBook button
- WhatsApp bug: default_numbers + saveImmediate() fix
- Daily Report PDF/Excel column widths and text wrapping fix

## Upcoming Tasks
- P1: Export Preview feature (Preview data before exporting to Excel/PDF)

## Backlog
- P2: Desktop/Local server code deduplication
- P2: Payment logic centralization into service layer
