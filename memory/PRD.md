# NAVKAR AGRO - Mill Entry System PRD

## Architecture
- Frontend: React (Vite) + Shadcn/UI + Tailwind
- Backend: FastAPI (Python), Database: MongoDB
- Desktop: Electron + Express + JSON DB

## Credentials: admin / admin123

---

## What's Been Implemented

### Session 2026-03-12 (v2.23.9)

**Bug Fixes:**
- Daily Report PDF: Detail mode uses landscape A4 with proper mm-to-point width conversion (20-column paddy entries table)
- Daily Report Excel: Fixed KeyError total_kg -> total_qntl with updated headers
- Local Party report: Cashbook payments merged without double-counting (3-layer dedup: linked_id, reference, ref_id)
- Local Party summary bar: Now hidden when no party selected; shows only selected party's data
- Stock: agent_extra entries excluded from paddy stock calculation in desktop
- Truck Payments: "Move to Paddy Purchase" entries filtered out in desktop

**New Features:**
- FY Summary: Added Ledger Parties section (11 total sections now)
- FY Carry Forward API: POST /api/fy-summary/carry-forward saves all closing balances as next FY opening balances
- FY Summary uses saved opening balances (recursive FY chain supported)
- FY Summary PDF: Includes all 11 sections with Ledger Parties
- FY Summary Dashboard: Carry Forward button, Ledger Parties card, all entity sections
- CashBook source type badge in Local Party frontend

**Desktop Sync v2.23.9:**
- fy_summary.js: Complete rewrite with ledger parties, carry forward, saved OB
- local_party.js: Cashbook payment linking with dedup
- milling.js: agent_extra exclusion fix
- payments.js: Move to Pvt Paddy filter
- Frontend rebuild and copy to desktop-app/frontend-build

### Previous Session Fixes
- Ledger Integration: Private paddy, staff advances, truck payments
- Payment Reconciliation: CashBook fuzzy matching for party names
- Stock Calculation: QNTL - BAG/100, agent_extra double-count prevention
- Daily Report: KG->QNTL conversion, Sale/Purchase Vouchers sections
- Local Party summary: Selected party filtering

---

## Key Technical Concepts
- Ledger (cashbook collection) is single source of truth for all transactions
- FY opening balances stored in `opening_balances` collection, supports recursive chain
- Carry Forward snapshots all closing balances into next FY's opening
- 11 FY Summary sections: cash_bank, paddy_stock, milling, frk_stock, byproducts, mill_parts, diesel, local_party, staff_advances, private_trading, ledger_parties

---

## Pending / Backlog

### P2: Lokesh Fuels Empty Descriptions
- Data issue, not code bug. Manual entries by user.

### P2: Refactoring
- Duplicated PDF/Excel logic across routers
- Large frontend components (PurchaseBook, SaleBook)
- Centralize stock calculation logic

### P3: Desktop App
- Desktop sync is complete for v2.23.9
- Future: Test desktop build end-to-end
- Future: Auto-update mechanism verification

---

## Key API Endpoints
- GET /api/fy-summary
- POST /api/fy-summary/carry-forward
- GET /api/fy-summary/pdf
- GET /api/local-party/report/{party_name}
- GET /api/local-party/summary
- GET /api/reports/daily/pdf

## Key Files
- backend/routes/fy_summary.py
- backend/routes/local_party.py
- backend/routes/daily_report.py
- frontend/src/components/FYSummaryDashboard.jsx
- frontend/src/components/payments/LocalPartyAccount.jsx
- desktop-app/routes/fy_summary.js
- desktop-app/routes/local_party.js
- scripts/sync_check.py
