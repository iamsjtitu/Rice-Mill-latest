# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v88.3.0

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend
│   └── routes/entries.py     # Duplicate RST check added
├── desktop-app/              # Electron Express local backend
│   └── routes/entries.js     # Duplicate RST check added
├── local-server/             # Express local network (mirrors desktop-app)
│   └── routes/entries.js     # Duplicate RST check added
└── frontend/
    ├── src/App.js             # Global Enter key handler
    ├── src/components/VehicleWeight.jsx
    └── src/components/common/AutoSuggest.jsx
```

## Credentials
- Default Admin: admin / admin123
- Default Staff: staff / staff123

## Completed Features (v88.3.0+)
- [x] Duplicate RST number blocked (same rst_no + kms_year = error)
- [x] Vehicle/Party/Source suggestions combine mill_entries + vehicle_weights
- [x] Enter key navigation reaches Save button in VW form
- [x] AutoSuggest Enter key conflict resolved
- [x] Auto Weight Entries edit fix
- [x] RST Date auto-fill from back-dated VW entries
- [x] Global Enter key = next field navigation

## Upcoming Tasks
- [ ] P0: Version bump + GitHub release
- [ ] P1: Daily Summary Report (Auto)
- [ ] P2: Export Preview feature

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
