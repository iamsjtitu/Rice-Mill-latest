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
- Double-entry accounting with Cash Book and Ledger
- Private Paddy Purchase with auto-ledger (account: ledger ONLY)
- Agent/Mandi-wise reports with "Move to Paddy Purchase"
- Daily Reports with PDF export
- Keyboard shortcuts (Ctrl+N, Ctrl+S)
- Enter/Tab key sequential field navigation in Transaction Form
- Data Health Check dashboard (Settings)
- Cash Book → Paddy Purchase auto-link (when paying from Cash Book, paddy paid_amount auto-updates)
- Double-click prevention on Pay buttons (payLoading state)
- Round-off properly included in ledger entries
- Backup folder cleanup for Google Drive sync conflicts
- Route parity: local-server fully synced with desktop-app routes

## Recently Completed (26 Mar 2026)
### v40.0.0 Features
- Enter/Tab key sequential field navigation in Transaction Form
- Ctrl+S direct save from anywhere
- Version bump to v40.0.0 across all components
- Code cleanup and frontend build sync

### Bug Fixes (This Session)
- **Double Payment Fix**: Added payLoading state to prevent double-click on Pay buttons in PaddyPurchase.jsx and PrivateTrading.jsx
- **Cash Book → Paddy Purchase Auto-Link**: Removed `source: agent_extra` filter so agent_extra entries (from move-to-pvt) are also auto-linked. Added `balance > 0` filter and partial name matching
- **Round-Off in Ledger**: Python backend's private-payments endpoint now uses `total_settled` (amount + round_off) for ledger entry
- **Backup Folder Cleanup**: Added `cleanupDuplicateBackupFolders()` in desktop-app main.js to handle Google Drive sync conflicts
- **Route Parity Complete**: All 11 missing routes synced from desktop-app to local-server, cashbook.js fully updated

## Key Accounting Rules
- **Cash Transactions (account: 'cash')**: ONLY for actual cash movement (rokad)
- **Party Ledgers (account: 'ledger')**: For liability tracking (kitna dena hai)
- **Paddy Purchase**: Creates ONLY ledger Jama entry (no cash entry until payment)
- **Payment via Pvt Paddy**: Creates 1 cash Nikasi + 1 ledger Nikasi (with round_off)
- **Payment via Cash Book**: Auto-links to Pvt Paddy if party_type matches

## Pending/Upcoming Tasks
### P1 - Electron Packaging (.exe build)
- Wine not available in cloud container, user needs to build on Windows machine
- Code ready for packaging

### P1 - Export Preview Feature
- Show data preview before Excel/PDF export

### P2 - Centralize Stock Calculation
### P2 - Payment Logic Refactor

## Credentials
- Username: admin, Password: admin123
