# NAVKAR AGRO - Mill Entry System PRD

## Original Problem Statement
Web + Desktop (Electron) mill entry management system. Web app is source of truth. Desktop app must match all features.

## Tech Stack
- Frontend: React + Shadcn UI + Tailwind CSS
- Web Backend: FastAPI + MongoDB
- Desktop Backend: Express + JSON DB
- Desktop: Electron

## What's Been Implemented

### Session 2.5 (2026-02-22) - Balance Sheet P0 Bug Fixes (Round 1)
- cutting_rate=0 falsy bug fixed in fy_summary.js/py (3+1 places)
- Truck Total/Paid display fixed (Total=gross, Paid=deductions+external)
- Version: 25.1.15

### Session 2.6 (2026-03-15) - Balance Sheet P0 Bug Fixes (Round 2)
**Three critical root-cause bugs FIXED:**

**Bug 1: Truck Gross Formula Mismatch**
- Root cause: Balance sheet used `final_w/100` but entry creation uses `(qntl - bag/100)` → different values
- Fix: Changed fy_summary.js (3 places) and fy_summary.py to use `(qntl - bag/100) * rate`
- Result: Truck OD15A1234 balance=0 (was -1,121.28)

**Bug 2: Diesel Not Showing in Balance Sheet**
- Root cause: Only iterated over diesel_pumps collection. When pumps empty but diesel_accounts has entries with default pump_id, they were skipped
- Fix: Added orphan pump handling in both fy_summary.js and fy_summary.py
- Result: Diesel Lokesh Fuels ₹4,400 now shows in Sundry Creditors

**Bug 3: cutting_rate=0 Bug in entries.js**
- Root cause: Same `||` falsy bug existed in entries.js (lines 86, 106) where ledger jama entries were created
- Fix: Changed to nullish check `cutting_rate != null ? cutting_rate : 5`
- Result: New entries/targets will calculate correctly

**Testing:** 11/11 backend + frontend tests passed
**Version:** 25.1.16

### Earlier Sessions (Summary)
- Desktop sync, 35+ endpoints, ErrorBoundary, Cash Book fixes
- Truck Lease Management (CRUD, PDF/Excel)
- Payment audit: Fixed diesel, local-party, truck-owner ledger nikasi
- Stock Summary PDF/Excel rewrite, Dashboard PDF export

## Pending Issues
- Opening Balance "Save failed" on desktop - could not reproduce (works on web). May be user's old version.

## Prioritized Backlog
### P1
- Login debug panel removal
### P2
- PDF/Excel refactor (reduce duplicate code)
- App.js breakdown (2775+ lines)
- Stock calculation centralize
- Refactor truck/agent payment calculation into shared utility

## Credentials
- Username: admin / Password: admin123
