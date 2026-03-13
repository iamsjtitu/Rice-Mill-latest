# NAVKAR AGRO - Mill Entry System PRD

## Architecture
- Frontend: React (Vite) + Shadcn/UI + Tailwind
- Backend: FastAPI (Python), Database: MongoDB
- Desktop: Electron + Express + JSON DB

## Credentials: admin / admin123

---

## What's Been Implemented

### Session 2026-03-13 (v23.9.2)

**New Features:**
- **Balance Sheet** (Tally-style): Liabilities vs Assets with drill-down, auto-balanced via P&L
  - Capital Account, Sundry Creditors (Local Party, Diesel, Pvt Paddy, Truck, Agent, DC)
  - Cash & Bank, Stock-in-Hand (Paddy, FRK, Byproducts, Mill Parts), Sundry Debtors, Loans & Advances
  - PDF + Excel export
  - Sub-tabs under FY Summary (FY Summary / Balance Sheet)
- **FY Summary**: Added Ledger Parties section (11 sections total)
- **FY Carry Forward**: One-click carry forward of all closing balances to next FY
- **Login Error Message**: Inline error + toast on wrong password

**Bug Fixes:**
- Daily Report PDF: Landscape A4 for detail mode (20-column table)
- Daily Report Excel: Fixed KeyError total_kg -> total_qntl
- Local Party report: Cashbook payments merged without double-counting
- Local Party summary bar: Hidden when no party selected
- Toaster component added to login page wrapper
- Stock: agent_extra exclusion in desktop milling
- Truck payments: Move to Pvt Paddy filter in desktop

**Desktop Sync v23.9.2:**
- fy_summary.js: Complete rewrite with balance sheet, ledger parties, carry forward
- local_party.js: Cashbook payment linking with dedup
- milling.js: agent_extra exclusion
- payments.js: Move to Pvt Paddy filter
- Frontend rebuilt

---

## Key API Endpoints
- GET /api/fy-summary/balance-sheet (+ /pdf, /excel)
- GET /api/fy-summary
- POST /api/fy-summary/carry-forward
- GET /api/fy-summary/pdf
- GET /api/local-party/report/{party_name}
- GET /api/reports/daily/pdf

## Key Files
- backend/routes/fy_summary.py
- frontend/src/components/BalanceSheet.jsx
- frontend/src/components/FYSummaryDashboard.jsx
- frontend/src/components/LoginPage.jsx
- desktop-app/routes/fy_summary.js

## Pending / Backlog
- P2: Lokesh Fuels empty descriptions (data issue)
- P2: Refactor duplicated PDF/Excel logic
- P2: Break down large frontend components
- P2: Centralize stock calculation logic
