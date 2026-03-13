# NAVKAR AGRO - Mill Entry System PRD

## Architecture
- Frontend: React (Vite) + Shadcn/UI + Tailwind
- Backend: FastAPI (Python), Database: MongoDB
- Desktop: Electron + Express + JSON DB (v24.0.0)
- Credentials: admin / admin123, staff / staff123

---

## Implemented Features

### Balance Sheet (Tally-style)
- Liabilities vs Assets side-by-side layout
- Expand/collapse groups with chevron click
- Keyboard Navigation: ArrowUp/Down, ArrowRight (expand/switch col), ArrowLeft (collapse/switch col), Enter/Space (expand/collapse only)
- Print, PDF (landscape), Excel export
- Auto-balanced via P&L A/c (Surplus/Deficit)
- Truck, Agent/Mandi, DC Accounts detail tables

### FY Summary
- 11 sections + Carry Forward
- Sub-tabs: FY Summary + Balance Sheet

### Bug Fixes
- Daily Report PDF: Landscape for detail mode
- Local Party: Cashbook payment linking, summary bar fix
- Login: Inline error + toast for wrong password
- Lokesh Fuels: Empty descriptions auto-filled (startup migration)
- Auto-ledger: Description auto-generated when empty

## Desktop App (v24.0.0)
- Frontend build synced with web app
- cashbook.js: auto-ledger description fix applied
- fy_summary.js: Balance Sheet + Carry Forward synced
- local_party.js: Payment linking fix synced
- auth.js: Login error handling synced

## Pending / Backlog
- P2: Refactor duplicated PDF/Excel logic
- P2: Centralize stock calculation
- P2: Break down large App.js into smaller components
- P3: Desktop build + release testing
