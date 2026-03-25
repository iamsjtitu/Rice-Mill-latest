# Mill Entry System - PRD

## Original Problem Statement
A comprehensive rice mill management system with features for paddy procurement, milling operations, DC management, financial tracking, staff management, and reporting.

## Architecture
- **Frontend**: React (Vite) 
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Desktop**: Electron + Node.js (separate codebase)
- **Local Server**: Node.js (separate from web backend)

## Current Version: v36.0.0

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

#### Export Redesign (Previous Session - Complete)
- Created centralized styling helpers for Python and Node.js
- Applied new styling to ALL Python web backend exports (50 endpoints)
- Applied new styling to ALL desktop-app Node.js route files (34+ endpoints)

#### Cashbook PDF Major Fix (Previous Session - Complete)
- Fixed cashbook PDF to use helpers instead of manual drawing
- Added date range display and totals row

#### Hindi Font Fix for PDFs (Previous Session - Complete)
- Registered FreeSans font family for all ReportLab PDFs
- All Hindi text now renders correctly in PDFs

#### Company Name + Tagline in All Exports (Previous Session - Complete)
- Updated all 56 export endpoints with company headers

#### Remove Ref Column from All Exports (March 2026 - Complete)
- Removed "Reference"/"Ref" column from ALL PDF and Excel exports

#### Jama (Cr) / Nikasi (Dr) Label Change (March 2026 - Complete)
- Changed all Jama/Nikasi labels across entire software

#### Party Ledger Accounting Bug Fix (March 2026 - Complete)
- Fixed double-counting bug across ALL payment systems
- Exclude ALL entries with `_ledger:` in reference

#### Sale Book & Purchase Voucher in Party Ledger (March 2026 - Complete)
- Added dedicated Sale Book and Purchase Voucher sections
- Version bumped to 35.0.0

#### Desktop Build Fix (25 March 2026 - Complete)
- **Root Cause:** `frontend-build/` directory contained stale code from v32.0.0, and `setup-desktop.js` skipped rebuild when old build existed
- **Fix 1:** Updated `APP_VERSION` in `WhatsNew.jsx` from `32.0.0` to `35.0.0`
- **Fix 2:** Added new v35.0.0 changelog entry in WhatsNew component
- **Fix 3:** Rebuilt `frontend-build/` with latest source code
- **Fix 4:** Improved `setup-desktop.js` with version mismatch detection using `.build-version` tracking file
- **Verified:** Footer shows v35.0.0, Jama (Cr)/Nikasi (Dr) labels visible, all changes present in build

## Pending Items
### P0
- UI freeze on delete (fix in preload.js, needs user verification on desktop build)

### P1
- Export Preview feature (user requested)
- Centralize stock calculation logic

### P2
- Sardar-wise monthly Hemali report breakdown
- Refactor payment logic into service layer

## Key API Endpoints
- `/api/cash-book/*` - Cash book CRUD + exports
- `/api/dc-entries/*` - DC register + exports
- `/api/msp-payments/*` - MSP payments + exports
- `/api/gunny-bags/*` - Gunny bag inventory + exports
- `/api/milling-report/*` - Milling operations + exports
- `/api/reports/*` - Various reports
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
