# Mill Entry System - PRD

## Original Problem Statement
Desktop app (Electron) synced with web app for rice mill data management. Web app is source of truth.

## Versions

### v25.1.36 (2026-03-15) - MONTHLY SUMMARY + PARTY LEDGER
- New "Monthly Summary" sub-tab: sardar-wise monthly breakdown with items, payments, advances
- Party Ledger integration: Hemali sardars appear individually (not as generic "Hemali Payment")
- PDF/Excel export for monthly summary
- Hemali entries excluded from "Cash Party" to avoid duplicates
- Desktop backend synced with monthly-summary endpoint
- Backend: 100% (14/14 tests), Frontend: 100%

### v25.1.35 (2026-03-15) - HEMALI PAYMENT WORKFLOW
- Payment workflow: Create (Unpaid) → Mark Paid → Undo → Re-mark Paid
- 4 action buttons: Make Payment, Undo Payment, Print Receipt, Delete
- Backend: 100% (13/13 tests), Frontend: 100%

### v25.1.34 (2026-03-15) - HEMALI PAYMENT FEATURE
- Full Hemali Payment system: Items Config, Payment creation, Advance management
- Cash Book + Ledger integration, PDF & Excel export, Date/Sardar filters
- Cross-platform sync verified

### v25.1.33 - STOCK SUMMARY FIX
### v25.1.32 - BALANCE SHEET FIX
### v25.1.31 - MIGRATION SCRIPT
### v25.1.30 - COMPREHENSIVE ACCOUNTING FIX

## Key DB Models

### Hemali
- **hemali_items**: {id, name, rate, unit, is_active, created_at}
- **hemali_payments**: {id, sardar_name, date, items, total, advance_before, advance_deducted, amount_payable, amount_paid, new_advance, status(unpaid/paid), kms_year, season}

## Key API Endpoints
- `/api/hemali/monthly-summary` - Sardar-wise monthly report
- `/api/hemali/monthly-summary/pdf` & `/excel` - Export
- `/api/hemali/payments/{id}/mark-paid` - Mark payment as paid
- `/api/hemali/payments/{id}/undo` - Undo payment
- `/api/hemali/payments/{id}/print` - Print receipt PDF
- `/api/reports/party-ledger?party_type=Hemali` - Hemali sardars in party ledger

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic
- Stock Summary PDF download verification pending
### P2
- All routes synced across platforms (verified)

## Credentials
- Username: admin, Password: admin123
