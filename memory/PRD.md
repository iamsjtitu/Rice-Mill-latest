# Mill Entry System - PRD

## Original Problem Statement
A comprehensive rice mill management system with features for paddy procurement, milling operations, DC management, financial tracking, staff management, and reporting.

## Architecture
- **Frontend**: React (Vite) 
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Desktop**: Electron + Node.js (separate codebase)
- **Local Server**: Node.js (separate from web backend)

## Current Version: v32.0.0

## What's Been Implemented

### Core Features (Complete)
- Mill entry management with truck/agent tracking
- Cash Book with double-entry ledger (jama/nikasi)
- DC (Delivery Challan) management with deliveries
- MSP payment tracking
- Gunny bag inventory (new/old/auto-mill)
- Milling operations (paddy custody, FRK, byproduct)
- Agent/Mandi payment calculations
- Private trading (paddy purchase + rice sales)
- Sale Book & Purchase Book with vouchers
- Mill parts & store room inventory
- Diesel account management
- Staff attendance & salary
- Hemali (labour) payment system
- Season P&L reports
- FY Summary with balance sheet
- Telegram report integration
- Auto-update system for desktop app
- "What's New" changelog component

### Session Work (March 2026)

#### Critical Bug Fixes (Previous Session - Complete)
- Auto-Ledger double-entry logic fix (all backends)
- Round Off balance fix (Cash in Hand calculation)
- UI freeze fix (desktop preload.js MutationObserver)
- Export filter fix (desktop/local-server)

#### Export Redesign (Current Session - Complete)
- Created centralized styling helpers:
  - `backend/utils/export_helpers.py` (Python - style_excel_title, style_excel_header_row, style_excel_data_rows, style_excel_total_row, get_pdf_table_style)
  - `desktop-app/routes/excel_helpers.js` (Node.js)
  - `desktop-app/routes/pdf_helpers.js` (Node.js)
- Applied new "sundar" (beautiful) styling to ALL Python web backend exports (50 endpoints verified):
  - diesel.py (Excel + PDF)
  - ledgers.py (outstanding + party_ledger, Excel + PDF)
  - payments.py (agent payments, Excel + PDF)
  - mill_parts.py (store_room, stock, transactions, Excel + PDF)
  - milling.py (milling_report, paddy_custody, FRK, byproduct, Excel + PDF)
  - dc_payments.py (DC register, MSP, gunny bags, Excel + PDF)
  - entries.py (mill entries, Excel + PDF)
  - hemali.py (monthly_summary, export, Excel + PDF)
  - private_trading.py (paddy_purchases, rice_sales, Excel + PDF)
  - salebook.py (sale_book Excel)
  - purchase_vouchers.py (purchase_book, stock_summary Excel)
  - reports.py (CMR vs DC, Season PnL, Agent-Mandi wise, Excel + PDF)
  - cashbook.py (party_summary, Excel + PDF - already had main cashbook done)
  - daily_report.py (daily report, Excel + PDF)

#### Cashbook PDF Major Fix (Current Session - Complete)
- Fixed cashbook PDF to use `addPdfTable` + `addTotalsRow` helpers instead of manual drawing
- Added from/to date range display in PDF header subtitle
- Added Total row (Jama, Nikasi, Balance) at bottom of table
- Fixed party-summary PDF to use PDFKit helpers (was HTML before)
- Updated default branding in main.js: "Mill Entry System" → "NAVKAR AGRO"

#### Version Bump (Current Session - Complete)
- Desktop app version bumped: 32.0.0 → 33.0.0

#### Hindi Font Fix for PDFs (Current Session - Complete)
- Registered FreeSans font family (supports Hindi/Devanagari) for all ReportLab PDFs
- Created `get_pdf_styles()` helper that replaces Helvetica with FreeSans globally
- Updated ALL 19 route files to use FreeSans for PDF generation
- All ■■■ box characters eliminated from Hindi text in PDFs

#### Company Name + Tagline in All Exports (Current Session - Complete)
- Updated `export_helpers.py` to add Company Name (Row 1), Tagline (Row 2), Report Title (Row 3) in Excel exports
- Added `get_pdf_company_header()` helper for consistent PDF headers with company name + tagline
- Updated ALL 15+ Python route files to use centralized company header
- Updated Python `truck_lease.py` exports to use centralized helpers
- Verified all 56 export endpoints return 200 OK with company headers

#### Desktop-App Export Redesign (Current Session - Complete)
- Applied new "sundar" styling to ALL remaining desktop-app Node.js route files:
  - `daily_report.js` - Excel export with addExcelTitle, COLORS, styled headers
  - `private_trading.js` - 6 exports (party-summary, pvt-paddy, rice-sales × Excel+PDF)
  - `purchase_vouchers.js` - 3 exports (purchase-book Excel+PDF, individual voucher PDF)
  - `truck_lease.js` - 2 exports (Excel+PDF)
- All 17 desktop-app route files now use centralized `excel_helpers.js` and `pdf_helpers.js`
- All 34+ export endpoints verified working (200 OK)

## Pending Items
### P0
- Desktop app build required for all recent fixes to take effect (UI freeze, data migration, export filters, company headers)

### P1
- Export Preview feature (user requested)
- Centralize stock calculation logic

### P2
- Sardar-wise monthly Hemali report breakdown
- Refactor payment logic into service layer
- fy_summary.py balance sheet has specialized side-by-side layout - kept as-is

## Key API Endpoints
- `/api/cash-book/*` - Cash book CRUD + exports
- `/api/dc-entries/*` - DC register + exports
- `/api/msp-payments/*` - MSP payments + exports
- `/api/gunny-bags/*` - Gunny bag inventory + exports
- `/api/milling-report/*` - Milling operations + exports
- `/api/reports/*` - Various reports (outstanding, party-ledger, CMR vs DC, PnL, agent-mandi, daily)
- `/api/export/*` - Mill entries + agent payments exports
- `/api/hemali/*` - Hemali payments + exports
- `/api/private-paddy/*`, `/api/rice-sales/*` - Private trading exports
- `/api/sale-book/*`, `/api/purchase-book/*` - Sale/Purchase book exports
- `/api/mill-parts/*` - Mill parts exports
- `/api/diesel-accounts/*` - Diesel account exports
- `/api/staff/*` - Staff management

## Credentials
- Username: admin
- Password: admin123
