# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Current Version: v79.0.0

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend (MongoDB)
├── desktop-app/              # Electron Express desktop app (SQLite)
│   ├── shared/               # SHARED business logic (7 modules)
│   │   ├── party-helpers.js  # makePartyLabel, fmtDetail
│   │   ├── paddy-calc.js     # calcPaddyAuto
│   │   ├── payment-service.js # Private paddy/rice sale payments
│   │   ├── cashbook-service.js # Party detection, cash txn side effects
│   │   ├── hemali-service.js  # Hemali payment processing
│   │   ├── staff-service.js   # Staff advance/salary processing
│   │   └── report_helper.js   # Report column configs
│   └── routes/               # Thin HTTP handlers → call shared services
├── local-server/             # Express (SQLite) - 100% identical to desktop-app
└── frontend/                 # React Frontend
```

## Shared Service Layer (Complete)
All business logic centralized in 7 shared modules:
- `party-helpers.js` - Party label dedup
- `paddy-calc.js` - Paddy weight/amount calculations
- `payment-service.js` - Private paddy/rice sale payments
- `cashbook-service.js` - Party detection, cash transaction side effects
- `hemali-service.js` - Hemali advance/payment processing
- `staff-service.js` - Staff advance/salary cash entries
- `report_helper.js` - Report configs

## Credentials
- Username: admin, Password: admin123

## Backlog
### Completed
- [x] SQLite migration (desktop + local-server) 
- [x] Quick Search (Ctrl+K)
- [x] Shared Service Layer (7 modules, 100% parity)
- [x] Staff service integration into staff.js
- [x] Version v79.0.0

### P2 (Future/Optional)
- [ ] Python backend: mirror shared service logic for web parity
