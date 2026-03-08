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
### Global FY Year Setting - DONE (2026-03-08)
- Global FY selector in header (persists across sessions via /api/fy-settings)
- Season filter (Kharif/Rabi/All) alongside FY year
- Opening balance carry-forward: Previous FY closing → New FY opening (auto-computed)
- Manual opening balance override supported via /api/cash-book/opening-balance
- Summary cards show Opening + In - Out = Balance

### Code Refactoring - DONE (2026-03-08)
- **Python backend**: 5249 lines → ~70 line server.py + 10 route modules
  - routes/auth.py, entries.py, payments.py, exports.py, milling.py
  - routes/cashbook.py, dc_payments.py, reports.py, private_trading.py, ledgers.py
  - database.py (DB connection), models.py (all Pydantic models)
- **Frontend**: App.js 3920 → 2230 lines
  - Extracted Dashboard.jsx (~400 lines), Payments.jsx (~1318 lines)
  - Created common/constants.js
- **Node.js backends**: Route extraction started (local-server/routes/, desktop-app/routes/)

## Architecture
```
/app
├── backend/
│   ├── server.py          # Slim orchestrator (~70 lines)
│   ├── database.py        # DB connection + shared state
│   ├── models.py          # All Pydantic models
│   └── routes/            # 10 route modules
│       ├── auth.py, entries.py, payments.py, exports.py
│       ├── milling.py, cashbook.py, dc_payments.py
│       ├── reports.py, private_trading.py, ledgers.py
├── local-server/
│   ├── server.js          # Slim (~600 lines)
│   └── routes/            # 10 route modules
├── desktop-app/
│   ├── main.js
│   └── routes/
└── frontend/src/
    ├── App.js             # Slim main (~2230 lines)
    └── components/
        ├── Dashboard.jsx, Payments.jsx, MillingTracker.js
        ├── CashBook.jsx, DCTracker.jsx, Reports.jsx
        ├── Ledgers.jsx, PrivateTrading.jsx
        └── common/constants.js
```

## Key API Endpoints
- `/api/fy-settings` (GET/PUT) - Global FY year setting
- `/api/cash-book/opening-balance` (GET/PUT) - Opening balance management
- `/api/cash-book/summary` (GET) - Summary with opening balance
- `/api/private-paddy` (CRUD), `/api/rice-sales` (CRUD)
- `/api/private-payments` (CRUD) - Auto-links to Cash Book
- `/api/reports/outstanding`, `/api/reports/party-ledger`
- All CRUD endpoints for entries, DC, MSP, gunny bags, milling, etc.

## Credentials
- Admin: `admin` / `admin123`
- Staff: `staff` / `staff123`

## Prioritized Backlog
- **P2:** macOS Desktop Build
- **P2:** Complete Node.js route module refactoring for desktop-app
