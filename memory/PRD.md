# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated database sync between local computers.

## Current Version: v88.38.0

## What's Been Implemented
- Full mill entry CRUD with RST numbering
- Double-entry cash book & ledger system
- Private paddy trading with party ledgers
- Milling (CMR) operations
- DC payments, vouchers, purchase vouchers
- GST ledger & FY summary
- Staff management & hemali payments
- Auto vehicle weight with RTSP camera integration
- Weighbridge serial port integration
- Telegram & WhatsApp notifications
- User roles & permissions
- Audit logging
- Excel/PDF exports with proper date sorting
- Desktop app auto-updater via GitHub releases
- Shadow Copy sync (replaced Google Drive API)
- Mill entry cash/diesel edit syncs with vehicle_weights
- "Trans" renamed to "Trans Type" globally
- Auto-backup on logout with custom backup folder selection
- Backup list shows both default and custom directory backups
- JSON backup file upload & restore (v88.38.0)

## Prioritized Backlog

### P1 (High)
- [ ] Daily Summary Report (Auto) - if user requests

### P2 (Medium)
- [ ] Python backend service layer refactoring
- [ ] Centralize stock calculation logic

### P3 (Low)
- [ ] Code deduplication across triple backends

## Key Credentials
- Login: admin / admin123

## Architecture
- Triple Backend: Python (web), Desktop JS (Electron), Local JS (LAN server)
- All logic changes must be replicated across all 3 backends
- Shadow Copy sync replaces Google Drive API (removed due to data corruption)
- KV Store in SQLite for persisting desktop/local settings
