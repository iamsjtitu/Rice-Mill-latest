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

### Session 2.3 (2026-03-14) - NEW: Truck Lease Management
**Backend:** `/app/backend/routes/truck_lease.py` + `/app/desktop-app/routes/truck_lease.js`
- `GET /truck-leases` - list all leases
- `POST /truck-leases` - create lease (truck_no, owner_name, monthly_rent, start_date, end_date, advance_deposit)
- `PUT /truck-leases/{id}` - update lease
- `DELETE /truck-leases/{id}` - delete lease + related payments
- `GET /truck-leases/{id}/payments` - monthly breakdown (rent/paid/balance/status per month)
- `POST /truck-leases/{id}/pay` - make payment (auto Cash Book nikasi + auto-ledger)
- `GET /truck-leases/{id}/history` - payment history
- `GET /truck-leases/check/{truck_no}` - check if truck is leased
- `GET /truck-leases/summary` - summary for Balance Sheet
- Duplicate active lease prevention
- Cash Book DELETE handles truck_lease linked_payment_id

**Frontend:** `/app/frontend/src/components/LeasedTruck.jsx`
- "Leased Truck" tab under Payments
- Summary cards: Active Leases, Monthly Rent Total, Daily Rate (30 din base)
- Lease CRUD table with Edit/History/Delete
- Monthly payment grid (auto-generated from start_date to current)
- Pay dialog with Cash/Bank, date, notes
- Print receipt per month
- Payment history dialog

**Balance Sheet Integration:**
- Truck Lease balances under Sundry Creditors
- Excluded from general creditors (no duplicates)

**Tests:** iteration_90: 12/12 backend + all frontend (100%)
**Version:** 25.1.4

## Data Models
```
truck_leases: {id, truck_no, owner_name, monthly_rent, start_date, end_date, advance_deposit, status, kms_year, season}
truck_lease_payments: {id, lease_id, truck_no, owner_name, month, amount, account, bank_name, payment_date, notes, kms_year, season}
```

## Pending Issues
- P0: Blank page crash root cause (ErrorBoundary added, error reporting added)
- P1: Print preview Electron testing

## Prioritized Backlog
### P1
- Dashboard PDF export for desktop
- Leased truck auto-identification in mill entries
### P2
- Login debug panel removal
- PDF/Excel refactor, App.js breakdown, Stock calc centralize

## Credentials
- Username: admin / Password: admin123
