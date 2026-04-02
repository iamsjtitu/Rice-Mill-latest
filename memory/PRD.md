# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v86.0.0

## Architecture
```
/app
├── backend/                  
│   ├── utils/audit.py             # Audit log utility
│   ├── utils/optimistic_lock.py   # Optimistic locking utility
│   ├── routes/auth.py             # User CRUD + Audit Log endpoints
│   ├── routes/entries.py          # _v stamping + audit logging
│   ├── routes/cashbook.py         # _v stamping + audit logging
│   └── routes/private_trading.py  # _v stamping + audit logging
├── desktop-app/              
│   ├── main.js               # Express 0.0.0.0 + LAN tracking
│   ├── sqlite-database.js    # Optimistic locking in add/update
│   ├── shared/               # 7 service modules
│   └── routes/               # All routes have logAudit + audit-log endpoint
├── local-server/             # 100% IDENTICAL to desktop-app
└── frontend/                 
    ├── src/App.js             # 409 handler, permissions state
    ├── src/components/Settings.jsx     # UsersTab + AuditLogTab
    ├── src/components/RecordHistory.jsx # Per-record history dialog
    ├── src/components/SessionIndicator.jsx # Heartbeat indicator
    └── src/components/entries/TabNavigation.jsx # Permission-based tabs
```

## Completed Features (v86.0.0)
- [x] Audit Log (Kisne Kya Kiya)
  - log_audit() tracks Create/Update/Delete across entries, cashbook, private_trading, payments
  - Changes tracked: old value → new value for each field
  - Hindi summaries: "admin ne truck_no: ABC → XYZ change kiya"
  - Settings > Audit Log tab with user/type/date filters
  - RecordHistory icon on Entries, PaddyPurchase, CashBook table rows
  - Per-record history dialog (click icon to see all changes for that record)
  - Mirrored across Python, Desktop JS, and Local Server JS backends

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

## API Endpoints - Audit Log
- `GET /api/audit-log?username=&role=admin&page=1&page_size=50&filter_user=&filter_collection=&filter_date=` - List all audit logs (admin only)
- `GET /api/audit-log/record/{record_id}` - Get history for a specific record

## Credentials
- Default Admin: admin / admin123
- Default Staff: staff / staff123

## Future (Optional)
- [ ] Export Preview feature
- [ ] Python backend service layer refactoring
- [ ] Daily Summary Report (Auto) - Auto-generated summary sent via WhatsApp/Telegram
