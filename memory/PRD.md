# Mill Entry System - PRD

## Original Problem Statement
Comprehensive rice mill management tool (NAVKAR AGRO). React frontend + Python/FastAPI backend + Node.js backends (local-server, desktop-app/Electron).

## Architecture
- Frontend: React (port 3000)
- Primary Backend: Python/FastAPI (port 8001)
- Local Server: Node.js/Express (port 8080)
- Desktop App: Electron + Node.js/Express

## Core Features
All features, CRUD, exports, and integrations fully implemented across all 3 backends.

## Route Parity Verification (2026-03-08)
- Python: 156 routes
- Local-server: 161 routes (156 + 5 backup-only)
- Desktop-app: 155 routes (156 - 1 root)
- All routes matched. No missing endpoints.

## Missing Endpoints Added (2026-03-08)
1. GET/PUT /cash-book/opening-balance
2. GET /dc-entries/excel, /dc-entries/pdf
3. GET /gunny-bags/excel, /gunny-bags/pdf
4. GET /msp-payments/excel, /msp-payments/pdf
5. GET /staff/advance-balance/:staffId
6. PUT /dc-entries/:id

## Auto Cash Book Integration
All payments auto-create cash book entries (Nikasi/Jama). Undo/delete cleans up linked entries.

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Stability Fix (2026-02-XX)
### Changes Made:
1. **Global Error Handlers**: Added `process.on('uncaughtException')` and `process.on('unhandledRejection')` to prevent Node.js process from crashing on errors
2. **Safe Route Wrappers**: All 131 route handlers in `main.js` and 39 in modular route files wrapped with `safeAsync()` / `safeSync()` to catch errors gracefully
3. **Express Error Middleware**: Added 4-param error handler as last middleware
4. **Error Logging**: All errors logged to `mill-entry-error.log` in app data folder
5. **Atomic Database Save**: Database writes now use temp file + rename to prevent corruption
6. **Database Recovery**: Auto-recovery from `.bak` backup if main data file is corrupted
7. **Server Watchdog**: Periodic health check that auto-restarts Express server if it dies
8. **Health Endpoint**: `/api/health` endpoint for monitoring

### Files Modified:
- `/app/desktop-app/main.js` - All stability fixes
- `/app/desktop-app/routes/staff.js` - Safe wrappers
- `/app/desktop-app/routes/daily_report.js` - Safe wrappers
- `/app/desktop-app/routes/mill_parts.js` - Safe wrappers
- `/app/desktop-app/routes/reports_pnl.js` - Safe wrappers
- `/app/desktop-app/routes/safe_handler.js` - NEW shared utility

## Prioritized Backlog
- P0: Stability fix implemented - needs user verification
- Long-term: Refactor `main.js` (2800+ lines) into modular route files
