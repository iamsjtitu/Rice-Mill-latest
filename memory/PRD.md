# Mill Entry System - PRD

## Current Version: v50.3.0

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON
- Local Server: Express + Local JSON
- Triple Backend Parity enforced

## Credentials
- Username: admin, Password: admin123

## Latest Features
- v50.3.0: Full Backup System (Backup Now + Auto Daily + ZIP Download + ZIP Restore)
- v50.2.0: Backup Download ZIP + Restore
- v50.1.0: Extra Fields Placement + Label optional
- v50.0.0: KMS removed, only FY

## Key API Endpoints
- GET /api/backups - List saved backups
- POST /api/backups - Create backup now (folder)
- POST /api/backups/restore - Restore from folder backup
- DELETE /api/backups/{filename} - Delete backup
- GET /api/backup/download - ZIP download
- POST /api/backup/restore - ZIP upload restore
- GET /api/backups/status - Check today's backup status

## Upcoming Tasks
- P1: Export Preview
- P1: WhatsApp Share (wa.me links)
- P2: WhatsApp API integration (user deciding service)
- P2: Auto Daily Backup scheduling config

## Backlog
- Desktop/Local server code dedup
- Payment logic centralization
