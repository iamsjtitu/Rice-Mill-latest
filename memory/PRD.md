# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v87.4.0

## Architecture
```
/app
├── backend/                  
│   ├── utils/audit.py             # Audit log utility
│   ├── utils/optimistic_lock.py   # Optimistic locking utility
│   ├── routes/auth.py             # User CRUD + Audit Log endpoints
│   ├── routes/entries.py          # _v stamping + audit logging
│   ├── routes/cashbook.py         # _v stamping + audit logging
│   ├── routes/private_trading.py  # _v stamping + audit logging
│   └── routes/vehicle_weight.py   # Fixed saveImage crash
├── desktop-app/              
│   ├── main.js               # Express 0.0.0.0 + LAN tracking + 50MB body limit
│   ├── sqlite-database.js    # Optimistic locking in add/update
│   ├── shared/               # 7 service modules
│   └── routes/               # All routes have logAudit + audit-log endpoint
│       └── vehicle_weight.js # Fixed saveImage crash + robust error handling
├── local-server/             # 100% IDENTICAL to desktop-app
│   └── routes/vehicle_weight.js # Fixed saveImage crash
└── frontend/                 
    ├── src/App.js             # 409 handler, permissions state
    ├── src/components/Settings.jsx     # UsersTab + AuditLogTab
    ├── src/components/RecordHistory.jsx # Per-record history dialog
    ├── src/components/VehicleWeight.jsx # Camera capture + weight entry
    ├── src/components/WhatsNew.jsx      # v87.4.0 changelog
    └── src/components/entries/TabNavigation.jsx # Permission-based tabs
```

## Completed Features (v87.4.0)
- [x] Vehicle Weight saveImage TypeError crash fixed
  - saveImage now has try-catch, strips data URL prefix, rejects non-string input
  - JSON body limit increased 5MB → 50MB for large camera images
  - Health check endpoint added (/api/health) for LAN diagnostics
  - Mirrored across Python, Desktop JS, and Local Server JS backends

## Completed Features (v86.0.0 - v87.3.0)
- [x] Audit Log (Kisne Kya Kiya) - full CRUD tracking across all backends
- [x] Manual Clear Old Logs + Clear All with custom retention
- [x] can_manual_weight permission for Weighbridge
- [x] Admin core permissions locked (can_edit, can_delete, can_edit_settings)
- [x] Audit log side-effect tracking for auto-created cashbook transactions
- [x] Users & Permissions Management (v85.0.0)
- [x] Optimistic Locking + LAN Network Access
- [x] SQLite migration, Quick Search, Shared Service Layer

## User Roles & Default Permissions
| Permission | Admin | Entry Operator | Accountant | Viewer |
|---|---|---|---|---|
| can_edit | Yes | Yes | Yes | No |
| can_delete | Yes | No | No | No |
| can_export | Yes | No | Yes | Yes |
| can_see_payments | Yes | No | Yes | Yes |
| can_see_cashbook | Yes | No | Yes | Yes |
| can_see_reports | Yes | No | Yes | Yes |
| can_edit_settings | Yes | No | No | No |

## Credentials
- Default Admin: admin / admin123
- Default Staff: staff / staff123

## Upcoming Tasks
- [ ] P1: Daily Summary Report (Auto)
- [ ] P2: Export Preview feature (Preview before Excel/PDF export)

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
