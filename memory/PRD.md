# Mill Entry System - Product Requirements Document

## Original Problem Statement
Comprehensive Mill Entry System for managing paddy-to-rice conversion (Custom Milled Rice - CMR) for government supply, private trading, and complete financial tracking.

## Core Requirements & Status

### Phase 1: Paddy Entry + Milling Tracker - DONE
### Phase 2: DC Management - DONE
### Phase 3: Stock & Payment Tracking - DONE
### Phase 4: Reporting (CMR vs DC, Season P&L) - DONE
### Phase 5: Consolidated Ledgers - DONE
### Phase 6: Private Trading (Paddy Purchase + Rice Sale) - DONE
### Cash Book Module - DONE (with Type/Category filters, auto-linking with Private Trading payments)
### Global FY Year Setting - DONE
- Global FY selector in header (persists across sessions via /api/fy-settings)
- Season filter (Kharif/Rabi/All) alongside FY year
- Opening balance carry-forward: Previous FY closing -> New FY opening (auto-computed)
- Manual opening balance override supported via /api/cash-book/opening-balance
- Summary cards show Opening + In - Out = Balance

### Code Refactoring - DONE (2026-03-08)
- **Python backend**: 5249 lines -> ~70 line server.py + 12 route modules
  - routes/auth.py, entries.py, payments.py, exports.py, milling.py
  - routes/cashbook.py, dc_payments.py, reports.py, private_trading.py, ledgers.py
  - routes/mill_parts.py, daily_report.py
  - database.py (DB connection), models.py (all Pydantic models)
- **Frontend**: App.js 3920 -> ~2270 lines
  - Extracted Dashboard.jsx (~500 lines), Payments.jsx (~1318 lines)
  - Created MillPartsStock.jsx (~303 lines), Reports.jsx (~320 lines)
  - Created common/constants.js
- **Node.js backends**: Route extraction started (local-server/routes/, desktop-app/routes/)

### New Features - DONE (2026-03-08)
1. **P&L Summary Card on Dashboard** - DONE
   - Shows FY-wise Income, Expenses, Net Profit/Loss
   - Uses existing /api/reports/season-pnl endpoint
   - Breakdown: MSP, By-Product, Cash Jama / FRK, Gunny, Cash Nikasi, Truck/Agent Pay
   - data-testid: pl-summary-card, pl-income, pl-expenses, pl-net

2. **Mill Parts Stock Module** - DONE
   - New "Mill Parts" tab in navigation
   - 3 sub-tabs: Stock Summary, Transactions, Parts Master
   - CRUD for parts (name, category, unit, min stock alert)
   - Stock In/Used transactions with date, qty, rate, party, bill no
   - Stock summary with current stock levels and low stock alerts
   - Excel and PDF export
   - Backend: /api/mill-parts, /api/mill-parts-stock, /api/mill-parts/summary

3. **Daily Report** - DONE
   - New sub-tab under Reports (3rd tab after CMR vs DC and Season P&L)
   - Date picker to select any date
   - Sections: Paddy Entries, Milling, Private Trading, Cash Flow, Payments Summary, DC/By-products/FRK/Mill Parts
   - Excel and PDF export
   - Backend: /api/reports/daily, /api/reports/daily/pdf, /api/reports/daily/excel

## Architecture
```
/app
├── backend/
│   ├── server.py          # Slim orchestrator (~76 lines)
│   ├── database.py        # DB connection + shared state
│   ├── models.py          # All Pydantic models
│   └── routes/            # 12 route modules
│       ├── auth.py, entries.py, payments.py, exports.py
│       ├── milling.py, cashbook.py, dc_payments.py
│       ├── reports.py, private_trading.py, ledgers.py
│       ├── mill_parts.py, daily_report.py
├── local-server/
│   ├── server.js          # Needs refactoring + new features
│   └── routes/            # Started
├── desktop-app/
│   ├── main.js            # Needs refactoring + new features
│   └── routes/            # Started
└── frontend/src/
    ├── App.js             # Main (~2270 lines)
    └── components/
        ├── Dashboard.jsx, Payments.jsx, MillingTracker.jsx
        ├── CashBook.jsx, DCTracker.jsx, Reports.jsx
        ├── Ledgers.jsx, PrivateTrading.jsx, MillPartsStock.jsx
        ├── LoginPage.jsx
        └── common/constants.js
```

## Key API Endpoints
- `/api/fy-settings` (GET/PUT) - Global FY year setting
- `/api/cash-book/opening-balance` (GET/PUT) - Opening balance management
- `/api/cash-book/summary` (GET) - Summary with opening balance
- `/api/private-paddy` (CRUD), `/api/rice-sales` (CRUD)
- `/api/private-payments` (CRUD) - Auto-links to Cash Book
- `/api/reports/outstanding`, `/api/reports/party-ledger`
- `/api/reports/season-pnl` - P&L data (also used for Dashboard card)
- `/api/reports/daily` - Daily report with date param
- `/api/mill-parts` (CRUD), `/api/mill-parts-stock` (CRUD)
- `/api/mill-parts/summary` - Stock summary with Excel/PDF export
- All CRUD endpoints for entries, DC, MSP, gunny bags, milling, etc.

## Credentials
- Admin: `admin` / `admin123`
- Staff: `staff` / `staff123`

## Prioritized Backlog
- **P1:** Port new features (Mill Parts, Daily Report) to Node.js backends + complete refactoring
- **P2:** macOS Desktop Build
- **P2:** Complete Node.js route module refactoring for desktop-app and local-server
