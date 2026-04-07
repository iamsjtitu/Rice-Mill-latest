# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage.

## Current Version: v88.33.0

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
- **Fast Auto-Sync** (v88.33.0):
  - File lock released after every save for Google Drive desktop sync
  - Sync window: 10s, lock release: 0.5s
- **Bug Fix**: Mill entry cash/diesel edit now updates linked vehicle_weight entries (all 3 backends)

## Prioritized Backlog

### P1 (High)
- [ ] Daily Summary Report (Auto)

### P2 (Medium)
- [ ] Python backend service layer refactoring
- [ ] Centralize stock calculation logic

### P3 (Low)
- [ ] Code deduplication across triple backends

## Key Credentials
- Login: admin / admin123

## Sync Flow (v88.33.0)
1. DB in Google Drive folder → app locks file while running
2. After each save: close SQLite briefly → Google Drive detects change → uploads
3. Every 10s: close+reopen → Google Drive can download new version
4. External file change detected → auto-reload data
