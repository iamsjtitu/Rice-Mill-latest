# NAVKAR AGRO - Mill Entry System PRD

## Architecture
- Frontend: React (Vite) + Shadcn/UI + Tailwind
- Backend: FastAPI (Python), Database: MongoDB
- Desktop: Electron + Express + JSON DB (v24.0.1)
- Credentials: admin / admin123, staff / staff123

---

## Implemented Features

### Authentication
- Login with username/password
- Password change feature
- Desktop startup: ALWAYS force-resets admin/staff passwords to default (admin123/staff123) - permanent login fix

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
- Login: Inline error + toast, force default credentials on startup
- Lokesh Fuels: Empty descriptions auto-filled (startup migration)
- Auto-ledger: Description auto-generated when empty

## Desktop App (v24.0.1)
- Frontend build synced with web app
- All routes synced (verified via 33-point sync script)
- Balance Sheet PDF/Excel export endpoints added
- Startup migration: force admin/staff default passwords
- Auto-ledger empty description fix

## Pending / Backlog
- P2: Refactor duplicated PDF/Excel logic
- P2: Centralize stock calculation
- P2: Break down large App.js into smaller components
- P3: Desktop build + release testing
