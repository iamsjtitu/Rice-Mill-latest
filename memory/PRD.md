# Mill Entry System - PRD

## Original Problem Statement
Desktop app (Electron) synced with web app for rice mill data management. Web app is source of truth.

## Versions

### v25.1.34 (2026-03-15) - HEMALI PAYMENT FEATURE
- New "Hemali Payment" feature: manage payments for Hemali Sardars (lead laborers)
- Items Config: CRUD for fixed-rate items (e.g., "Paddy Bag Unload - Rs.3/bag")
- Payment creation: select sardar, items + quantities, auto-calculate total
- Advance management: extra paid creates advance, auto-deducted in next payment
- Cash Book integration: nikasi entry on payment, removed on undo/delete
- Ledger integration: jama/nikasi entries for advance tracking
- Undo & Delete payments with proper financial rollback
- PDF & Excel export with filters
- Date and Sardar filters
- New "Hemali" tab in navigation
- Files: backend/routes/hemali.py, frontend/src/components/HemaliPayment.jsx

### v25.1.33 (2026-03-15) - STOCK SUMMARY FIX
- Header totals now show only Paddy (Raw Material): "Paddy In", "Paddy Used", "Paddy Stock"
- Removed Gunny Bags from stock summary (both web + desktop backend)
- Fixed in: StockSummary.jsx (frontend), salebook.js (desktop), purchase_vouchers.py (web)

### v25.1.32 - BALANCE SHEET FIX
- Mill Parts stock shows VALUE (Rs.) not quantity
- Double-counting fix: excluded already-tracked party types from ledger section

### v25.1.31 - MIGRATION SCRIPT
- Auto-migration on startup for old entries missing jama/nikasi

### v25.1.30 - COMPREHENSIVE ACCOUNTING FIX
- 7 route files: every transaction auto-creates proper jama/nikasi entries

## Key DB Models

### Hemali
- **hemali_items**: {id, name, rate, unit, is_active, created_at}
- **hemali_payments**: {id, sardar_name, date, items: [{item_name, rate, quantity, amount}], total, advance_before, advance_deducted, amount_payable, amount_paid, new_advance, status, kms_year, season}

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic
- Stock Summary PDF download verification pending
### P2
- Cross-platform logic sync improvements

## Credentials
- Username: admin, Password: admin123
