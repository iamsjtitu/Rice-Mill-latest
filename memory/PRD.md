# Mill Entry System (Navkar Agro) - PRD

## Original Problem Statement
Full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app using local JSON storage. Requires double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Architecture
- **Frontend:** React + Shadcn UI (shared across web & desktop)
- **Web Backend:** Python FastAPI + MongoDB
- **Desktop Backend:** Electron + Express + Local JSON
- **Local-Server Backend:** Express + Local JSON (network access)
- **Triple Backend Rule:** Logic changes in Python MUST be mirrored in both JS backends

## Current Version: v38.6.0

## What's Been Implemented
- Complete rice mill management (Entries, Milling, Cash Book, Payments, Reports, Staff, Mill Parts, FY Summary, etc.)
- Double-entry accounting with Cash Book (cash flow) and Ledger (party balances)
- Private Paddy Purchase with auto-ledger creation (account: ledger ONLY - not cash)
- Agent/Mandi-wise reports with "Move to Paddy Purchase" for extra qntl
- Daily Reports (Normal + Detail) with PDF export
- Global confirm dialog (ConfirmProvider) replacing window.confirm for Electron
- Auto-fix endpoint for data consistency
- Keyboard shortcuts (Ctrl+N)
- Data Health Check dashboard (Settings page)

## Recently Fixed (v38.6.0 - 25 Mar 2026)
- **Accounting Fix**: Paddy Purchase entries go ONLY to Party Ledger (not Cash Transactions - rokad safe)
- **Custom Party Type**: Users can now type custom party types without auto-detect overriding input
- **Party Ledger Search**: Shows "No ledger found" when search doesn't match any party
- **Cascade Delete**: Pvt Paddy delete removes associated ledger entries automatically
- **Data Health Check**: New dashboard in Settings to run auto-fix and view results
- **Desktop Build Updated**: All fixes deployed to desktop-app and local-server builds

## Key Accounting Rules
- **Cash Transactions (account: 'cash')**: Only for ACTUAL cash movement (rokad)
- **Party Ledgers (account: 'ledger')**: For liability tracking (kitna dena hai party ko)
- **Paddy Purchase**: Creates ONLY ledger entry (no cash entry until payment)
- **Payment**: Creates cash entry (actual cash outflow)

## Pending/Upcoming Tasks
### P1 - Export Preview Feature
- Show data preview on screen before Excel/PDF export so user can verify data

### P2 - Centralize Stock Calculation
- Consolidate duplicated stock calculation logic into a central function

### P2 - Payment Logic Refactor
- Reduce code duplication in payment processing across components and backends

## Rejected Tasks
- ~~Sardar-wise monthly Hemali report~~ (User rejected)

## Credentials
- Username: admin, Password: admin123
