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
- Keyboard Navigation: ArrowUp/Down (move between rows), ArrowRight (expand/switch column), ArrowLeft (collapse/switch column), Enter/Space (expand/collapse)
- Print, PDF (landscape side-by-side), Excel (side-by-side cols) export
- Auto-balanced via P&L A/c (Surplus/Deficit)
- Truck, Agent/Mandi, DC Accounts detail tables
- No click-to-navigate (user preference - removed)

### FY Summary
- 11 sections: Cash/Bank, Paddy, Milling, FRK, Byproducts, Mill Parts, Diesel, Local Party, Staff, Private Trading, Ledger Parties
- Carry Forward button (all closing -> next FY opening)
- Sub-tabs: FY Summary + Balance Sheet

### Bug Fixes (Previous Sessions)
- Daily Report PDF: Landscape for detail mode
- Local Party: Cashbook payment linking, summary bar fix
- Login: Inline error + toast for wrong password
- Desktop: Users migration for existing data files
- Stock: agent_extra exclusion, truck payment filtering

---

## Key API Endpoints
- GET /api/fy-summary/balance-sheet (+ /pdf, /excel)
- GET /api/fy-summary
- POST /api/fy-summary/carry-forward
- GET /api/local-party/report/{party_name}
- GET /api/reports/daily/pdf

## Desktop App
- Version: v24.0.0
- Frontend synced with web app build

## Pending / Backlog
- P2: Lokesh Fuels empty descriptions (data issue)
- P2: Refactor duplicated PDF/Excel logic
- P2: Centralize stock calculation
- P2: Break down large App.js into smaller components
- P3: Desktop build + release testing
