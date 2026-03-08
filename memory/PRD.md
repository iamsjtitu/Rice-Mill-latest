# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool with comprehensive entry tracking, payment management, and reporting. Supports 3 backends (Python/FastAPI, Node.js local-server, Electron desktop-app) with a React frontend.

## What's Been Implemented

### Core Features (All verified across 3 backends)
- Local Party Payment System (full ledger, settlement, reports, Excel/PDF export)
- Mill Entry Excel Import (with auto Cash Book + Diesel entries)
- Mill Parts Stock (Search, Edit, Stock Preview)
- Cash Book (Balance Preview, auto nikasi)
- Auto Cutting % from Mandi Target
- Party-wise Detailed Report with Print
- DC Tracker, Gunny Bags, Diesel Account

### Bug Fixes (March 2026)
- Fixed: Diesel Account showing wrong agent totals in summary cards
- Fixed: Cutting % auto-fill now works via typing (useEffect watcher) + dropdown
- Fixed: Excel Import in Node.js backends not reading formula cells (ExcelJS formula objects)
  - Root cause: ExcelJS returns formula cells as {formula: '...', result: value} objects
  - Fix: Added getCellRawValue(), safeString(), updated safeFloat/safeInt to handle formula objects

### CRITICAL BUILD PROCESS
Any frontend code change requires:
```
cd /app/frontend && REACT_APP_BACKEND_URL="" yarn build
cp -r /app/frontend/build /app/desktop-app/frontend-build
cp -r /app/frontend/build /app/local-server/public
```

## Key API Endpoints
- `/api/entries/import-excel` POST (Excel import with formula support)
- `/api/local-party/summary|transactions|report/{name}`
- `/api/local-party/settle|manual|{id}`
- `/api/mandi-targets` GET/POST/PUT/DELETE

## DB Collections
mill_entries, cash_transactions, diesel_accounts, local_party_accounts, mill_parts_stock, mill_parts, gunny_bags, diesel_pumps, mandi_targets, ledgers, payments, staff

## Backlog
- P2: Refactor desktop-app/main.js into modular route files

## Credentials
- Admin: admin / admin123 | Staff: staff / staff123
