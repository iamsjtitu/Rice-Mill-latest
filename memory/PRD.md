# Mill Entry System - PRD

## Original Problem Statement
Desktop app (Electron) synced with web app for rice mill data management. Web app is source of truth.

## Versions

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

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic
### P2
- Cross-platform logic sync improvements

## Credentials
- Username: admin, Password: admin123
