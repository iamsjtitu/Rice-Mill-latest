# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v88.0.0

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend
│   ├── server.py             # sync-status endpoint
│   └── routes/               # vehicle_weight.py, entries.py, cashbook.py etc.
├── desktop-app/              # Electron Express local backend
│   ├── main.js               # Hardware, LAN API, Google Drive cleanup
│   ├── serial-handler.js     # Exports getWeightStatus() for LAN access
│   ├── sqlite-database.js    # Local persistence DB logic
│   └── routes/               # JS API Routes (MUST mirror Python logic)
├── local-server/             # Express local network (mirrors desktop-app)
│   └── routes/               # Same JS routes mirrored
└── frontend/
    ├── src/App.js             # Global keyboard shortcuts, Router, RST auto-fill
    ├── src/components/VehicleWeight.jsx    # LAN scale polling, AutoSuggest
    ├── src/components/AutoWeightEntries.jsx # Completed weight entries
    ├── src/components/QuickSearch.jsx       # Theme-aware, Ctrl+Q
    └── src/components/common/AutoSuggest.jsx # Reusable autocomplete component
```

## Credentials
- Default Admin: admin / admin123
- Default Staff: staff / staff123

## Completed Features (v88.0.0+)
- [x] G.Issued + TP No. save on second weight completion
- [x] TP No. column in VehicleWeight and AutoWeightEntries tables
- [x] LAN browser shows REAL weighbridge weight via API polling
- [x] Data Sync status in heartbeat popover
- [x] Quick Search redesigned (theme-aware, Ctrl+Q, ESC fix)
- [x] Session persistence switched to sessionStorage (login on restart)
- [x] Google Drive duplicate folder cleanup on startup
- [x] Pending VW count badge fix (immediate refresh)
- [x] RST Date auto-fill from back-dated Vehicle Weight entries
- [x] Global Enter key = next field navigation
- [x] Vehicle No. suggestions now combine mill_entries + vehicle_weights (all 3 backends)

## Upcoming Tasks
- [ ] P0: Version bump to v88.1.0 + GitHub release for desktop testing
- [ ] P1: Daily Summary Report (Auto) - end-of-day summary
- [ ] P2: Export Preview feature (Preview before Excel/PDF export)

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
