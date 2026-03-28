# Mill Entry System - PRD

## Current Version: v50.4.0

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON
- Local Server: Express + Local JSON
- Triple Backend Parity enforced

## Credentials
- Username: admin, Password: admin123
- 360Messenger API Key: Stored in DB (settings collection)

## Latest Features
- v50.4.0: WhatsApp Integration (360Messenger API) - Settings config, Payment Reminders, Daily Report share, Test Message
- v50.3.0: Full Backup System (Backup Now + Auto Daily + ZIP Download + ZIP Restore)
- v50.1.0: Extra Fields Placement + Label optional
- v50.0.0: KMS removed, only FY

## Key API Endpoints - WhatsApp
- GET/PUT /api/whatsapp/settings - Configure API key
- POST /api/whatsapp/test - Test connection
- POST /api/whatsapp/send - Send custom message
- POST /api/whatsapp/send-payment-reminder - Payment due reminder
- POST /api/whatsapp/send-daily-report - Daily report summary

## Upcoming Tasks
- P1: Export Preview (preview before PDF/Excel download)
- P2: More WhatsApp share points (Party Summary, Vouchers, etc.)

## Backlog
- Desktop/Local server code dedup
- Payment logic centralization
