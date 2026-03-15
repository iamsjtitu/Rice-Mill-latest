# NAVKAR AGRO - Mill Entry System PRD

## Original Problem Statement
Web + Desktop (Electron) mill entry management system. Web app is source of truth. Desktop app must match all features.

## Tech Stack
- Frontend: React + Shadcn UI + Tailwind CSS
- Web Backend: FastAPI + MongoDB
- Desktop Backend: Express + JSON DB
- Desktop: Electron

## What's Been Implemented

### Session 1 - Desktop Sync
- Desktop login fix, 35+ endpoints synced, rebuild workflow

### Session 2 - Bug Fixes & Features
- ErrorBoundary, Balance Sheet fix, Cash Book DELETE payment revert
- Agent name from entries, Cash Book agent suggestions
- Desktop error reporting via IPC, Comprehensive audit

### Session 2.3 - Truck Lease Management
- Full CRUD APIs (web + desktop), LeasedTruck.jsx UI
- Monthly payment grid, Balance Sheet integration
- Auto-detect leased trucks, "Leased" badge, Search/filter + PDF/Excel export

### Session 2.4 (2026-03-14) - Comprehensive Payment Audit + Fixes
**Critical Bug Pattern Found:** Multiple payment endpoints created `cash nikasi` but NOT `ledger nikasi`. Summary/consolidation views read from ledger → payments showed as Paid: ₹0

**Fixed Endpoints:**
- `diesel-accounts/pay` → Added ledger nikasi (diesel.js)
- `local-party/settle` → Fixed category (party name) + added ledger nikasi (local_party.js)
- `truck-owner/:truckNo/pay` → Added ledger nikasi (payments.js)
- `truck-owner/:truckNo/mark-paid` → Added ledger nikasi (payments.js)
- `truck-owner/:truckNo/undo-paid` → Added ledger cleanup (payments.js)
- Diesel Excel/PDF exports → Aligned paid calculation to use ledger

**Already Correct:**
- truck-payments/:id/pay, mark-paid
- agent-payments/:mandi/pay, mark-paid
- truck-leases/:id/pay
- private-payments, voucher-payment

**Other Fixes:**
- Cash Book form: Type change no longer resets Party/Category field
- Stock Summary PDF: Proper pdfkit PDF (was HTML)
- Stock Summary Excel: Full colorful export with all items
- Dashboard PDF export for desktop
- main.js: Added 23 missing default collections

### Session 2.5 (2026-02-22) - Balance Sheet P0 Bug Fixes
**Two critical recurring Balance Sheet bugs FIXED:**

**Bug 1: Mandi Target Calculation Error (cutting_rate=0 treated as falsy)**
- Root cause: `cutting_rate || 5` in JS and `cutting_rate or 5` in Python treated 0 as falsy, defaulting to 5
- Fix: Changed to nullish check `cutting_rate != null ? cutting_rate : 5` (JS) and `cr if cr is not None else 5` (Python)
- Files: fy_summary.js (3 places: balance-sheet, PDF, Excel), fy_summary.py (1 place)
- Verified: Gokul mandi total=₹4,000 (was incorrectly ₹4,100)

**Bug 2: Truck Payments Not Reflected in Balance Sheet**
- Root cause: Total was `gross - deductions`, Paid was only external payments. Deductions (diesel, cash, deposit) not counted as Paid.
- Fix: Total = gross (full earnings), Paid = deductions + external payments, Balance = Total - Paid
- Files: fy_summary.js (balance-sheet + PDF routes), fy_summary.py (balance-sheet route)
- Verified: OD15A1234 total=₹14,782.72, paid=₹15,904, balance=-₹1,121.28

**Testing:** 100% pass rate (8/8 backend tests, frontend verified)
**Version:** 25.1.11

## Pending Issues
- None currently open

## Prioritized Backlog
### P1
- Login debug panel removal
### P2
- PDF/Excel refactor (reduce duplicate code across balance-sheet, PDF, Excel routes)
- App.js breakdown (2775+ lines)
- Stock calculation centralize

## Credentials
- Username: admin / Password: admin123
