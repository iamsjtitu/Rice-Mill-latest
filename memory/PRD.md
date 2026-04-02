# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, and multi-user data safety.

## Current Version: v82.0.0

## Architecture
```
/app
├── backend/                  
│   ├── utils/optimistic_lock.py  # NEW: Optimistic locking utility
│   ├── routes/entries.py         # _v stamping on POST, version check on PUT
│   ├── routes/cashbook.py        # _v stamping on POST, version check on PUT
│   └── routes/private_trading.py # _v stamping on POST, version check on PUT
├── desktop-app/              
│   ├── main.js               # Express binds to 0.0.0.0 + LAN client tracking
│   ├── sqlite-database.js    # addEntry(_v:1), updateEntry(conflict check)
│   ├── shared/               # Centralized business logic (7 modules)
│   └── routes/               # 37 route files - optimistic locking in entries, cashbook, private_trading
├── local-server/             # 100% IDENTICAL to desktop-app
└── frontend/                 
    └── src/App.js            # Global 409 interceptor, auto-refresh on conflict
```

## Completed Features
- [x] Optimistic Locking (multi-user data safety)
  - _v field added to all new records (entries, cash_book, private_paddy, rice_sales)
  - PUT requests check _v before update, return 409 on conflict
  - Frontend global axios interceptor catches 409 and auto-refreshes
  - Backward compatible: legacy records without _v still work
  - Invisible to users: no UI changes, just backend safety
- [x] LAN Network Access + Connected Computers indicator
- [x] Header cleanup: Admin dropdown, Print button removed
- [x] SQLite migration, Quick Search, Shared Service Layer
- [x] FY Auto-Switch, Session Indicator
- [x] 100% file parity between desktop-app and local-server

## Key Technical: Optimistic Locking
- POST: `stamp_version(doc)` adds `_v: 1`
- PUT: `optimistic_update(collection, id, data, client_v)` checks version
- 409 response: `{"detail": "Ye record kisi aur ne update kar diya hai..."}`
- Frontend: `axios.interceptors.response` catches 409, shows toast, dispatches `data-conflict-refresh` event
- Desktop: `updateEntry()` in sqlite-database.js checks `_v`, returns `{_conflict: true}` on mismatch

## Credentials
- Username: admin, Password: admin123

## Future (Optional)
- [ ] Export Preview feature
- [ ] Python backend service layer refactoring (low priority)
