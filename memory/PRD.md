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
- Private Paddy Purchase with auto-ledger creation (account: ledger ONLY)
- Agent/Mandi-wise reports with "Move to Paddy Purchase" for extra qntl
- Daily Reports (Normal + Detail) with PDF export
- Global confirm dialog (ConfirmProvider) replacing window.confirm for Electron
- Auto-fix endpoint for data consistency
- Keyboard shortcuts (Ctrl+N)
- Data Health Check dashboard (Settings page)

## Recently Fixed (v38.6.0 - 25 Mar 2026)
- **Accounting Fix**: Paddy Purchase → ONLY Party Ledger (NOT Cash Transactions)
- **Custom Party Type**: Manual mode now stays active - dropdown shows "Manual", custom input preserved when typing category
- **Party Ledger Search**: "No ledger found" message when no match
- **Cascade Delete**: Pvt Paddy delete removes ledger entries
- **Data Health Check**: Dashboard in Settings for auto-fix
- **Season Fix**: Empty season defaults to "Kharif", auto-fix corrects existing entries
- **Daily Report**: quantity_qntl fallback, PDF field names fixed (d.qntl not d.kg)
- **Desktop Build**: All frontend + route changes deployed to desktop-app & local-server

## Key Accounting Rules
- **Cash Transactions (account: 'cash')**: ONLY for actual cash movement (rokad)
- **Party Ledgers (account: 'ledger')**: For liability tracking (kitna dena hai)
- **Paddy Purchase**: Creates ONLY ledger entry (no cash entry until payment)
- **Payment**: Creates cash entry (actual cash outflow)

## Pending/Upcoming Tasks
### P1 - Export Preview Feature
- Show data preview on screen before Excel/PDF export

### P2 - Centralize Stock Calculation
- Consolidate duplicated stock calculation logic

### P2 - Payment Logic Refactor
- Reduce code duplication in payment processing

## Rejected Tasks
- ~~Sardar-wise monthly Hemali report~~ (User rejected)

## Credentials
- Username: admin, Password: admin123
