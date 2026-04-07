# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration.

## Architecture
- **Frontend**: React (served by CRA dev server / Electron BrowserWindow)
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + SQLite (better-sqlite3)
- **Local Server**: Express + SQLite (LAN access)
- **Triple Backend Parity**: All logic changes must be replicated across Python, Desktop JS, and Local JS

## Current Version: v88.31.0

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
- User roles & permissions (admin, accountant, entry_operator, viewer)
- Audit logging
- Excel/PDF exports with proper date sorting
- Desktop app auto-updater via GitHub releases
- **Google Drive Direct API Sync** (v88.31.0) - Settings > Sync tab
  - OAuth2 flow for Google Drive connection
  - Smart sync (newer file wins)
  - Auto-sync with configurable interval (default 10s)
  - Debounced upload on save (3s)
  - Upload/Download/Smart Sync buttons
  - Header Sync button GDrive-aware
  - Web mode shows "Desktop only" message

## Prioritized Backlog

### P0 (Critical)
- [x] Google Drive Direct API Sync (v88.31.0)
- [ ] User verification: Test GDrive OAuth flow on actual desktop app

### P1 (High)
- [ ] Daily Summary Report (Auto) - End of day summary generation
- [ ] Verify Google Cloud Console redirect URI setup

### P2 (Medium)
- [ ] Python backend service layer refactoring
- [ ] Centralize stock calculation logic
- [ ] Payment processing centralized service

### P3 (Low)
- [ ] Code deduplication across triple backends

## Key Credentials
- Login: admin / admin123
- Google OAuth Client ID: YOUR_CLIENT_ID_HERE
- Google OAuth Client Secret: YOUR_CLIENT_SECRET_HERE
- Redirect URI: http://localhost:9876/api/gdrive/callback

## Key Files (GDrive Sync)
- `/app/desktop-app/gdrive-sync.js` - Core sync module
- `/app/desktop-app/main.js` - API endpoints + initialization
- `/app/frontend/src/components/Settings.jsx` - Sync tab UI
- `/app/backend/server.py` - Web mode stub endpoint
- `/app/frontend/src/App.js` - Header Sync button (GDrive-aware)
- `/app/frontend/src/components/WhatsNew.jsx` - Changelog

## Google Drive Sync Flow
1. User goes to Settings > Sync > clicks "Connect"
2. Google OAuth page opens in browser
3. User grants permission → callback to localhost:9876/api/gdrive/callback
4. Refresh token stored in gdrive-tokens.json (in userData folder)
5. Auto-sync polls every 10s, uploads 3s after each save
6. Smart sync compares local mtime vs Drive modifiedTime → newer wins
7. On download: close DB → backup → replace → reload
