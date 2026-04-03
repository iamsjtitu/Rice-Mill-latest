# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v87.5.0

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend
│   └── routes/vehicle_weight.py   # Fixed saveImage, second-weight g_issued/tp_no, live-weight endpoint
├── desktop-app/              # Electron Express local backend
│   ├── main.js               # 50MB body limit, health endpoint, live-weight endpoint
│   ├── serial-handler.js     # Exports getWeightStatus() for LAN access
│   ├── sqlite-database.js    # Optimistic locking + audit_log persistence
│   └── routes/vehicle_weight.js # Fixed saveImage, second-weight g_issued/tp_no
├── local-server/             # Express local network (mirrors desktop-app)
│   └── routes/vehicle_weight.js # Same fixes mirrored
└── frontend/
    ├── src/App.js             # Pending VW badge with animate-pulse
    ├── src/components/VehicleWeight.jsx    # LAN scale polling, TP No column, g_issued in second-weight save
    ├── src/components/AutoWeightEntries.jsx # TP No column, G.Issued+TP in edit dialog
    └── src/components/WhatsNew.jsx         # v87.5.0 changelog
```

## Completed Features (v87.5.0)
- [x] G.Issued + TP No. now save on second weight completion (was missing)
- [x] TP No. column added to VehicleWeight and AutoWeightEntries tables
- [x] G.Issued + TP No. fields added to AutoWeightEntries edit dialog
- [x] Pending count badge blinks red (animate-pulse) when count > 0
- [x] LAN browser shows REAL weighbridge weight via API polling (/api/weighbridge/live-weight)
- [x] saveImage crash fix - handles Object/null/number without crashing
- [x] Image data URL prefix stripping (data:image/jpeg;base64,...)
- [x] JSON body limit 5MB → 50MB for large camera images
- [x] Health check endpoint (/api/health) for LAN diagnostics

## Completed Features (v86.0.0 - v87.3.0)
- [x] Audit Log system across all 3 backends
- [x] Granular Permissions (can_manual_weight, etc.)
- [x] Admin core permissions locked
- [x] Users & Permissions Management
- [x] Optimistic Locking + LAN Network Access
- [x] SQLite migration, Quick Search, Shared Service Layer

## Credentials
- Default Admin: admin / admin123
- Default Staff: staff / staff123

## Upcoming Tasks
- [ ] P1: Daily Summary Report (Auto)
- [ ] P2: Export Preview feature (Preview before Excel/PDF export)

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
