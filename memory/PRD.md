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

### CMR Module Phase 1: Milling & Conversion Tracker
- Milling Entry CRUD, FRK Purchase, By-Product Stock & Sales
- Paddy Custody Register (label: "Released" not "Issued")
- Export for ALL tabs (Excel + PDF)

### Cash Book / Daily Cash & Bank Register
- Cash in Hand + Bank Balance tracking (Jama/Nikasi)
- Custom Category Management, Summary Cards, Filters
- Excel + PDF Export, Alt+B shortcut

### Phase 2: DC (Delivery Challan) & Payment Management
- DC Management (auto-status: pending→partial→completed), expandable delivery rows
- MSP Payment Tracking (linked to DCs, mode/ref/bank)
- Gunny Bags (बोरी): New(govt)/Old(market) + **Paddy Receive Bags + P.Pkt from truck entries**
- **Govt bags NOT in total** (Total = Old + Paddy bags + P.Pkt)
- Excel + PDF Export for all

### Phase 4: Reporting
- **CMR vs DC Report** - Milling output vs DC allotment vs deliveries, surplus/deficit, by-product revenue
- **Season P&L** - Income (MSP, By-Products, Cash Jama) vs Expenses (FRK, Gunny, Cash Nikasi, Truck, Agent)
- Excel + PDF Export for both reports

## Key API Endpoints
- CMR: milling-entries, frk-purchases, byproduct-sales, paddy-custody-register (CRUD + exports)
- Cash Book: cash-book, cash-book/categories, cash-book/summary (CRUD + exports)
- DC: dc-entries, dc-deliveries, dc-summary, msp-payments (CRUD + exports)
- Gunny: gunny-bags, gunny-bags/summary (CRUD + exports)
- Reports: reports/cmr-vs-dc, reports/season-pnl (GET + exports)

## Test Reports
- iteration_13: CMR Exports (100%), iteration_14: Cash Book (100%)
- iteration_15: DC/MSP/Gunny (100%), iteration_16: Gunny Update + Reports (100%)

## Credentials
- Admin: admin / admin123 | Staff: staff / staff123

## Prioritized Backlog

### P1 (High)
- [ ] Phase 5: Consolidated Ledgers (Outstanding Report, Party Ledger)
- [ ] DC/MSP/Gunny Export endpoints in Node.js backends

### P2 (Medium)
- [ ] Code refactoring: Break monolithic files into modules
- [ ] Opening Balance for Cash Book
- [ ] Reports module in Node.js backends

### P3 (Low)
- [ ] Audit trail, Mobile responsive, macOS build
