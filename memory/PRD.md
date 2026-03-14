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
- ErrorBoundary, Balance Sheet fix (agent calc from entries+ledger)
- Cash Book DELETE: truck/agent/lease payment revert
- Desktop cashbook: case-insensitive agent detection
- Enhanced cleanup script, PrintButton Electron compatibility

### Session 2.1 - Agent Name + Error Reporting
- Agent name from entries (not mandi_targets)
- Cash Book agent suggestions: /api/cash-book/agent-names
- Desktop error reporting: preload.js + IPC + Help menu

### Session 2.2 - Comprehensive Audit
- Route parity: 98%, Balance Sheet PDF/Excel agent fix
- Agent party type in desktop Party Ledger
- Full audit report: /app/memory/AUDIT_REPORT.md

### Session 2.3 (2026-03-14) - Truck Lease Management
**Backend:** `/app/backend/routes/truck_lease.py` + `/app/desktop-app/routes/truck_lease.js`
- `GET /truck-leases` - list all leases
- `POST /truck-leases` - create lease
- `PUT /truck-leases/{id}` - update lease
- `DELETE /truck-leases/{id}` - delete lease + related payments
- `GET /truck-leases/{id}/payments` - monthly breakdown
- `POST /truck-leases/{id}/pay` - make payment (auto Cash Book + ledger)
- `GET /truck-leases/{id}/history` - payment history
- `GET /truck-leases/check/{truck_no}` - check if truck is leased
- `GET /truck-leases/summary` - summary for Balance Sheet
- `GET /truck-leases/export/pdf` - PDF export with filters
- `GET /truck-leases/export/excel` - Excel export with filters

**Frontend:** `/app/frontend/src/components/LeasedTruck.jsx`
- "Leased Truck" tab under Payments
- Summary cards: Active Leases, Monthly Rent Total, Daily Rate
- Lease CRUD table with Edit/History/Delete
- Monthly payment grid with Pay dialog
- Search/filter by truck_no and owner_name
- PDF and Excel export buttons
- Print receipt per month

**Balance Sheet Integration:**
- Truck Lease balances under Sundry Creditors

### Session 2.4 (2026-03-14) - Leased Truck Enhancements + Dashboard PDF
- **Auto-detect leased trucks:** Entry form shows "Leased Truck" indicator when entering a leased truck number
- **"Leased" badge in entries table:** Entry table shows violet "Leased" badge next to leased truck numbers
- **Dashboard PDF Export for Desktop:** Added `/api/export/dashboard-pdf` to desktop-app exports with Stock Overview and Mandi Targets sections
- **Frontend rebuild and desktop sync:** Version bumped to 25.1.5

**Tests:** iteration_91: Backend 8/8 + Frontend all UI (100%)
**Version:** 25.1.5

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
