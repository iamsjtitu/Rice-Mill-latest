# Mill Entry System (Navkar Agro) - PRD

## Original Problem Statement
Full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app using local JSON storage. Requires double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Architecture
- **Frontend:** React + Shadcn UI (shared across web & desktop)
- **Web Backend:** Python FastAPI + MongoDB
- **Desktop Backend:** Electron + Express + Local JSON
- **Local-Server Backend:** Express + Local JSON (network access)
- **Triple Backend Rule:** Logic changes in Python MUST be mirrored in both JS backends

## Current Version: v40.0.0

## What's Been Implemented
- Complete rice mill management (Entries, Milling, Cash Book, Payments, Reports, Staff, Mill Parts, FY Summary, etc.)
- Double-entry accounting with Cash Book (cash flow) and Ledger (party balances)
- Private Paddy Purchase with auto-ledger creation (account: ledger ONLY)
- Agent/Mandi-wise reports with "Move to Paddy Purchase" for extra qntl
- Daily Reports (Normal + Detail) with PDF export
- Global confirm dialog (ConfirmProvider) replacing window.confirm for Electron
- Auto-fix endpoint for data consistency
- Keyboard shortcuts (Ctrl+N)
- Data Health Check dashboard (Settings page)
- Enter key sequential field navigation in Transaction Form (v40.0.0)

## Recently Completed (v40.0.0 - 26 Mar 2026)
- **Enter Key Navigation**: Transaction Form mein Enter se next field par focus (Date → Category → Amount → Description → Reference → Round Off → Save Button)
- **Category Suggestion**: ArrowDown+Enter suggestion select karta hai, Enter without suggestion navigates to next field
- **Version Bump**: v40.0.0 across all components (frontend, desktop-app, local-server)
- **Code Cleanup**: Stale test files removed from desktop-app, __pycache__ cleaned, frontend build synced to all backends
- **Frontend Build Sync**: Latest build deployed to desktop-app/frontend-build and local-server

## Key Accounting Rules
- **Cash Transactions (account: 'cash')**: ONLY for actual cash movement (rokad)
- **Party Ledgers (account: 'ledger')**: For liability tracking (kitna dena hai)
- **Paddy Purchase**: Creates ONLY ledger entry (no cash entry until payment)
- **Payment**: Creates cash entry (actual cash outflow)

## Pending/Upcoming Tasks
### P1 - Electron Packaging (.exe build)
- Wine not available in cloud container (ARM Linux), user needs to build on Windows machine
- Code and frontend build are ready for packaging

### P1 - Export Preview Feature
- Show data preview on screen before Excel/PDF export

### P2 - Route Parity (local-server)
- 11 routes missing in local-server that desktop-app has (bank_accounts, gst_ledger, gunny_bags, hemali, milling, purchase_vouchers, salebook, truck_lease, voucher_payments, backups, daily_report_logic)

### P2 - Centralize Stock Calculation
- Consolidate duplicated stock calculation logic

### P2 - Payment Logic Refactor
- Reduce code duplication in payment processing

## Rejected Tasks
- ~~Sardar-wise monthly Hemali report~~ (User rejected)

## Credentials
- Username: admin, Password: admin123
