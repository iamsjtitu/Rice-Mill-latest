# Mill Entry System - PRD

## Current Version: v50.7.2

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON
- Local Server: Express + Local JSON
- Triple Backend Parity: 100% verified

## Credentials
- Username: admin, Password: admin123

## Key Features
- WhatsApp 360Messenger: Settings, Default Numbers, Group ID, Payment Reminders, Daily Reports
- Backup System: Backup Now (folder), Auto Daily, ZIP Download, ZIP Restore
- Extra Fields: Placement above/below + Label optional
- FY Only (KMS removed)
- Daily Report Export: PDF (Landscape, Paragraph wrapping headers) + Excel (proper column widths per section)

## Bug Fixes (Latest Session)
- WhatsApp send-daily-report/send-payment-reminder: Fixed default_numbers not being read properly
  - Added `saveImmediate()` for settings save (prevents debounce data loss)
  - Added defensive array checks + logging in all 3 backends
  - Fixed branding query in Python + branding fallback in JS

- Daily Report PDF/Excel table layout fixes:
  - PDF: Reduced cell padding (2pt vs 6pt default), Paragraph wrapping for headers, wider column widths in report_config.json
  - Excel: Explicit column widths per section (Paddy, Cash Flow, Diesel, Cash Txns), auto-fit cap raised to 40
  - All 20 paddy detail columns now fully readable (was truncated to single chars)
  - Synced report_config.json + daily_report.js + daily_report_logic.js to Desktop & Local Server

## Upcoming Tasks
- P1: Export Preview feature

## Backlog
- Desktop/Local server code dedup
- Payment logic centralization
