# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities with automated hardware integration for vehicle weight capture.

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend (MongoDB)
│   └── routes/quick_search.py  # Global search across 13 collections
├── desktop-app/              # Electron Express desktop app (SQLite)
│   ├── sqlite-database.js    # SQLite engine (better-sqlite3 + WAL mode)
│   ├── shared/               # Shared business logic modules
│   │   ├── party-helpers.js  # makePartyLabel, fmtDetail
│   │   ├── paddy-calc.js     # calcPaddyAuto (weight/deduction calculations)
│   │   ├── payment-service.js # All payment processing logic (centralized)
│   │   └── report_helper.js  # Report column configs
│   ├── main.js               # Entry point (SQLite default, JSON fallback)
│   └── routes/               # Must mirror Python backend logic
├── local-server/             # Express local network server (SQLite)
│   ├── sqlite-database.js    # Same SQLite engine as desktop-app
│   ├── shared/               # IDENTICAL to desktop-app/shared/
│   ├── server.js             # Updated with SQLite init + JSON fallback
│   └── routes/               # IDENTICAL to desktop-app/routes/
├── frontend/                 # React Frontend (shared by all backends)
│   └── src/components/
│       ├── QuickSearch.jsx   # Global search modal (Ctrl+K)
│       └── entries/          # Modularized App.js components
└── .github/workflows/        # CI/CD for .exe builds
```

## Current Version: v78.0.0

## What's Been Implemented
- Full rice mill entry system with double-entry accounting
- Triple backend support (Python/MongoDB, Electron/SQLite, Express/SQLite)
- **Quick Search** (Ctrl+K) - searches across ALL 13 collections
- **Shared Service Layer** - Payment logic centralized in shared/ modules
- Camera integration (USB + VIGI NVR) with 1080p async capture
- Auto-updater via GitHub releases
- Backup/restore system compatible with both JSON and SQLite

## Credentials
- Username: admin, Password: admin123
- Username: staff, Password: staff123

## Prioritized Backlog

### P0 (Completed)
- [x] Desktop App SQLite migration + verification
- [x] Local Server SQLite migration + verification
- [x] Quick Search feature (all 3 backends + frontend)
- [x] Shared Service Layer for payment processing
- [x] Version bump to v78.0.0

### P1 (Next Up)
- [ ] Export Preview feature (preview data before Excel/PDF export)

### P2 (Future)
- [ ] Extend shared service layer to more routes (cashbook, hemali, etc.)
- [ ] Code deduplication between desktop-app and local-server routes
