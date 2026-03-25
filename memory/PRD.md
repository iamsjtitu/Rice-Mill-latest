# Mill Entry System - PRD

## Original Problem Statement
A comprehensive rice mill management system with features for paddy procurement, milling operations, DC management, financial tracking, staff management, and reporting.

## Architecture
- **Frontend**: React (CRA with CRACO) 
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Desktop**: Electron + Node.js Express (separate codebase with local JSON storage)
- **Local Server**: Node.js Express (separate from web backend)

## Current Version: v38.1.0

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
- Global keyboard shortcuts (Ctrl+N, Ctrl+S, Alt+*, Backspace navigation)

### Bug Fixes (25 March 2026 - v38.1.0)
- **Ctrl+N Keyboard Shortcut Fix**: Changed selector from `[data-testid*="new-btn"]` (matched whats-new-btn) to `[data-testid$="-add-btn"]` (ends-with match)
- **Pvt Paddy Party Name Fix**: 
  - Fixed `_deleteCashDieselForPvtPaddy` in ALL three backends (Python, Desktop, Local-server) to also delete `pvt_party_jama:` and `pvt_truck_jama:` reference entries
  - Fixed `qntl` field to use `final_qntl` (correct calculated field) instead of `qntl` 
  - Fixed `rate` field to use `rate_per_qntl` (correct form field) instead of `rate`
  - Added missing Party Jama entry creation in local-server backend
  - Fixed migration/auto-fix regex patterns for completeness

### Previous Session Work (25 March 2026 - v38.0.0)
- Desktop build pipeline fix
- UI Freeze on delete fix (React AlertDialog)
- Auto-ledger Cr/Dr direction fix
- Party Summary UI redesign
- Removed global Round Off separate ledger entries
- Added Round Off input to Pvt Paddy Make Payment
- Auto-fix startup script for historical data
- Global Keyboard Shortcuts
- Backspace navigation for empty fields
- Replaced "Total QNTL" with "Total Final W" in reports
- Mandi-specific dropdown filter in Agent/Mandi reports

## Pending Items
### P0
- None currently

### P1
- Export Preview feature (user requested)
- Centralize stock calculation logic

### P2
- Sardar-wise monthly Hemali report breakdown
- Refactor payment logic into service layer

### Refactoring Needs
- `App.js` is 2800+ lines - needs component extraction
- Payment logic should be centralized into service layer

## Key API Endpoints
- `/api/cash-book/*` - Cash book CRUD + exports
- `/api/private-paddy/*` - Private paddy CRUD + auto-ledger
- `/api/rice-sales/*` - Rice sales CRUD
- `/api/dc-entries/*` - DC register + exports
- `/api/msp-payments/*` - MSP payments + exports
- `/api/gunny-bags/*` - Gunny bag inventory
- `/api/milling-report/*` - Milling operations
- `/api/reports/*` - Various reports
- `/api/hemali/*` - Hemali payments
- `/api/sale-book/*`, `/api/purchase-book/*` - Sale/Purchase book
- `/api/mill-parts/*` - Mill parts
- `/api/diesel-accounts/*` - Diesel account
- `/api/staff/*` - Staff management

## Credentials
- Username: admin
- Password: admin123

## Critical Technical Notes
- **Dual Backend Rule**: Any logic change to Python routes MUST be replicated in desktop-app Node.js routes AND local-server routes
- **Build Pipeline**: Frontend changes need `yarn build` + copy to `desktop-app/frontend-build/`
- **Reference Patterns**: Pvt Paddy uses `pvt_paddy_*`, `pvt_party_jama:*`, and `pvt_truck_jama:*` references
