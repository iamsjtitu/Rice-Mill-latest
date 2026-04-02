# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and LAN network access.

## Current Version: v82.0.0

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend (MongoDB)
├── desktop-app/              
│   ├── main.js               # Express binds to 0.0.0.0 for LAN access
│   ├── shared/               # Centralized business logic (7 modules)
│   │   ├── party-helpers.js, paddy-calc.js, payment-service.js
│   │   ├── cashbook-service.js, hemali-service.js, staff-service.js
│   │   └── report_helper.js
│   └── routes/               # 37 route files - thin HTTP handlers
├── local-server/             # 100% IDENTICAL to desktop-app (shared + routes)
│   └── server.js             # Dynamic host URL injection for LAN access
└── frontend/                 # React Frontend
```

## Completed Features (v82.0.0)
- [x] LAN Network Access - Desktop app accessible from other computers on same WiFi/LAN
- [x] Dynamic host URL injection for both desktop-app and local-server
- [x] SQLite migration (desktop + local-server)
- [x] Quick Search (Ctrl+K)
- [x] Shared Service Layer (7 modules, 100% parity)
- [x] Staff service integration
- [x] FY Auto-Switch (April automatic switch)
- [x] Session Indicator for multi-computer sync
- [x] 100% file parity (44 files between desktop-app and local-server)

## LAN Network Access Details
- Express server binds to `0.0.0.0` (accessible from any device on the network)
- Electron BrowserWindow still loads `127.0.0.1` (host computer works normally)
- HTML injection uses `req.headers.host` for dynamic API URL (LAN clients get correct IP)
- CORS enabled for cross-origin requests
- User instructions: Run `ipconfig` (Windows) to find IPv4 address, then open `http://<IP>:9876` on other computer

## Credentials
- Username: admin, Password: admin123

## Future (Optional)
- [ ] Python backend: mirror shared service logic for web parity
- [ ] Export Preview feature
