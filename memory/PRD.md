# Mill Entry System - PRD

## Original Problem Statement
A comprehensive rice mill management system with features for paddy procurement, milling operations, DC management, financial tracking, staff management, and reporting.

## Architecture
- **Frontend**: React (CRA with CRACO) 
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Desktop**: Electron + Node.js Express (separate codebase with local JSON storage)
- **Local Server**: Node.js Express (separate from web backend)

## Current Version: v38.2.0

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
- ConfirmProvider context for UI-safe confirmation dialogs

### Bug Fixes (25 March 2026)

**v38.2.0 - UI Freeze Fix (Global)**
- Replaced ALL `window.confirm` calls across all components with React AlertDialog via `useConfirm()` hook
- Components fixed: PaddyPurchase, CashBook, DCTracker, Dashboard, FYSummaryDashboard, HemaliPayment, LeasedTruck, MillPartsStock, MillingTracker, Payments, PurchaseVouchers, StaffManagement, PrivateTrading, SaleBook, LocalPartyAccount
- Created reusable `ConfirmProvider` component with `useConfirm()` hook

**v38.1.0 - Ctrl+N + Pvt Paddy Party Name**
- Ctrl+N selector fixed (was matching whats-new-btn)
- Pvt Paddy delete function fixed to clean up pvt_party_jama entries
- qntl/rate fields corrected in all three backends

## Pending Items
### P0
- None

### P1
- Export Preview feature
- Centralize stock calculation logic

### P2
- Sardar-wise monthly Hemali report breakdown
- Refactor payment logic into service layer

### Refactoring
- `App.js` is 2800+ lines - needs component extraction
- App.js still has its own confirmDialog state (can be migrated to use ConfirmProvider)

## Credentials
- Username: admin
- Password: admin123

## Critical Technical Notes
- **Dual Backend Rule**: Any logic change to Python routes MUST be replicated in desktop-app AND local-server routes
- **Build Pipeline**: `cd /app/frontend && yarn build && cp -r build/* ../desktop-app/frontend-build/`
- **ConfirmProvider**: All components use `useConfirm()` hook instead of `window.confirm()`
