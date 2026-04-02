# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend (MongoDB)
│   └── routes/quick_search.py
├── desktop-app/              # Electron Express desktop app (SQLite)
│   ├── sqlite-database.js    # SQLite engine (better-sqlite3 + WAL mode)
│   ├── shared/               # SHARED business logic (source of truth)
│   │   ├── party-helpers.js  # makePartyLabel, fmtDetail
│   │   ├── paddy-calc.js     # calcPaddyAuto
│   │   ├── payment-service.js # Private paddy/rice sale payments
│   │   ├── cashbook-service.js # Party detection, cash txn side effects
│   │   ├── hemali-service.js  # Hemali payment processing
│   │   ├── staff-service.js   # Staff advance/salary processing
│   │   └── report_helper.js   # Report column configs
│   ├── main.js
│   └── routes/               # Thin HTTP handlers → call shared services
├── local-server/             # Express local network server (SQLite)
│   ├── sqlite-database.js    # Same as desktop-app
│   ├── shared/               # IDENTICAL copy of desktop-app/shared/
│   ├── server.js
│   └── routes/               # IDENTICAL copy of desktop-app/routes/
├── frontend/                 # React Frontend
│   └── src/components/
│       ├── QuickSearch.jsx   # Ctrl+K global search
│       └── entries/          # Modularized App.js components
└── .github/workflows/
```

## Current Version: v78.0.0

## Key Design Decisions
- **Shared Service Layer**: All business logic centralized in `shared/` modules. Route files are thin HTTP handlers that delegate to shared functions. Both desktop-app and local-server have identical copies.
- **SQLite Migration**: Both JS backends use better-sqlite3 with WAL mode. Auto-migration from JSON built-in.
- **100% File Parity**: All 38+ route and shared files are identical between desktop-app and local-server.

## Credentials
- Username: admin, Password: admin123

## Prioritized Backlog

### Completed
- [x] Desktop + Local Server SQLite migration
- [x] Quick Search (Ctrl+K) - 13 collections
- [x] Shared Service Layer - cashbook, hemali, staff, payment, paddy-calc, party-helpers
- [x] 100% file parity between desktop-app and local-server
- [x] Version v78.0.0

### P1 (Next Up)
- [ ] Export Preview feature (preview data before Excel/PDF export)

### P2 (Future)
- [ ] Integrate staff-service.js into staff.js route handlers
- [ ] Python backend: mirror shared service logic for web version parity
