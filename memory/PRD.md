# NAVKAR AGRO - Mill Entry System PRD

## Architecture
- Frontend: React (CRA) + Shadcn/UI + Tailwind
- Backend: FastAPI (Python), Database: MongoDB
- Desktop: Electron + Express + JSON DB (v24.0.6)
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

### Bug Fixes
- Daily Report PDF: Landscape for detail mode
- Local Party: Cashbook payment linking, summary bar fix
- Login: Inline error + toast
- Lokesh Fuels: Empty descriptions auto-filled (startup migration)
- Auto-ledger: Description auto-generated when empty

## Desktop App (v24.0.6)
- Frontend rebuilt with REACT_APP_BACKEND_URL='' (all API calls relative)
- Debug info panel on login page (shows API URL, electron detection status)
- HTML injection in main.js sets window.ELECTRON_API_URL as backup
- All routes synced (verified via 33-point sync script)
- Balance Sheet PDF/Excel export endpoints added
- Auto-ledger empty description fix
- Clean index.html (no Emergent tracking/badges)
- setup-desktop.js updated to build with empty URL

## Pending / Backlog
- P1: User must test v24.0.6 desktop login and share debug info screenshot
- P2: Refactor duplicated PDF/Excel logic
- P2: Centralize stock calculation
- P2: Break down large App.js into smaller components
- P3: Remove debug info from login page once desktop login confirmed working
