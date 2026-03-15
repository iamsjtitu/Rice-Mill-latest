# Mill Entry System - PRD

## Original Problem Statement
Desktop app (Electron) synced with web app for rice mill data management. Web app is source of truth.

## Architecture
- **Web**: React frontend + FastAPI backend + MongoDB
- **Desktop**: Electron + Express.js + JSON file database

## Versions

### v25.1.32 (2026-03-15) - BALANCE SHEET FIX
- **Mill Parts Stock Value**: Balance sheet now shows Rs. VALUE (quantity * rate) instead of quantity
- **Double Counting Fix**: Excluded Local Party, Sale Book, Purchase Voucher, Staff, Diesel, Truck types from ledger section (already counted in their own sections)
- Fixed BOTH web backend (fy_summary.py) AND desktop backend (fy_summary.js)
- Balance sheet now correctly balances: Assets = Liabilities

### v25.1.31 (2026-03-15) - MIGRATION SCRIPT
- Auto-migration on startup for old entries missing jama/nikasi

### v25.1.30 (2026-03-15) - COMPREHENSIVE ACCOUNTING FIX
- 7 route files: every transaction auto-creates proper jama/nikasi entries

### v25.1.28-29 - Previous fixes
- toLocaleString crash fix, Local Party jama entries

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic
### P2
- Cross-platform logic sync improvements

## Credentials
- Username: admin, Password: admin123
