# NAVKAR AGRO - Mill Entry System PRD

## Architecture
- Frontend: React (CRA) + Shadcn/UI + Tailwind
- Backend: FastAPI (Python), Database: MongoDB
- Desktop: Electron + Express + JSON DB (v24.0.8)
- Credentials: admin / admin123, staff / staff123

---

## Implemented Features

### Authentication
- Login with username/password
- Password change feature
- Desktop startup: ensures admin/staff default users exist in DB

### Balance Sheet (Tally-style)
- Liabilities vs Assets side-by-side layout
- Expand/collapse groups with chevron click
- Keyboard Navigation: ArrowUp/Down, ArrowRight/Left, Enter/Space
- Print, PDF (landscape side-by-side), Excel (side-by-side cols) export

### FY Summary
- 11 sections + Carry Forward
- Sub-tabs: FY Summary + Balance Sheet

### Bug Fixes (Web)
- Daily Report PDF: Landscape for detail mode
- Local Party: Cashbook payment linking, summary bar fix
- Login: Inline error + toast
- Lokesh Fuels: Empty descriptions auto-filled (startup migration)
- Auto-ledger: Description auto-generated when empty

## Desktop App (v24.0.8) - Critical Fixes
Three ROOT CAUSES found and fixed for persistent login 404 error:
1. **safe_handler.js missing export**: `safeHandler` function was not exported but 5 route files imported it → crash during route loading
2. **shared/ directory missing**: 4 route files imported from `../../shared/report_helper` which doesn't exist in packaged app → crash
3. **private_trading.js syntax error**: Premature `return router; };` at line 372 + dead MongoDB migration code after it → syntax error

Additional improvements:
- Route loading now isolated (individual try/catch per module) - one failing route won't kill all routes
- shared/ directory copied into desktop-app/ and added to electron-builder files
- Debug endpoint `/api/debug/routes` shows which routes loaded/failed
- Debug info panel on login page shows API URL and electron detection status
- Frontend rebuilt with REACT_APP_BACKEND_URL='' (relative API calls)

## Pending / Backlog
- P1: User must test v24.0.8 desktop login
- P2: Refactor duplicated PDF/Excel logic
- P2: Centralize stock calculation
- P2: Break down large App.js into smaller components
- P3: Remove debug info from login page once desktop login confirmed working
- P3: Fix preload.js (electronAPI: N) - low priority since HTML injection works
