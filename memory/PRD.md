# NAVKAR AGRO - Mill Entry System PRD

## Architecture
- Frontend: React (Vite) + Shadcn/UI + Tailwind
- Backend: FastAPI (Python), Database: MongoDB
- Desktop: Electron + Express + JSON DB (v24.0.0)
- Credentials: admin / admin123, staff / staff123

---

## Implemented Features

### Authentication
- Login with username/password
- Password change feature
- **Password Reset to Default** (permanent fix): Reset button on login page when error occurs. API: POST /api/auth/reset-default
- Desktop startup ensures default admin/staff users always exist

### Balance Sheet (Tally-style)
- Liabilities vs Assets side-by-side layout
- Expand/collapse groups with chevron click
- Keyboard Navigation: ArrowUp/Down, ArrowRight/Left, Enter/Space
- Print, PDF (landscape), Excel export

### FY Summary
- 11 sections + Carry Forward
- Sub-tabs: FY Summary + Balance Sheet

### Bug Fixes
- Daily Report PDF: Landscape for detail mode
- Local Party: Cashbook payment linking, summary bar fix
- Login: Inline error + toast + reset to default
- Lokesh Fuels: Empty descriptions auto-filled
- Auto-ledger: Description auto-generated when empty
- Desktop login: Startup migration ensures users exist + reset button

## Desktop App (v24.0.0)
- Frontend build synced
- All routes synced: cashbook, fy_summary, local_party, auth
- Password reset API added
- Startup migration enhanced

## Pending / Backlog
- P2: Refactor duplicated PDF/Excel logic
- P2: Centralize stock calculation
- P2: Break down large App.js into smaller components
- P3: Desktop build + release testing
