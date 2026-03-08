# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool with comprehensive entry tracking, payment management, and reporting. Supports 3 backends (Python/FastAPI, Node.js local-server, Electron desktop-app) with a React frontend.

## What's Been Implemented (All verified across 3 backends)

### Local Party Payment System
- Party dropdown select with balance, Date-to-date filter
- Auto-tracking from Mill Parts, Old Market Gunny Bags, manual purchases
- Full/partial settlement with auto Cash Book nikasi entry
- Party-wise report with running balance + Print
- Excel/PDF export

### Excel Import for Mill Entries
- Upload Excel, auto-detect 15+ columns, preview, import
- Auto Cash Book + Diesel Account entries

### Mill Parts Stock
- Search/find by part name or party name
- Edit (PUT) with auto local party update
- Stock In/Used dialog shows current stock + after-stock preview

### Cash Book
- New Transaction form shows current balance (Cash/Bank)
- After-balance preview with +/- amount indicator

### Auto Cutting % from Mandi Target
- Auto-fills cutting % when mandi name is typed or selected (via useEffect watcher)
- Mandi target names merged into suggestion dropdown

### Frontend Build Updated
- **IMPORTANT**: Frontend build must be rebuilt and copied to both `desktop-app/frontend-build/` and `local-server/public/` whenever frontend code changes
- Build: `cd /app/frontend && REACT_APP_BACKEND_URL="" yarn build`
- Copy: `cp -r /app/frontend/build /app/desktop-app/frontend-build && cp -r /app/frontend/build /app/local-server/public`

### Bug Fixes (March 2026)
- Fixed: Diesel Account showing wrong ₹50,000 (agent totals) in summary cards
- Fixed: Truck Owner tab also showing agent totals instead of own data
- Fixed: Summary cards now only show for Truck Payments and Agent Payments tabs
- Fixed: Cutting % auto-fill now works via typing (not just dropdown selection)
- Fixed: Cutting % null-check improved (supports 0% cutting correctly)

### Other Complete Features
- Desktop App Stabilization, Cash Book Automation, Diesel Account System
- Gunny Bag Edit, G.Issued Logic Correction, Error Log Viewer

## Key API Endpoints
- `/api/local-party/summary|transactions|report/{name}` (date_from/date_to)
- `/api/local-party/settle|manual|{id}` DELETE
- `/api/local-party/excel|pdf`
- `/api/entries/import-excel`
- `/api/mill-parts-stock/{id}` PUT
- `/api/mandi-targets` GET/POST/PUT/DELETE

## DB: test_database
Collections: mill_entries, cash_transactions, diesel_accounts, local_party_accounts, mill_parts_stock, mill_parts, gunny_bags, diesel_pumps, mandi_targets, ledgers, payments, staff, etc.

## Backlog
- P2: Refactor `desktop-app/main.js` into modular route files

## Credentials
- Admin: admin / admin123 | Staff: staff / staff123
