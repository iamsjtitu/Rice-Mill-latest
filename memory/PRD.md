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

## Auto Cash Book Integration
All payments auto-create cash book entries (Nikasi/Jama). Undo/delete cleans up linked entries.

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Stability Fix (2026-02)
1. Global crash protection: `uncaughtException` + `unhandledRejection` handlers
2. All 170 route handlers wrapped with `safeAsync()`/`safeSync()`
3. Express error middleware added
4. Error logging to `mill-entry-error.log`
5. Atomic database save (temp file + rename)
6. Database auto-recovery from `.bak` backup
7. Server watchdog with auto-restart
8. `/api/health` endpoint

## G.Issued Auto-Deduction (2026-02)
- G.Issued in entries now auto-creates gunny bag "out" entry for Old (Market) bags
- Tracks agent_name, mandi_name, truck_no in the gunny bag entry
- Entry update/delete propagates to linked gunny bag entry
- Gunny bags summary no longer shows separate "Govt Issued (g)" - it's tracked via old.total_out
- All 3 backends updated (Python, desktop-app, local-server)

## Entry Form Field Reorder (2026-02)
- P.Pkt (Plastic Bags) and P.Pkt Cut (Auto) now appear BEFORE Mill W. QNTL (Auto)

## Error Log in Settings (2026-02)
- Error Log section added to Settings page
- Desktop app: reads actual error log file
- Web version: shows "not available" message
- All 3 backends have `/api/error-log` endpoint

## Prioritized Backlog
- P0: All critical features implemented and tested
- Long-term: Refactor `main.js` (2900+ lines) into modular route files
