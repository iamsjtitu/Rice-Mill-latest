# Mill Entry System - PRD

## Current Version: v50.7.2

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON (FreeSans fonts bundled)
- Local Server: Express + Local JSON (FreeSans fonts bundled)
- Triple Backend Parity: 100% verified

## Credentials
- Username: admin, Password: admin123

## Key Features
- WhatsApp 360Messenger: Settings, Default Numbers, Group ID, Payment Reminders, Daily Reports, **Party Ledger Send**
- Backup System: Backup Now (folder), Auto Daily, ZIP Download, ZIP Restore
- Extra Fields: Placement above/below + Label optional
- FY Only (KMS removed)
- Daily Report Export: PDF (Paragraph wrapping headers) + Excel (per-section column widths)
- Mill Entries Export: PDF + Excel with **Totals row** + P.Pkt/P.Cut columns
- FreeSans font bundled in Desktop/Local for Hindi text support in all PDFs

## Latest Fixes (This Session)
1. **PDF Header garbled text**: Replaced Helvetica with FreeSans (Hindi-capable) across ALL desktop PDF exports (pdf_helpers.js, daily_report_logic.js, exports.js, fy_summary.js, hemali.js, mill_parts.js, reports.js, salebook.js, staff.js)
2. **Mill Entries PDF/Excel**: Added Totals row, added missing P.Pkt/P.Cut columns, wider column widths
3. **Party Ledger WhatsApp**: New feature - send party ledger summary via WhatsApp with transaction details. Endpoint: POST /api/whatsapp/send-party-ledger. Button visible in CashBook > Party Ledgers tab when party is selected.
4. **WhatsApp bug**: Fixed default_numbers not being read properly + saveImmediate() for settings

## Upcoming Tasks
- P1: Export Preview feature

## Backlog
- Desktop/Local server code dedup
- Payment logic centralization
