# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v88.2.0

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend
│   └── routes/entries.py     # Suggestions combine mill_entries + vehicle_weights
├── desktop-app/              # Electron Express local backend
│   └── routes/entries.js     # Same combined suggestions
├── local-server/             # Express local network (mirrors desktop-app)
│   └── routes/entries.js     # Same combined suggestions
└── frontend/
    ├── src/App.js             # Global Enter key handler (now includes save buttons)
    ├── src/components/VehicleWeight.jsx    # Save btn testid updated
    ├── src/components/AutoWeightEntries.jsx # Fixed edit URL
    └── src/components/common/AutoSuggest.jsx # Enter key conflict fixed
```

## Credentials
- Default Admin: admin / admin123
- Default Staff: staff / staff123

## Completed Features (v88.2.0)
- [x] Vehicle No. suggestions combine mill_entries + vehicle_weights (all 3 backends)
- [x] Party Name + Source suggestions combine mill_entries + vehicle_weights
- [x] Auto Weight Entries edit "Update error" fix
- [x] Enter key navigation now reaches Save button in VW form
- [x] AutoSuggest Enter key conflict resolved (no more blocking global handler)
- [x] RST Date auto-fill from back-dated Vehicle Weight entries
- [x] Global Enter key = next field navigation (all forms)

## Upcoming Tasks
- [ ] P0: Version bump + GitHub release
- [ ] P1: Daily Summary Report (Auto)
- [ ] P2: Export Preview feature

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
