# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities with automated hardware integration for vehicle weight capture.

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend (MongoDB)
├── desktop-app/              # Electron Express desktop app (SQLite - v77.0.0)
│   ├── sqlite-database.js    # SQLite engine (better-sqlite3 + WAL mode)
│   ├── main.js               # Entry point (SQLite default, JSON fallback)
│   └── routes/               # Must mirror Python backend logic
├── local-server/             # Express local network server (SQLite - v77.0.0)
│   ├── sqlite-database.js    # Same SQLite engine as desktop-app
│   ├── server.js             # Updated with SQLite init + JSON fallback
│   └── routes/               # Must mirror Python backend logic
├── frontend/                 # React Frontend (shared by all backends)
│   └── src/components/entries/ # Modularized App.js components
└── .github/workflows/        # CI/CD for .exe builds
```

## Current Version: v77.0.0

## What's Been Implemented
- Full rice mill entry system with double-entry accounting
- Triple backend support (Python/MongoDB, Electron/SQLite, Express/SQLite)
- Camera integration (USB + VIGI NVR) with 1080p async capture
- Auto-updater via GitHub releases
- Backup/restore system compatible with both JSON and SQLite
- Session heartbeat for multi-computer detection
- Modularized App.js into 5 entry components

## Key Technical Details
- **SQLite Migration**: Both desktop-app and local-server now use `better-sqlite3` with WAL mode as default storage. Auto-migration from JSON is built-in. JsonDatabase kept as fallback.
- **Triple Backend Parity**: Any logic change in Python routes MUST be replicated in both JS route folders.
- **Camera Optimization**: Uses async `toBlob()` to prevent UI freezing during capture.

## Credentials
- Username: admin, Password: admin123
- Username: staff, Password: staff123

## Prioritized Backlog

### P0 (Completed This Session)
- [x] Desktop App SQLite migration + runtime verification
- [x] Local Server SQLite migration + runtime verification  
- [x] Fix `dbEngine` scope bug in desktop main.js
- [x] Fix `col()` function bug in hemali integrity check (main.js)

### P1 (Next Up)
- [ ] Export Preview feature (preview data before Excel/PDF export)

### P2 (Future)
- [ ] Centralize payment/stock logic across triple backends
- [ ] Refactor payment processing into shared service layer
- [ ] Reduce code duplication between desktop-app and local-server routes
