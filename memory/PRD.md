# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool with comprehensive entry tracking, payment management, and reporting. Supports 3 backends (Python/FastAPI, Node.js local-server, Electron desktop-app) with a React frontend.

## What's Been Implemented (All verified across 3 backends)

### Local Party Payment System
- Party dropdown select with balance display
- Date-to-date filter (From/To)
- Auto-tracking from Mill Parts purchases (source: mill_part)
- Auto-tracking from Old Market Gunny Bags (source: gunny_bag)
- Manual purchase entries (source: manual)
- Full/partial settlement with auto Cash Book nikasi entry
- Party-wise report with running balance + Print
- Delete with cascade (settlement → removes linked cash book)
- Excel/PDF export

### Excel Import for Mill Entries
- Upload Excel, auto-detect 15+ columns
- Preview before import
- Auto Cash Book entries for cash_paid
- Auto Diesel Account entries for diesel_paid
- Handles mixed date formats & cutting % conversion

### Mill Parts Stock
- Search/find by part name or party name
- Edit (PUT) with auto local party entry update
- Stock In/Used dialog shows current stock + after-stock preview
- Auto local party entry on POST/PUT/DELETE

### Cash Book
- New Transaction form shows current balance (Cash/Bank)
- After-balance preview with +/- amount indicator

### Auto Cutting %
- Mandi target cutting % auto-fills in entry form on mandi selection

### Other Complete Features
- Desktop App Stabilization (safeAsync/safeSync, crash protection)
- Cash Book Automation (auto entries from mill entries)
- Diesel Account System (full ledger, settlement, exports)
- Gunny Bag Edit, G.Issued Logic Correction
- Error Log Viewer (desktop app)

## Key API Endpoints
- `/api/local-party/summary` (date_from/date_to)
- `/api/local-party/transactions` (date_from/date_to)
- `/api/local-party/report/{party_name}` (date_from/date_to)
- `/api/local-party/settle`, `/manual`, `/{id}` DELETE
- `/api/local-party/excel`, `/pdf`
- `/api/entries/import-excel`
- `/api/mill-parts-stock/{id}` PUT

## DB Collections
mill_entries, cash_transactions, diesel_accounts, local_party_accounts, mill_parts_stock, mill_parts, gunny_bags, diesel_pumps, mandi_targets, ledgers, payments, staff

## Backlog
- **P2**: Refactor `desktop-app/main.js` into modular route files

## Credentials
- Admin: admin / admin123 | Staff: staff / staff123
