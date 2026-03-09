# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool. 3 backends (Python/FastAPI, Node.js local-server, Electron desktop-app), React frontend.

## Implemented Features

### Core
- Mill entries with 20+ columns (Truck, Agent, Mandi, QNTL, BAG, etc.)
- Cash Book with edit, sync to Party Ledger
- Diesel/Pump Account with filters (date, type, truck)
- Staff Management (attendance, advance, salary calculation, settlement)
- Mill Parts Stock (purchase, usage, party ledger auto-entry, settle)
- Local Party Account with settle feature (auto cash book nikasi)
- Reports: Daily, Outstanding, CMR vs DC, Season P&L
- PDF & Excel exports for all reports

### Auto-Update (v3.0.0+)
- GitHub Actions workflow for auto build & publish
- electron-updater integration
- Silent error handling when no release available
- Version auto-read from package.json in About dialog

### v3.1.0 Fixes
- Attendance Save Bug (desktop) - `items` → `records` mismatch
- Daily Report Blank Page (desktop) - missing API sections added
- Daily Report PDF redesign with colored summary boxes, grid borders
- Mill Parts PDF - added Party, Rate, Bill No columns

### v3.2.0 - Mill Parts Export & Filters
- Date filter (From/To) on Transactions tab
- Part filter dropdown on Transactions tab
- Type filter (IN/USED) on Transactions tab
- Transaction PDF export with colored IN/USED rows
- Transaction Excel export with professional styling
- Summary PDF/Excel redesign with professional styling
- All 3 backends updated

## Build Process
```
cd /app/frontend && REACT_APP_BACKEND_URL="" yarn build
cp -r /app/frontend/build /app/desktop-app/frontend-build
cp -r /app/frontend/build /app/local-server/public
```

## Desktop Build & Release
GitHub: Save to GitHub → Create Release (tag vX.Y.Z) → GitHub Actions auto builds

## Credentials
- Admin: admin / admin123 | Staff: staff / staff123

## Key Collections
- mill_entries, cash_book/cash_transactions, diesel_payments/diesel_accounts
- local_party_entries/local_party_accounts, mandi_targets, gunny_bags
- mill_parts_stock, staff, staff_attendance, staff_advance, staff_payments

## Backlog
- P2: Refactor desktop-app/main.js modular routes
- P2: UI improvements (dashboard, dark mode, charts)
