# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration.

## Architecture
- **Frontend**: React (served by CRA dev server / Electron BrowserWindow)
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + SQLite (better-sqlite3)
- **Local Server**: Express + SQLite (LAN access)
- **Triple Backend Parity**: All logic changes must be replicated across Python, Desktop JS, and Local JS

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
  - File lock released immediately after every save (Google Drive can sync instantly)
  - Sync window reduced from 30s to 10s
  - Lock release time reduced from 2s to 0.5s
  - No external API needed - works directly with Google Drive desktop app

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High)
- [ ] Daily Summary Report (Auto)

### P2 (Medium)
- [ ] Python backend service layer refactoring
- [ ] Centralize stock calculation logic

### P3 (Low)
- [ ] Code deduplication across triple backends

## Key Credentials
- Login: admin / admin123

## Key Files (Sync)
- `/app/desktop-app/sqlite-database.js` - Auto-sync with fast lock release
- `/app/desktop-app/main.js` - File watcher startup

## Sync Flow (v88.33.0)
1. User selects data folder in Google Drive synced location
2. App loads SQLite DB from that folder
3. On every save: write to DB → close connection briefly → reopen (releases lock for GDrive)
4. Every 5s: poll file mtime for external changes (GDrive downloaded new version)
5. Every 10s: close+reopen connection (sync window for GDrive to read/write)
6. If external change detected: reload all data from disk
