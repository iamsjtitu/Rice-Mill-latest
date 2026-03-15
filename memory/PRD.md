# NAVKAR AGRO - Mill Entry System PRD

## Original Problem Statement
Web + Desktop (Electron) mill entry management system. Web app is source of truth. Desktop app must match all features.

## Tech Stack
- Frontend: React + Shadcn UI + Tailwind CSS
- Web Backend: FastAPI + MongoDB
- Desktop Backend: Express + JSON DB
- Desktop: Electron

## What's Been Implemented

### Session 2.8 (2026-03-15) - Opening Balance "Save Failed" Fix
**Root cause: Express route ordering conflict**
- `PUT /api/cash-book/:id` (line 206) was defined BEFORE `PUT /api/cash-book/opening-balance` (line 498)
- Express matched "opening-balance" as `:id` parameter → tried to edit nonexistent entry → 404/500 → "Save failed"
- Fix: Moved opening-balance PUT route BEFORE `:id` route
- Version: 25.1.18

### Session 2.7 - Full Balance Sheet Audit (Round 3)
- Diesel payment: uses max(diesel_accounts, ledger_nikasi) for paid
- Cash Book "total_parties" error: party-summary returns correct format
- Stale agent jama auto-reconciliation on balance sheet load
- Version: 25.1.17

### Session 2.6 - Balance Sheet Fixes (Round 2)
- Truck gross: `final_w/100` → `(qntl - bag/100)` matching entry creation
- Diesel orphan pump handling
- cutting_rate nullish check in entries.js
- Version: 25.1.16

### Session 2.5 - Balance Sheet Fixes (Round 1)
- cutting_rate=0 falsy bug in fy_summary
- Truck Total/Paid display correction
- Version: 25.1.15

### Earlier Sessions
- Desktop sync, 35+ endpoints
- Truck Lease Management
- Payment audit fixes
- Stock Summary exports

## Pending Issues
- None currently open

## Prioritized Backlog
### P1
- Login debug panel removal
### P2
- PDF/Excel refactor
- App.js breakdown (2775+ lines)
- Stock calculation centralize

## Credentials
- Username: admin / Password: admin123
