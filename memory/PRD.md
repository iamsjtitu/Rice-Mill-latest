# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with comprehensive entry tracking, payment management, and reporting. Supports multiple backends (Python/FastAPI, Node.js local-server, Electron desktop-app) with a React frontend.

## Core Requirements
- Mill entry management with automated calculations
- Payment tracking (DC payments, cash book, diesel accounts, local party payments)
- Gunny bag stock management (new/old)
- Mill parts stock management
- Staff management
- Reporting and exports (Excel/PDF)
- Multi-backend parity (Python, Node.js, Electron)
- Excel import for bulk mill entries

## Architecture
```
/app
├── backend/          # Python/FastAPI (Primary)
│   ├── routes/       # local_party.py, entries.py, mill_parts.py, diesel.py, dc_payments.py
│   └── server.py
├── desktop-app/      # Electron backend
│   ├── routes/       # local_party.js, import_excel.js, mill_parts.js, safe_handler.js
│   └── main.js
├── local-server/     # Node.js backend
│   ├── routes/       # local_party.js, import_excel.js, mill_parts.js
│   └── server.js
└── frontend/
    └── src/
        ├── components/   # ExcelImport.jsx, payments/LocalPartyAccount.jsx
        └── App.js
```

## What's Been Implemented

### P0 Features (Complete)
1. **Desktop App Stabilization** - Crash protection, error handling, server health monitoring
2. **Cash Book Automation** - Auto entries from mill entries (cash_paid, diesel_paid)
3. **Diesel Account System** - Full ledger with settlement, cash book integration, exports
4. **Local Party Payment System** (Feb 2026)
   - Auto-tracking from Mill Parts, Old Market Gunny Bags, and manual purchases
   - Full/partial settlement with auto Cash Book nikasi entry
   - Party-wise balance summary cards
   - **Party-wise detailed report with running balance and Print option** (Mar 2026)
   - Excel/PDF export
   - All 3 backends in sync
5. **Excel Import for Mill Entries** (Mar 2026)
   - Upload Excel file, auto-detect columns (DATE, TRUCK, AGENT, MANDI, KG, BAG, etc.)
   - Preview entries before importing
   - Auto-creates Cash Book entries for cash_paid
   - Auto-creates Diesel Account entries for diesel_paid
   - Handles mixed date formats and cutting percent conversion
   - All 3 backends in sync

### P1 Features (Complete)
1. **G.Issued Logic Correction**
2. **Gunny Bag Edit**
3. **Mill Parts Edit** - Edit with auto local party update
4. **Error Log Viewer**

### Key API Endpoints
- `/api/local-party/summary` - Party-wise balances
- `/api/local-party/transactions` - Filtered transactions
- `/api/local-party/manual` - Manual purchase
- `/api/local-party/settle` - Settlement (auto cash book)
- `/api/local-party/report/{party_name}` - Detailed report with running balance
- `/api/local-party/{id}` - DELETE (cascade)
- `/api/local-party/excel` & `/pdf` - Export
- `/api/entries/import-excel` - Excel import (preview + import)
- `/api/mill-parts-stock/{id}` - PUT edit

### DB Collections
entries, mill_entries, payments, cash_book, cash_transactions, ledgers, staff, gunny_bags, mill_parts_stock, mill_parts, diesel_pumps, diesel_payments, diesel_accounts, local_party_accounts

## Backlog
- **P2**: Refactor `desktop-app/main.js` into modular route files

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## 3rd Party Libraries
- **Python**: openpyxl, reportlab, python-multipart
- **Node.js**: exceljs, pdfkit, multer
- **Desktop**: electron, electron-builder
