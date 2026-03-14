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

### Session 2 - Bug Fixes
- ErrorBoundary, Balance Sheet fix, Cash Book DELETE payment revert
- Desktop cashbook case-insensitive agent detection
- Enhanced cleanup script, PrintButton Electron compatibility

### Session 2.1 - Agent Name + Error Reporting
- Agent name from entries, Cash Book agent suggestions
- Desktop error reporting via IPC

### Session 2.2 - Comprehensive Audit
- Route parity 98%, Balance Sheet PDF/Excel agent fix
- Agent party type in desktop Party Ledger

### Session 2.3 - Truck Lease Management
- Full CRUD APIs (web + desktop), LeasedTruck.jsx UI
- Monthly payment grid, Balance Sheet integration
- Auto-detect leased trucks in entries, "Leased" badge
- Search/filter + PDF/Excel export for leased trucks

### Session 2.4 (2026-03-14) - UI Fixes + Export Fixes
- **Cash Book form field reorder:** Party/Category moved after Account, before Type/Amount
- **Dashboard PDF Export for Desktop:** Added `/api/export/dashboard-pdf` endpoint
- **Stock Summary PDF fix:** Desktop was returning HTML → Rewrote with pdfkit (colorful category headers, styled tables)
- **Stock Summary Excel fix:** Desktop was basic text → Rewrote with ExcelJS (all items, colored headers, styled columns, matching page design)

**Tests:** iteration_91: Backend 8/8 + Frontend 100% pass
**Version:** 25.1.7

## Data Models
```
truck_leases: {id, truck_no, owner_name, monthly_rent, start_date, end_date, advance_deposit, status, kms_year, season}
truck_lease_payments: {id, lease_id, truck_no, owner_name, month, amount, account, bank_name, payment_date, notes, kms_year, season}
```

## Pending Issues
- None currently open

## Prioritized Backlog
### P1
- Login debug panel removal
### P2
- PDF/Excel refactor (reduce duplicate code)
- App.js breakdown (file too large at 2775 lines)
- Stock calculation centralize

## Credentials
- Username: admin / Password: admin123
