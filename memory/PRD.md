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
- Milling Entry CRUD, FRK Purchase Module, By-Product Stock & Sales
- Paddy Custody Maintenance Register (label: "Released" not "Issued")
- Export for ALL CMR tabs (Excel + PDF)

### Cash Book / Daily Cash & Bank Register (Mar 2026)
- Cash in Hand + Bank Balance tracking (Jama/Nikasi)
- Custom Category Management (create/delete per account+type)
- Summary Cards, Filters, Excel + PDF Export
- Keyboard shortcut: Alt+B

### Phase 2: DC (Delivery Challan) & Payment Management (Mar 2026)
- **DC Management** - DC number, date, quantity, rice type, godown, deadline
- **Delivery Tracking** - Multiple deliveries per DC with vehicle/driver/slip info
- **Auto Status** - pending → partial → completed based on deliveries
- **Expandable Rows** - Click DC to see/add deliveries inline
- **MSP Payment Tracking** - Payment received from govt, linked to DCs, with mode/ref/bank
- **MSP Summary** - Total paid, avg rate, pending payment quantity
- **Gunny Bag (बोरी) Tracking** - New (govt free) + Old (market purchase), In/Out, auto-cost
- **Gunny Summary** - Stock balance by type (new/old), grand total
- **Excel + PDF Export** for all 3 sub-modules
- **All 3 backends synced**: Python/FastAPI, Node.js local-server, Electron desktop-app

## API Endpoints

### CMR Module
- CRUD: `/api/milling-entries`, `/api/frk-purchases`, `/api/byproduct-sales`
- GET: `/api/paddy-stock`, `/api/milling-summary`, `/api/frk-stock`, `/api/byproduct-stock`, `/api/paddy-custody-register`
- Export: milling-report, frk-purchases, byproduct-sales, paddy-custody-register (excel/pdf)

### Cash Book
- CRUD: `/api/cash-book`, Categories: `/api/cash-book/categories`
- Summary: `/api/cash-book/summary`, Export: `/api/cash-book/excel|pdf`

### DC & Payments
- DC CRUD: `/api/dc-entries`, Deliveries: `/api/dc-deliveries`
- DC Summary: `/api/dc-summary`, Export: `/api/dc-entries/excel|pdf`
- MSP CRUD: `/api/msp-payments`, Summary: `/api/msp-payments/summary`, Export: `/api/msp-payments/excel|pdf`
- Gunny CRUD: `/api/gunny-bags`, Summary: `/api/gunny-bags/summary`, Export: `/api/gunny-bags/excel|pdf`

## Test Credentials
- Admin: admin / admin123 | Staff: staff / staff123

## Test Reports
- iteration_13: CMR Exports & Label Change (100% PASS)
- iteration_14: Cash Book (100% PASS - 21/21 backend)
- iteration_15: DC, MSP, Gunny Bags (100% PASS - 27/27 backend)

## Prioritized Backlog

### P1 (High) - UPCOMING
- [ ] Phase 4: Reporting (CMR vs DC, Season P&L, Milling Report)
- [ ] Phase 5: Consolidated Ledgers (Outstanding Report, Party Ledger)

### P2 (Medium)
- [ ] Code refactoring: Break monolithic files into modules
- [ ] DC Export endpoints in Node.js backends (Excel/PDF)
- [ ] MSP/Gunny Export endpoints in Node.js backends (Excel/PDF)

### P3 (Low)
- [ ] Audit trail, Mobile responsive, macOS build
- [ ] Opening Balance feature for Cash Book
