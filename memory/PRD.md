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

### v4.0.1-dev (Mar 10, 2026)
- **Ledger Running Balance** - Party Ledger page now shows a "Balance (₹)" column with running balance per transaction row, with Dr/Cr suffix
- **Cash Book Export Balance Column** - PDF and Excel exports now include "Balance" column with running balance computed as cumulative (jama - nikasi) sorted by date
- All 3 backends synced (Python + desktop Node.js + local Node.js)

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
- `/app/test_reports/iteration_35.json` - 11/11 PASS (Running Balance feature - Ledger + Cash Book exports)

## Key Files
- `/app/backend/routes/cashbook.py` - Cash Book API + PDF/Excel exports with running balance
- `/app/backend/routes/fy_summary.py` - FY Summary API + PDF export
- `/app/frontend/src/components/Ledgers.jsx` - Ledger page with running balance column
- `/app/frontend/src/components/CashBook.jsx` - Cash Book with running balance in UI
- `/app/frontend/src/components/FYSummaryDashboard.jsx` - FY Summary Frontend
- `/app/desktop-app/routes/cashbook.js` - Cash Book exports for desktop (with balance)
- `/app/local-server/routes/cashbook.js` - Cash Book exports for local server (with balance)

## Upcoming Tasks
- Version bump to 4.0.1
- Desktop App slow startup investigation (P2)
