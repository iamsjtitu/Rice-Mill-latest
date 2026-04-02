# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v85.0.0

## Architecture
```
/app
├── backend/                  
│   ├── utils/optimistic_lock.py  # Optimistic locking utility
│   ├── routes/auth.py            # User CRUD + Role-based permissions + Login
│   ├── routes/entries.py         # _v stamping + version check
│   ├── routes/cashbook.py        # _v stamping + version check
│   └── routes/private_trading.py # _v stamping + version check
├── desktop-app/              
│   ├── main.js               # Express 0.0.0.0 + LAN tracking
│   ├── sqlite-database.js    # Optimistic locking in add/update
│   ├── shared/               # 7 service modules
│   └── routes/auth.js        # User CRUD mirrored from Python
├── local-server/             # 100% IDENTICAL to desktop-app
└── frontend/                 
    ├── src/App.js             # 409 handler, permissions state
    ├── src/components/Settings.jsx     # UsersTab component
    ├── src/components/SessionIndicator.jsx # Heartbeat indicator
    └── src/components/entries/TabNavigation.jsx # Permission-based tabs
```

## Completed Features (v85.0.0)
- [x] Users & Permissions Management
  - User CRUD (create/update/deactivate) - admin only
  - Roles: Admin, Entry Operator, Accountant, Viewer
  - Granular permissions: can_edit, can_delete, can_export, can_see_payments, can_see_cashbook, can_see_reports, can_edit_settings
  - Staff linking to user accounts
  - Permission-based tab visibility
  - Login returns permissions, stored in localStorage
- [x] Optimistic Locking (multi-user data safety)
- [x] LAN Network Access + Heartbeat Indicator
- [x] Header cleanup: Admin dropdown
- [x] SQLite migration, Quick Search, Shared Service Layer
- [x] FY Auto-Switch, Session Indicator

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

## API Endpoints - Users
- `GET /api/users?username=&role=admin` - List all users + staff
- `POST /api/users?username=&role=admin` - Create user
- `PUT /api/users/{id}?username=&role=admin` - Update user
- `DELETE /api/users/{id}?username=&role=admin` - Deactivate user

## Credentials
- Default Admin: admin / admin123
- Default Staff: staff / staff123

## Future (Optional)
- [ ] Export Preview feature
- [ ] Python backend service layer refactoring
