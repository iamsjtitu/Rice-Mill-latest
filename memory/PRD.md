# Mill Entry System - PRD

## Original Problem Statement
Desktop app (Electron) synced with web app for rice mill data management. Web app is source of truth.

## Versions

### v25.1.35 (2026-03-15) - HEMALI PAYMENT WORKFLOW
- Payment workflow: Create (Unpaid) → Mark Paid → Undo → Re-mark Paid
- 4 action buttons: Make Payment, Undo Payment, Print Receipt, Delete
- Mark Paid creates cash book + ledger entries
- Undo removes cash book + ledger entries, reverts to unpaid
- Print generates individual A5 PDF receipt
- Desktop backend (hemali.js) also updated with same workflow
- Backend: 100% (13/13 tests), Frontend: 100%

### v25.1.34 (2026-03-15) - HEMALI PAYMENT FEATURE
- New "Hemali Payment" feature: manage payments for Hemali Sardars (lead laborers)
- Items Config: CRUD for fixed-rate items (e.g., "Paddy Bag Unload - Rs.3/bag")
- Payment creation: select sardar, items + quantities, auto-calculate total
- Advance management: extra paid creates advance, auto-deducted in next payment
- Cash Book + Ledger integration
- PDF & Excel export with filters
- Cross-platform sync verified: all routes in perfect parity

### v25.1.33 - STOCK SUMMARY FIX
- Header totals show only Paddy; Gunny Bags excluded

### v25.1.32 - BALANCE SHEET FIX  
- Stock VALUE not quantity; double-counting fix

### v25.1.31 - MIGRATION SCRIPT
- Auto-migration on startup for old entries missing jama/nikasi

### v25.1.30 - COMPREHENSIVE ACCOUNTING FIX
- 7 route files: every transaction auto-creates proper jama/nikasi entries

## Key DB Models

### Hemali
- **hemali_items**: {id, name, rate, unit, is_active, created_at}
- **hemali_payments**: {id, sardar_name, date, items: [{item_name, rate, quantity, amount}], total, advance_before, advance_deducted, amount_payable, amount_paid, new_advance, status(unpaid/paid), kms_year, season}

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic
- Stock Summary PDF download verification pending
### P2
- Cross-platform logic sync improvements (DONE - verified all routes in parity)

## Credentials
- Username: admin, Password: admin123
