# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v88.1.0

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend
│   └── routes/entries.py     # Suggestions now combine mill_entries + vehicle_weights
├── desktop-app/              # Electron Express local backend
│   └── routes/entries.js     # Same combined suggestions
├── local-server/             # Express local network (mirrors desktop-app)
│   └── routes/entries.js     # Same combined suggestions
└── frontend/
    ├── src/components/AutoWeightEntries.jsx # Fixed edit URL (/edit suffix)
    └── src/components/common/AutoSuggest.jsx # Reusable autocomplete
```

## Credentials
- Default Admin: admin / admin123
- Default Staff: staff / staff123

## Completed Features (v88.1.0)
- [x] Vehicle No. suggestions combine mill_entries + vehicle_weights
- [x] Party Name suggestions combine mill_entries.agent_name + vehicle_weights.party_name
- [x] Source suggestions combine mill_entries.mandi_name + vehicle_weights.farmer_name
- [x] Auto Weight Entries edit "Update error" fix (missing /edit URL suffix)
- [x] RST Date auto-fill from back-dated Vehicle Weight entries
- [x] Global Enter key = next field navigation
- [x] All previous features from v87.5.0 and earlier

## Upcoming Tasks
- [ ] P0: Version bump + GitHub release for desktop testing
- [ ] P1: Daily Summary Report (Auto) - end-of-day summary
- [ ] P2: Export Preview feature (Preview before Excel/PDF export)

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
