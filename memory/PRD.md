# Navkar Agro - Mill Entry System PRD

## Original Problem Statement
Mill Entry application for grain tracking with auto-calculations, role-based auth, exports, mandi target tracking, payment management. 3 versions: web preview (React+FastAPI), Desktop (Electron), Local server (Node.js).

## Architecture
- **Web Preview**: React + FastAPI + MongoDB
- **Desktop App**: Electron + Express.js + JSON file DB
- **Local Server**: Node.js/Express + JSON file DB

## What's Been Implemented

### Core Features (Phase 1-20) ✅
- KG→QNTL auto conversion, Mill W, Final W, printing, exports, auth, dashboard
- Truck & Agent payments, keyboard shortcuts, branding, dark/light theme
- Desktop .exe app, local server, auto-backup

### CMR Module Phase 1: Milling & Conversion Tracker ✅ (Mar 2026)
- **Milling Entry CRUD** - Paddy from stock (Mill W. QNTL), output % (Rice, Bran, Kunda, Broken, Kanki), Husk auto, FRK from purchased stock, CMR = Rice + FRK, Outturn ratio
- **FRK Purchase Module** - Separate FRK purchase from parties (party, qty, rate), stock tracking (purchased/used/available)
- **By-Product Stock & Sales** - Auto stock from milling, sale tracking per product
- **Paddy Custody Maintenance Register** - All paddy movements (received from trucks, issued for milling), running balance
- **Milling Report Export** - Excel + PDF with styled formatting
- **Paddy Custody Register Export** - Excel with received/issued/balance
- **4 Sub-tabs**: Milling Entries | FRK Purchase | By-Products | Paddy Custody Register
- **All 3 backends synced**: Python/FastAPI, Node.js local-server, Electron desktop-app

## API Endpoints (CMR Module)
- CRUD: `/api/milling-entries`
- GET `/api/paddy-stock`, `/api/milling-summary`
- CRUD: `/api/frk-purchases`, GET `/api/frk-stock`
- CRUD: `/api/byproduct-sales`, GET `/api/byproduct-stock`
- GET `/api/paddy-custody-register`
- GET `/api/milling-report/excel`, `/api/milling-report/pdf`
- GET `/api/paddy-custody-register/excel`

## Test Credentials
- Admin: admin / admin123 | Staff: staff / staff123

## Test Reports
- /app/test_reports/iteration_12.json - CMR Module (100% PASS - 16/16 backend, all frontend)

## Prioritized Backlog

### P1 (High) - UPCOMING
- [ ] Phase 2: DO & Delivery Management - Government DO tracking
- [ ] Phase 3: MSP Payment Tracking from government
- [ ] Private Paddy Trading - Buy/sell outside
- [ ] Gunny Bag Tracking - New (govt free) + Old (market purchase)

### P2 (Medium)
- [ ] Phase 4: Reporting (CMR vs DO, Season P&L)
- [ ] Phase 5: Consolidated Ledgers
- [ ] Code refactoring: Break monolithic files into modules

### P3 (Low)
- [ ] Audit trail, Mobile responsive, macOS build
