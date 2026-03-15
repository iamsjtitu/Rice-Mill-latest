# NAVKAR AGRO - Mill Entry System PRD

## Original Problem Statement
Web + Desktop (Electron) mill entry management system. Web app is source of truth. Desktop app must match all features.

## Tech Stack
- Frontend: React + Shadcn UI + Tailwind CSS
- Web Backend: FastAPI + MongoDB
- Desktop Backend: Express + JSON DB
- Desktop: Electron

## What's Been Implemented

### Session 2.7 (2026-03-15) - Full Balance Sheet Audit & Fix (Round 3)
**Three bugs FIXED:**

**Bug 1: Diesel Payment Not Reflecting in Balance Sheet**
- Root cause: FY summary only checked `diesel_accounts.payment` entries, missing `ledger nikasi` entries
- Fix: Uses `max(diesel_accounts_payment, ledger_nikasi)` - captures ALL payment sources
- Also matches by reference prefix `diesel_pay` for backward compatibility
- Result: Lokesh Fuels fully paid → closing_balance=0, removed from Sundry Creditors

**Bug 2: Cash Book "total_parties" Error**
- Root cause: Desktop party-summary returned flat array, frontend expected `{parties:[], summary:{total_parties,...}}`
- Fix: Desktop cashbook.js party-summary now returns correct format with summary stats
- Result: No more JS error on Cash Book page

**Bug 3: Stale Agent Jama Amount (Utkela 4,100 → 4,000)**
- Root cause: Old buggy `cutting_rate||5` created ledger entries with wrong amounts, never corrected
- Fix: Balance sheet auto-reconciles agent jama ledger entries against correct mandi_target calculation
- Both web (MongoDB) and desktop (JSON DB) reconciliation added
- Result: Utkela now shows correct 4,000 (not 4,100)

**Testing:** 11/11 backend + frontend tests passed
**Version:** 25.1.17

### Session 2.6 (2026-03-15) - Balance Sheet P0 Fixes (Round 2)
- Truck gross formula: `final_w/100` → `(qntl - bag/100)` to match entry creation
- Diesel orphan pump handling for missing diesel_pumps
- cutting_rate nullish check in entries.js

### Session 2.5 - Balance Sheet P0 Fixes (Round 1)
- cutting_rate=0 falsy bug fixed in fy_summary.js/py
- Truck Total/Paid display: Total=gross, Paid=deductions+external

### Earlier Sessions
- Desktop sync, 35+ endpoints, ErrorBoundary, Cash Book fixes
- Truck Lease Management (CRUD, PDF/Excel)
- Payment audit: diesel, local-party, truck-owner ledger nikasi fixes
- Stock Summary PDF/Excel, Dashboard PDF export

## Pending Issues
- Opening Balance "Save failed" on desktop - could not reproduce on web. May be user's old version.

## Prioritized Backlog
### P1
- Login debug panel removal
### P2
- PDF/Excel refactor (reduce duplicate code)
- App.js breakdown (2775+ lines)
- Stock calculation centralize

## Credentials
- Username: admin / Password: admin123
