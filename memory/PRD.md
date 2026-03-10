# Mill Entry System - PRD

## Original Problem Statement
Comprehensive management tool for a rice mill named "Mill Entry System". Full-stack application with React frontend, Python/FastAPI backend (web preview), and two Node.js backends (desktop/local). User communicates in Hindi.

## Core Requirements
- **P0**: Full Data & Feature Parity between web preview and desktop app
- **P0**: Financial Year Balance Carry-Forward (Tally-style) for ALL modules
- **P1**: New Features & UX improvements
- **P2**: Stability & Performance

## Architecture
- Frontend: React (port 3000)
- Backend: FastAPI Python (port 8001)
- Desktop: Node.js Electron backend
- Local: Node.js local server
- Database: MongoDB

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Current Version: 4.0.0

## What's Implemented

### v4.1.0-dev (Mar 10, 2026)
- **Cash Book / Ledgers Merge** - Unified "Cash Book / Ledgers" page replaces separate Cash Book and Ledgers tabs
  - Removed standalone "Ledgers" menu tab
  - Category renamed to "Select Party / पार्टी"
  - Party Type field added (Truck, Agent, Local Party, Diesel, Manual)
  - Party Type filter + Account filter now includes "Ledger" option
  - Filters always visible (no show/hide toggle)
- **Auto Ledger Entries** - Purchase/debit entries auto-create Jama entries in cash_transactions
  - Local Party purchases (manual, mill parts, gunny bags) → account="ledger", txn_type="jama"
  - Settlements → account="cash", txn_type="nikasi" (already existed, updated category to party name)
  - Truck/Agent/Diesel payments → category=party_name, party_type set correctly
- **Migration Endpoint** - `/api/cash-book/migrate-ledger-entries` backfills old entries + fixes old-style categories
- **Outstanding Report moved to Reports tab** as subtab
- **PDF/Excel Exports** - Both include Party Type column, improved formatting
- All 3 backends synced (Python + desktop Node.js + local Node.js)

### v4.0.1-dev (Mar 10, 2026)
- **Ledger Running Balance** - Party Ledger page shows "Balance (₹)" column with Dr/Cr suffix
- **Cash Book Export Balance Column** - PDF/Excel exports include running balance column
- **Local Party Searchable Dropdown** - Search + dropdown combined for party selection
- All 3 backends synced

### v4.0.0 (Previous)
- **Cash Book Overhaul** - Running balance in UI, category filter fix, party balance in form, category autocomplete
- **FY Summary Dashboard** - All 10 modules overview with PDF export
- **FY Opening Balance Carry-Forward** - ALL modules carry forward from previous FY (Tally-style)
- **Bug Fixes**: Monthly Report, Part-wise Summary search, Light Theme, Print CSS
- All 3 backends synced (Python + desktop Node.js + local Node.js)

### v3.7.0 (Feb 10, 2026)
- **FY Summary Dashboard** - All 10 modules: Cash & Bank, Paddy Stock, FRK Stock, Milling Summary, Byproducts (bran/kunda/broken/kanki/husk), Mill Parts, Diesel, Local Party, Staff Advances, Private Trading
- **FY Summary PDF Export** - Tally-style balance sheet PDF with all 10 sections
- **FY Opening Balance Carry-Forward** - ALL modules carry forward from previous FY
- **Desktop App Startup Optimization** - Loading indicator, deferred backup
- **Bug Fixes**: Monthly Report API endpoint fix, Part-wise Summary search fix
- **Version Bump** - 3.6.2 → 3.7.0
- All 3 backends synced (Python + desktop Node.js + local Node.js)

### v3.6.x (Previous)
- PDF/Excel Report Parity (centered, DD-MM-YYYY format)
- Staff Advance Ledger with debit/credit history
- "All Parties"/"All Staff" options, Multi-Staff Settlement
- Performance Optimization (caching, compression, DB save debouncing)
- Print-Friendly Views

## Pending Issues
- **P2**: Desktop App Slow Startup (loading indicator added, root cause not investigated)
- **P2**: Intermittent Typing/Focus Issue in Desktop App (fix deployed, user verification pending)

## Test Reports
- `/app/test_reports/iteration_33.json` - 11/11 PASS (FY carry-forward, bug fixes)
- `/app/test_reports/iteration_34.json` - 16/16 PASS (FY Summary Dashboard)
- `/app/test_reports/iteration_35.json` - 11/11 PASS (Running Balance feature)
- `/app/test_reports/iteration_36.json` - 19/19 PASS (Cash Book / Ledgers merge + Party Type)

## Key Files
- `/app/backend/routes/cashbook.py` - Cash Book API + migration + PDF/Excel with Party Type
- `/app/backend/routes/local_party.py` - Auto Jama entries for purchases
- `/app/backend/routes/payments.py` - Truck/Agent auto entries with party_type
- `/app/backend/routes/diesel.py` - Diesel auto entries with party_type
- `/app/backend/routes/mill_parts.py` - Auto Jama for mill part local party debits
- `/app/backend/routes/dc_payments.py` - Auto Jama for gunny bag local party debits
- `/app/frontend/src/components/CashBook.jsx` - Unified Cash Book / Ledgers UI
- `/app/frontend/src/components/Reports.jsx` - Reports with Outstanding subtab
- `/app/frontend/src/App.js` - Menu with merged Cash Book / Ledgers tab

## Upcoming Tasks
- Version bump to 4.1.0
- Desktop App slow startup investigation (P2)
