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

## Current Version: 3.7.0

## What's Implemented

### v3.7.0 (Feb 10, 2026)
- **FY Summary Dashboard** - New comprehensive dashboard showing opening vs closing balances for ALL modules:
  - Cash & Bank (with Total row)
  - Paddy Stock (Qtl)
  - FRK Stock (Qtl)
  - Milling Summary (entries, paddy milled, rice produced, FRK used, CMR delivered, avg outturn)
  - Byproduct Stock (bran, kunda, broken, kanki, husk - produced/sold/revenue)
  - Mill Parts Stock (per part with unit)
  - Diesel Accounts (per pump)
  - Local Party Accounts (aggregate)
  - Staff Advances (per staff)
  - Private Trading (paddy purchases + rice sales)
  - Implemented in Python + both Node.js backends
- **Desktop App Startup Optimization** - Loading indicator during folder selection, deferred backup to after window load
- **Version Bump** - 3.6.2 → 3.7.0

### v3.6.x (Previous Session)
- **FY Opening Balance Carry-Forward** - ALL modules: Cash Book, Mill Parts, Diesel, Local Party, Staff Advances
- **Bug Fixes**: Monthly Report API endpoint, Part-wise Summary search bar
- **PDF/Excel Report Parity** (centered, DD-MM-YYYY format)
- **Staff Advance Ledger** with debit/credit history
- **"All Parties"/"All Staff" options**, Multi-Staff Settlement
- **Performance Optimization** (caching, compression, DB save debouncing)
- **Print-Friendly Views**

## Pending Issues
- **P2**: Intermittent Typing/Focus Issue in Desktop App (fix deployed, user verification pending)

## Test Reports
- `/app/test_reports/iteration_33.json` - 11/11 tests PASS (FY carry-forward, bug fixes)
- `/app/test_reports/iteration_34.json` - 16/16 tests PASS (FY Summary Dashboard, regressions)

## Key Files
- `/app/backend/routes/fy_summary.py` - FY Summary API
- `/app/frontend/src/components/FYSummaryDashboard.jsx` - FY Summary Frontend
- `/app/desktop-app/main.js` - Desktop app with startup optimization
- `/app/desktop-app/routes/fy_summary.js` - FY Summary for desktop
- `/app/local-server/routes/fy_summary.js` - FY Summary for local server
