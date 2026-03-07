# Navkar Agro - Mill Entry System PRD

## Original Problem Statement
Mill Entry application for grain tracking with auto-calculations, role-based authentication, exports, mandi target tracking, and payment management for trucks and agents. The application has 3 versions: web preview (React+FastAPI), Desktop app (Electron), and Local server (Node.js/Express).

## Architecture
- **Web Preview**: React.js frontend + FastAPI + MongoDB
- **Desktop App**: Electron + Express.js + JSON file database
- **Local Server**: Node.js/Express + JSON file database
- **Frontend**: React.js + Tailwind CSS + Recharts
- **Exports**: openpyxl/reportlab (Python), exceljs/pdfkit (Node.js)

## User Personas
1. **Admin** - Full CRUD access, target management, payment management, branding settings
2. **Staff** - Create entries, edit own entries within 5 mins only

## What's Been Implemented

### Phase 1-5 - Core Features, Auth, Dashboard, Payments ✅
- KG to QNTL auto conversion, Mill W, Final W calculations
- Auto-suggest, BAG → G.Deposite auto-fill, P.Pkt deduction
- Admin/Staff role-based auth, styled Excel/PDF exports
- Dashboard with Mandi Targets, Progress bars
- Truck Payments (Rate × QNTL - Cash - Diesel), Agent Payments

### Phase 6 - Bug Fixes & Keyboard Shortcuts ✅
- Alt+N/E/D/P/R/F, Esc shortcuts

### Phase 7-8 - Print Invoice & Consolidated View ✅
- Bilingual (Hindi+English) truck/agent payment receipts
- Truck Owner Consolidated View with print/export

### Phase 9-11 - Refactoring, Date Filter, RST/TP Fields ✅
- LoginPage.jsx, AutoSuggest.jsx extracted
- Date range filter, RST No. & TP No. fields

### Phase 12 - White Label / Branding Settings ✅
- Dynamic company name + tagline in header/footer/receipts/exports

### Phase 13-17 - Desktop App & Local Server ✅
- Electron .exe with Tally-style folder selection
- Local JSON database (no MongoDB needed)
- Auto-backup system (daily, max 7)
- ExcelJS + PDFKit exports
- 49+ API endpoints mirrored from Python backend

### Phase 18-20 - Bug Fixes, Theme, Electron Fixes ✅
- Print fix, Agent Payment Calculation fix, Dark/Light theme toggle
- Excel styling, Download fix, About section updates

### Phase 21 - CMR Module Phase 1: Milling & Conversion Tracker ✅ (Mar 2026)
- **Milling Entry CRUD** - Track milling sessions (parboiled/raw)
  - Paddy input from available stock (Mill W. QNTL from mill entries)
  - Output: Rice%, Bran%, Kunda%, Broken%, Kanki% (QNTL auto-calculated)
  - Husk% auto-calculated as remainder (100 - sum of others)
  - FRK purchased separately (qty + rate, NOT from paddy)
  - CMR Delivery = Rice QNTL + FRK QNTL (auto)
  - Outturn Ratio = CMR / Paddy * 100 (auto)
- **Paddy Stock Dashboard** - Available stock from Mill W. QNTL minus used in milling
- **By-Product Stock Register** - Auto stock from milling output (Bran, Kunda, Broken, Kanki, Husk)
- **By-Product Sales** - Sell by-products with qty, rate, buyer tracking
- **Sub-tabs**: Milling Entries | By-Products Stock & Sales
- **All 3 backends updated**: Python/FastAPI, Node.js local-server, Electron desktop-app
- **Testing**: 100% pass (20/20 backend, all frontend)

## API Endpoints
### Authentication
- POST /api/auth/login, POST /api/auth/change-password, GET /api/auth/verify

### Mill Entries
- GET/POST /api/entries, PUT/DELETE /api/entries/{id}, POST /api/entries/bulk-delete, GET /api/totals

### Mandi Targets
- CRUD: /api/mandi-targets, GET /api/mandi-targets/summary

### Dashboard
- GET /api/dashboard/agent-totals, /api/dashboard/date-range-totals

### Truck & Agent Payments
- Full CRUD + rate/pay/mark-paid/undo-paid/history endpoints

### Milling (CMR) - NEW
- CRUD: /api/milling-entries
- GET /api/paddy-stock (available paddy from Mill W.)
- GET /api/milling-summary (aggregated stats + parboiled/raw breakdown)
- GET /api/byproduct-stock (produced/sold/available per product)
- CRUD: /api/byproduct-sales

### Exports
- Excel and PDF for entries, truck payments, agent payments

## Test Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Test Reports
- /app/test_reports/iteration_11.json - CMR Module Phase 1 (100% PASS)

## Files Structure
```
/app/backend/server.py - FastAPI backend (MongoDB)
/app/frontend/src/App.js - Main React frontend
/app/frontend/src/components/MillingTracker.jsx - CMR Milling component
/app/frontend/src/components/ - LoginPage, AutoSuggest, UI components
/app/desktop-app/main.js - Electron + Express + JSON DB
/app/local-server/server.js - Standalone Express + JSON DB
```

## Prioritized Backlog

### P0 (Critical) - ALL DONE ✅
- All core features, payments, exports, printing, branding, desktop app
- CMR Module Phase 1: Milling, Paddy Stock, By-Product Stock & Sales

### P1 (High Priority) - UPCOMING
- [ ] **Phase 2: DO & Delivery Management** - Track government Delivery Orders (DO number, quantity, deadline) and deliveries against each DO
- [ ] **Phase 3: Stock & Payment Tracking** - MSP payment tracking from government
- [ ] **Private Paddy Trading** - Buy paddy from outside, mill, sell rice + by-products
- [ ] **Gunny Bag Tracking** - New bags from government (free), old bags purchased from market

### P2 (Medium Priority)
- [ ] Phase 4: Reporting - Milling Report, CMR Delivery vs DO, Season P&L
- [ ] Phase 5: Consolidated Ledgers - Outstanding Report, Party Ledger
- [ ] Code refactoring: Break App.js into components
- [ ] Code refactoring: Modularize main.js and server.js

### P3 (Low Priority)
- [ ] Audit trail for entry changes
- [ ] Mobile responsive improvements
- [ ] macOS build
