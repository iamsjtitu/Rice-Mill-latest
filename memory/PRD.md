# Navkar Agro - Mill Entry System PRD

## Original Problem Statement
Mill Entry application for grain tracking with auto-calculations, role-based auth, exports, mandi target tracking, payment management. 3 versions: web preview (React+FastAPI), Desktop (Electron), Local server (Node.js).

## Architecture
- **Web Preview**: React + FastAPI + MongoDB
- **Desktop App**: Electron + Express.js + JSON file DB
- **Local Server**: Node.js/Express + JSON file DB

## What's Been Implemented

### Core Features (Phase 1-20)
- KG to QNTL auto conversion, Mill W, Final W, printing, exports, auth, dashboard
- Truck & Agent payments, keyboard shortcuts, branding, dark/light theme
- Desktop .exe app, local server, auto-backup

### CMR Module Phase 1: Milling & Conversion Tracker (Mar 2026)
- **Milling Entry CRUD** - Paddy from stock, output % (Rice, Bran, Kunda, Broken, Kanki), Husk auto, FRK from stock, CMR = Rice + FRK, Outturn ratio
- **FRK Purchase Module** - Separate FRK purchase from parties, stock tracking
- **By-Product Stock & Sales** - Auto stock from milling, sale tracking per product
- **Paddy Custody Maintenance Register** - All paddy movements (received/released), running balance. Label: "Released" (not "Issued")
- **Export for ALL CMR tabs** - Excel + PDF for Milling Report, FRK, By-Products, Custody Register
- **All 3 backends synced**: Python/FastAPI, Node.js local-server, Electron desktop-app

### Cash Book / Daily Cash & Bank Register (Mar 2026)
- **Cash in Hand (नकद)** - Track cash jama/nikasi with running balance
- **Bank Balance (बैंक)** - Track bank jama/nikasi with running balance
- **Transaction History** - Full CRUD with date, account, type, category, description, amount, reference
- **Custom Categories** - Users can create/delete custom categories per account+type combination
- **Summary Cards** - Cash Balance, Bank Balance, Total Balance with in/out breakdowns
- **Filters** - By account (cash/bank), date range
- **Excel + PDF Export** - With summary section and detailed transaction list
- **All 3 backends synced**: Python/FastAPI, Node.js local-server, Electron desktop-app
- **Keyboard shortcut**: Alt+B for Cash Book tab

## API Endpoints

### CMR Module
- CRUD: `/api/milling-entries`, `/api/frk-purchases`, `/api/byproduct-sales`
- GET: `/api/paddy-stock`, `/api/milling-summary`, `/api/frk-stock`, `/api/byproduct-stock`, `/api/paddy-custody-register`
- Export: `/api/milling-report/excel|pdf`, `/api/frk-purchases/excel|pdf`, `/api/byproduct-sales/excel|pdf`, `/api/paddy-custody-register/excel|pdf`

### Cash Book
- CRUD: `/api/cash-book` (POST/GET/DELETE)
- Summary: `/api/cash-book/summary`
- Categories: `/api/cash-book/categories` (GET/POST/DELETE)
- Export: `/api/cash-book/excel`, `/api/cash-book/pdf`

## Test Credentials
- Admin: admin / admin123 | Staff: staff / staff123

## Test Reports
- /app/test_reports/iteration_13.json - CMR Exports & Label Change (100% PASS)
- /app/test_reports/iteration_14.json - Cash Book (100% PASS - 21/21 backend, all frontend)

## Terminology
- DO -> DC (Delivery Challan) per user request
- Issued -> Released in Paddy Custody Register per user request

## Prioritized Backlog

### P1 (High) - UPCOMING
- [ ] Phase 2: DC (Delivery Challan) & Delivery Management - Government DC tracking
- [ ] Phase 3: MSP Payment Tracking from government
- [ ] Private Paddy Trading - Buy/sell outside
- [ ] Gunny Bag Tracking - New (govt free) + Old (market purchase)

### P2 (Medium)
- [ ] Phase 4: Reporting (CMR vs DC, Season P&L)
- [ ] Phase 5: Consolidated Ledgers
- [ ] Code refactoring: Break monolithic files into modules

### P3 (Low)
- [ ] Audit trail, Mobile responsive, macOS build
