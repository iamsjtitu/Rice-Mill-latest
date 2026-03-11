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

## Current Version: 4.1.1

## What's Implemented

### v4.1.1 (Mar 11, 2026)
- **CashBook.jsx Refactoring** - Split 902-line monolithic component into 5 sub-components:
  - `SummaryCards.jsx` (80 lines) - Balance overview cards
  - `CashBookFilters.jsx` (126 lines) - Filter section for tabs
  - `TransactionsTable.jsx` (148 lines) - Transactions data table
  - `PartySummaryTab.jsx` (178 lines) - Party summary view
  - `TransactionFormDialog.jsx` (167 lines) - Add/Edit dialog
  - Main CashBook.jsx reduced to ~195 lines (state + orchestration)
- **Telegram Bot Integration** - Automatic daily report PDF sending via Telegram
  - Backend: `/api/telegram/config` (GET/POST), `/api/telegram/test`, `/api/telegram/send-report`, `/api/telegram/logs`
  - Frontend: Settings page Telegram config section (Bot Token, Chat ID, Schedule Time, Auto Send)
  - Background scheduler checks every 30s and sends report at configured time
  - PDF generation with text summary + full detail report
- **Frontend Build** - `yarn build` completed for desktop app sync
- **Version Bump** - desktop-app version updated to 4.1.1
- **Testing** - iteration_40 (CashBook refactor 11/11), iteration_41 (Telegram 100% pass)

### v4.1.1-dev (Mar 11, 2026) - Previous Session
- **P0: Node.js Backend Sync** - Ported double-entry (Jama/Nikasi) accounting logic from Python to both Node.js backends
  - `desktop-app/main.js` addEntry/updateEntry: Auto-creates Truck Jama, Diesel Nikasi, Cash Nikasi, Diesel Jama
  - `local-server/server.js` addEntry/updateEntry: Same double-entry logic synced
  - `desktop-app/routes/payments.js`: Truck/Agent payments use party_name as category (not generic 'Truck Payment'/'Agent Payment')
  - `local-server/routes/payments.js`: Same payments logic synced
  - `desktop-app/routes/diesel.js` & `local-server/routes/diesel.js`: Diesel payment category=pump_name
  - Rate update endpoint updates Jama ledger entries with new rate
  - Agent payment creates JAMA commission entry + NIKASI payment entry
- **Cash Transactions in Daily Report** - Added Cash Transactions table to Daily Report page
  - Frontend: New "Cash Transactions / लेन-देन" section with summary boxes (Total Jama, Nikasi, Balance) and detail table (Date, Party Name, Type, Amount, Description, Payment Mode)
  - Python: `/api/reports/daily` now returns `cash_transactions` section with count, totals, and details
  - Python: PDF and Excel daily report exports include Cash Transactions section
  - Both Node.js backends: Same data structure and export sections synced
- **100% Backend Test Pass** - iteration_39: 10/10 tests passed for double-entry CRUD + exports

### v4.1.0-dev (Mar 10, 2026)
- **Cash Book / Ledgers Merge** - Unified "Cash Book / Ledgers" page replaces separate Cash Book and Ledgers tabs
  - Removed standalone "Ledgers" menu tab
  - Category renamed to "Select Party"
  - Party Type field added (Truck, Agent, Local Party, Diesel, Manual)
  - Party Type filter + Account filter now includes "Ledger" option
  - Filters always visible (no show/hide toggle)
- **Auto Ledger Entries** - Purchase/debit entries auto-create Jama entries in cash_transactions
  - Local Party purchases (manual, mill parts, gunny bags) -> account="ledger", txn_type="jama"
  - Settlements -> account="cash", txn_type="nikasi"
  - Truck/Agent/Diesel payments -> category=party_name, party_type set correctly
- **Migration Endpoint** - `/api/cash-book/migrate-ledger-entries` backfills old entries + fixes old-style categories
- **Outstanding Report moved to Reports tab** as subtab
- **PDF/Excel Exports** - Both include Party Type column, improved formatting
- **Party Summary Dashboard** - Tally-style Party Summary subtab in Cash Book showing all parties with Jama/Nikasi/Balance
- **White Theme UI Fix** - Global CSS overrides in index.css for consistent light mode
- **Agent Name Regex Fix** - Fixed "(Full" appearing in agent names
- All 3 backends synced (Python + desktop Node.js + local Node.js)

### Bug Fix (Mar 10, 2026)
- **New Transaction Dialog from Party Summary** - Fixed: Dialog was inside `activeView === "transactions"` conditional block, so it wouldn't render when on Party Summary tab. Moved Dialog outside conditional rendering.
- **Comprehensive White/Light Theme Fix** - Fixed light theme across entire application:
  - Set `data-theme` on `<html>` element so portal-rendered components (Dialogs, Popovers) also get themed
  - Added comprehensive CSS overrides for all bg-slate-*, text-*, border-* dark classes
  - Colored auto-calc fields (green, pink, blue, purple etc.) lighten properly in light mode
  - Dialog inputs, selects, and forms all render with white backgrounds
  - Header/navbar stays dark for contrast in light mode
  - Both dark and light themes work correctly without regression

### v4.0.1-dev (Mar 10, 2026)
- **Ledger Running Balance** - Party Ledger page shows "Balance" column with Dr/Cr suffix
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
- **FY Summary Dashboard** - All 10 modules
- **FY Summary PDF Export** - Tally-style balance sheet PDF
- **FY Opening Balance Carry-Forward** - ALL modules
- **Desktop App Startup Optimization** - Loading indicator, deferred backup
- **Bug Fixes**: Monthly Report API endpoint fix, Part-wise Summary search fix
- All 3 backends synced

## Pending Issues
- **P2**: Desktop App Slow Startup (loading indicator added, root cause not investigated)

## Test Reports
- `/app/test_reports/iteration_39.json` - 10/10 PASS (Double-Entry Accounting: Create/Update/Delete entries, Truck Payments, Export PDF/Excel with Cash Transactions)
- `/app/test_reports/iteration_38.json` - 26/26 PASS (Full Regression: Double-Entry Accounting, Light Theme, Table Layout, Party Filters)
- `/app/test_reports/iteration_37.json` - 26/26 PASS (Party Summary Dashboard)
- `/app/test_reports/iteration_36.json` - 19/19 PASS (Cash Book / Ledgers merge + Party Type)

## Key Files
- `/app/frontend/src/components/CashBook.jsx` - Unified Cash Book / Ledgers UI
- `/app/backend/routes/cashbook.py` - Cash Book API + migration + PDF/Excel
- `/app/backend/routes/entries.py` - Mill entries CRUD + double-entry accounting + exports with Cash Transactions section
- `/app/backend/routes/local_party.py` - Auto Jama entries for purchases
- `/app/backend/routes/payments.py` - Truck/Agent auto entries
- `/app/backend/routes/diesel.py` - Diesel auto entries
- `/app/backend/routes/mill_parts.py` - Auto Jama for mill parts
- `/app/backend/routes/dc_payments.py` - Auto Jama for gunny bags
- `/app/frontend/src/components/Reports.jsx` - Reports with Outstanding subtab
- `/app/frontend/src/App.js` - Menu with merged Cash Book / Ledgers tab
- `/app/desktop-app/main.js` - Desktop app database with double-entry sync
- `/app/desktop-app/routes/payments.js` - Desktop truck/agent payments with double-entry
- `/app/desktop-app/routes/exports.js` - Desktop exports with Cash Transactions section
- `/app/local-server/server.js` - Local server database with double-entry sync
- `/app/local-server/routes/payments.js` - Local server truck/agent payments with double-entry
- `/app/local-server/routes/exports.js` - Local server exports with Cash Transactions section

## Upcoming Tasks
- Version bump to 4.1.0
- Desktop App slow startup investigation (P2)
- CashBook.jsx refactoring (1000+ lines, split into smaller components)
