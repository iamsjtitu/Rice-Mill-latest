# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v87.5.0

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend
│   ├── server.py             # sync-status endpoint
│   └── routes/vehicle_weight.py   # Fixed saveImage, second-weight g_issued/tp_no, live-weight endpoint
├── desktop-app/              # Electron Express local backend
│   ├── main.js               # 50MB body limit, health, live-weight, sync-status endpoints
│   ├── serial-handler.js     # Exports getWeightStatus() for LAN access
│   ├── sqlite-database.js    # lastSaveTime tracking
│   └── routes/vehicle_weight.js # Fixed saveImage, second-weight g_issued/tp_no
├── local-server/             # Express local network (mirrors desktop-app)
│   └── routes/vehicle_weight.js # Same fixes mirrored
└── frontend/
    ├── src/App.js             # Pending VW badge with animate-pulse
    ├── src/components/VehicleWeight.jsx    # LAN scale polling, TP No column, g_issued in second-weight save
    ├── src/components/AutoWeightEntries.jsx # TP No column, G.Issued+TP in edit dialog
    ├── src/components/SessionIndicator.jsx # Data Sync status in heartbeat popover
    └── src/components/WhatsNew.jsx         # v87.5.0 changelog
```

## Completed Features (v87.5.0)
- [x] G.Issued + TP No. now save on second weight completion
- [x] TP No. column added to VehicleWeight and AutoWeightEntries tables
- [x] G.Issued + TP No. fields added to AutoWeightEntries edit dialog
- [x] Pending count badge blinks red (animate-pulse)
- [x] LAN browser shows REAL weighbridge weight via API polling
- [x] saveImage crash fix - handles Object/null/number
- [x] JSON body limit 5MB to 50MB
- [x] Data Sync status in heartbeat popover (entries, VW, cash txns, last save, engine)
- [x] Health check endpoint for LAN diagnostics

## Credentials
- Default Admin: admin / admin123
- Default Staff: staff / staff123

## Upcoming Tasks
- [ ] P1: Daily Summary Report (Auto)
- [ ] P2: Export Preview feature

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
