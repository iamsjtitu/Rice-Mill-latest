# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities with automated hardware integration for vehicle weight capture.

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend (MongoDB)
│   └── routes/quick_search.py  # NEW: Global search across 13 collections
├── desktop-app/              # Electron Express desktop app (SQLite - v77.0.0)
│   ├── sqlite-database.js    # SQLite engine (better-sqlite3 + WAL mode)
│   ├── main.js               # Entry point (SQLite default, JSON fallback)
│   └── routes/quick_search.js # NEW: Quick search for desktop
├── local-server/             # Express local network server (SQLite - v77.0.0)
│   ├── sqlite-database.js    # Same SQLite engine as desktop-app
│   ├── server.js             # Updated with SQLite init + JSON fallback
│   └── routes/quick_search.js # NEW: Quick search for local server
├── frontend/                 # React Frontend (shared by all backends)
│   └── src/components/
│       ├── QuickSearch.jsx   # NEW: Global search modal (Ctrl+K)
│       └── entries/          # Modularized App.js components
└── .github/workflows/        # CI/CD for .exe builds
```

## Current Version: v77.0.0

## What's Been Implemented
- Full rice mill entry system with double-entry accounting
- Triple backend support (Python/MongoDB, Electron/SQLite, Express/SQLite)
- **Quick Search** (Ctrl+K) - searches across ALL 13 collections with grouped results, preview panel, and tab navigation
- Camera integration (USB + VIGI NVR) with 1080p async capture
- Auto-updater via GitHub releases
- Backup/restore system compatible with both JSON and SQLite
- Modularized App.js into 5 entry components

## Key Features
### Quick Search (NEW)
- Header button + Ctrl+K shortcut
- Searches: entries, cash book, private paddy, sale/purchase vouchers, DC, staff, milling, diesel, mill parts, hemali, rice sales, truck leases
- Grouped results with category icons
- Quick view preview panel
- Click to navigate to relevant tab
- Keyboard navigation (arrow keys, Enter, ESC)

## Credentials
- Username: admin, Password: admin123
- Username: staff, Password: staff123

## Prioritized Backlog

### P0 (Completed)
- [x] Desktop App SQLite migration + runtime verification
- [x] Local Server SQLite migration + runtime verification  
- [x] Fix `dbEngine` scope bug in desktop main.js
- [x] Fix `col()` function bug in hemali integrity check
- [x] Quick Search feature (all 3 backends + frontend)

### P1 (Next Up)
- [ ] Export Preview feature (preview data before Excel/PDF export)

### P2 (Future)
- [ ] Centralize payment/stock logic across triple backends
- [ ] Refactor payment processing into shared service layer
- [ ] Reduce code duplication between desktop-app and local-server routes
