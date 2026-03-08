# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with comprehensive entry tracking, payment management, and reporting. Supports multiple backends (Python/FastAPI, Node.js local-server, Electron desktop-app) with a React frontend.

## What's Been Implemented

### P0 Features (Complete)
1. **Desktop App Stabilization** - Crash protection, error handling
2. **Cash Book Automation** - Auto entries from mill entries
3. **Diesel Account System** - Full ledger with settlement, exports
4. **Local Party Payment System**
   - Auto-tracking from Mill Parts, Old Market Gunny Bags, manual purchases
   - Full/partial settlement with auto Cash Book nikasi entry
   - Party dropdown select with statement view
   - Date-to-date filter (From/To)
   - Party-wise report with running balance + Print
   - Excel/PDF export
5. **Excel Import for Mill Entries**
   - Upload Excel, auto-detect columns, preview, import
   - Auto Cash Book + Diesel Account entries
6. **Mill Parts Stock** - Search/find by part name or party name
7. **Mill Parts Edit** - Edit with auto local party update
8. **Auto Cutting %** - Mandi target cutting % auto-fills in entry form

### Key API Endpoints
- `/api/local-party/summary` (with date_from/date_to filter)
- `/api/local-party/transactions` (with date_from/date_to filter)
- `/api/local-party/report/{party_name}` (with date_from/date_to filter)
- `/api/local-party/settle`, `/manual`, `/{id}` DELETE
- `/api/local-party/excel`, `/pdf`
- `/api/entries/import-excel` (preview + import)
- `/api/mill-parts-stock/{id}` PUT

### DB Collections
mill_entries, payments, cash_book, cash_transactions, ledgers, staff, gunny_bags, mill_parts_stock, mill_parts, diesel_pumps, diesel_payments, diesel_accounts, local_party_accounts, mandi_targets

## Backlog
- **P2**: Refactor `desktop-app/main.js` into modular route files

## Credentials
- Admin: admin / admin123  |  Staff: staff / staff123

## 3rd Party Libraries
- **Python**: openpyxl, reportlab, python-multipart
- **Node.js**: exceljs, pdfkit, multer
- **Desktop**: electron, electron-builder
