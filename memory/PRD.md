# Mill Entry System - PRD

## Current Version: v50.7.2

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON
- Local Server: Express + Local JSON
- Triple Backend Parity: 100% verified (all routes synced)

## Credentials
- Username: admin, Password: admin123

## Route Sync Status (v50.7.2)
- Python Backend: All routes present
- Desktop-app: All routes synced including WhatsApp + Backup ZIP
- Local-server: All routes synced including WhatsApp + Backup ZIP
- New packages: adm-zip (for ZIP restore in desktop/local)

## Key Features
- WhatsApp 360Messenger: Settings, Default Numbers, Group ID, Payment Reminders, Daily Report PDF
- Backup System: Backup Now (folder), Auto Daily, ZIP Download, ZIP Restore
- Extra Fields: Placement above/below + Label optional
- FY Only (KMS removed)

## Bug Fixes (Latest)
- WhatsApp send-daily-report/send-payment-reminder: Fixed default_numbers not being read properly
  - Added `saveImmediate()` for settings save (prevents debounce data loss)
  - Added defensive array checks for default_numbers (handles string/null/undefined)
  - Added logging for debugging in all 3 backends
  - Fixed branding query in Python (was querying wrong collection)
  - Fixed branding fallback in JS (app_settings + database.data.branding)

## Upcoming Tasks
- P1: Export Preview

## Backlog
- Desktop/Local server code dedup (ongoing)
- Payment logic centralization
