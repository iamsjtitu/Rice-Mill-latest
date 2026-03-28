# Mill Entry System - PRD

## Current Version: v50.5.0

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON
- Local Server: Express + Local JSON

## Credentials
- Username: admin, Password: admin123
- 360Messenger API Key: Stored in DB settings

## Latest Features
- v50.5.0: WhatsApp Default Numbers, Group ID, Daily Report PDF attachment
- v50.4.0: WhatsApp 360Messenger integration
- v50.3.0: Full Backup System
- v50.1.0: Extra Fields Placement + Label optional
- v50.0.0: KMS removed, only FY

## WhatsApp API
- Service: 360Messenger (https://360messenger.com)
- Base URL: https://api.360messenger.com/v2
- Auth: Bearer token
- Features: Send text, media (PDF), payment reminders, daily reports, group messages
- Default numbers stored in DB - no prompt needed
- Group ID optional - daily report goes to group too

## Upcoming Tasks
- P1: Export Preview (preview before PDF/Excel download)

## Backlog
- Desktop/Local server code dedup
- Payment logic centralization
