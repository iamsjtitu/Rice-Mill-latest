# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with comprehensive entry tracking, payment management, and reporting. The application supports multiple backends (Python/FastAPI, Node.js local-server, Electron desktop-app) with a React frontend.

## Core Requirements
- Mill entry management with automated calculations
- Payment tracking (DC payments, cash book, diesel accounts, local party payments)
- Gunny bag stock management (new/old)
- Mill parts stock management
- Staff management
- Reporting and exports (Excel/PDF)
- Multi-backend parity (Python, Node.js, Electron)

## User Personas
- **Admin**: Full access to all features, can add/edit/delete entries, manage staff, settle payments
- **Staff**: Limited access, can view and add entries

## Architecture
```
/app
├── backend/          # Python/FastAPI (Primary)
│   ├── routes/       # Modular route files
│   └── server.py     # Main app
├── desktop-app/      # Electron backend
│   ├── routes/       # Modular route files
│   └── main.js       # Main process
├── local-server/     # Node.js backend
│   ├── routes/       # Modular route files
│   └── server.js     # Main app
└── frontend/
    └── src/
        ├── components/   # UI components
        └── App.jsx       # Main app
```

## What's Been Implemented

### P0 Features (Complete)
1. **Desktop App Stabilization** - Crash protection, error handling, server health monitoring
2. **Cash Book Automation** - Auto entries from mill entries (cash_paid, diesel_paid)
3. **Diesel Account System** - Full ledger with settlement, cash book integration, exports
4. **Local Party Payment System** (Feb 2026) - Complete ledger for local vendor payments
   - Auto-tracking from Mill Parts purchases (source_type: mill_part)
   - Auto-tracking from Old Market Gunny Bag purchases (source_type: gunny_bag)
   - Manual purchase entries (source_type: manual)
   - Full/partial settlement with auto Cash Book nikasi entry
   - Party-wise balance summary cards
   - Excel/PDF export
   - Implemented across all 3 backends

### P1 Features (Complete)
1. **G.Issued Logic Correction** - Fixed gunny bag deduction calculation
2. **Gunny Bag Edit** - Edit feature for gunny bag entries
3. **Mill Parts Edit** (Feb 2026) - Edit feature for mill parts stock entries with auto local party update
4. **Error Log Viewer** - Runtime error log display in desktop app Settings

### Key API Endpoints
- `/api/local-party/summary` - GET party-wise balances
- `/api/local-party/transactions` - GET filtered transactions
- `/api/local-party/manual` - POST manual purchase
- `/api/local-party/settle` - POST settlement (auto cash book)
- `/api/local-party/{id}` - DELETE transaction (cascade)
- `/api/local-party/excel` & `/pdf` - Export reports
- `/api/mill-parts-stock/{id}` - PUT edit stock entry
- Full CRUD for diesel pumps, diesel accounts, gunny bags, cash book, etc.

### DB Collections
entries, payments, cash_book, cash_transactions, ledgers, staff, gunny_bags, mill_parts_stock, mill_parts, diesel_pumps, diesel_payments, local_party_accounts

## Backlog
- **P2**: Refactor `desktop-app/main.js` into modular route files (large file)

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## 3rd Party Libraries
- **Python**: openpyxl, reportlab (for exports)
- **Node.js**: exceljs, pdfkit (for exports)
- **Desktop**: electron, electron-builder
