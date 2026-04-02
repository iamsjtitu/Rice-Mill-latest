# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and LAN network access.

## Current Version: v82.0.0

## Architecture
```
/app
├── backend/                  # Python FastAPI web backend (MongoDB)
├── desktop-app/              
│   ├── main.js               # Express binds to 0.0.0.0 for LAN access + LAN client tracking
│   ├── shared/               # Centralized business logic (7 modules)
│   │   ├── party-helpers.js, paddy-calc.js, payment-service.js
│   │   ├── cashbook-service.js, hemali-service.js, staff-service.js
│   │   └── report_helper.js
│   └── routes/               # 37 route files - thin HTTP handlers
├── local-server/             # 100% IDENTICAL to desktop-app (shared + routes)
│   └── server.js             # Dynamic host URL injection + LAN client tracking
└── frontend/                 # React Frontend
```

## Completed Features (v82.0.0)
- [x] LAN Network Access - Desktop app accessible from other computers on same WiFi/LAN
- [x] LAN Connected Indicator - Shows count of connected computers in header (Electron only)
- [x] `/api/lan-clients` endpoint - Tracks unique LAN client IPs (desktop + local-server)
- [x] Dynamic host URL injection for both desktop-app and local-server
- [x] Header cleanup - Password Change & Logout moved to admin dropdown
- [x] Print button removed from global header
- [x] Admin dropdown menu (username badge clickable with dropdown)
- [x] SQLite migration (desktop + local-server)
- [x] Quick Search (Ctrl+K)
- [x] Shared Service Layer (7 modules, 100% parity)
- [x] FY Auto-Switch (April automatic switch)
- [x] Session Indicator for multi-computer sync
- [x] 100% file parity (44 files between desktop-app and local-server)

## Credentials
- Username: admin, Password: admin123

## Future (Optional)
- [ ] Python backend: mirror shared service logic for web parity
- [ ] Export Preview feature
