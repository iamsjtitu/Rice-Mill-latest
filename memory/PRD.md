# Mill Entry System (Navkar Agro) - PRD

## Original Problem Statement
Full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app using local JSON storage. Requires double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Architecture
- **Frontend:** React + Shadcn UI (shared across web & desktop)
- **Web Backend:** Python FastAPI + MongoDB
- **Desktop Backend:** Electron + Express + Local JSON
- **Local-Server Backend:** Express + Local JSON (network access)
- **Triple Backend Rule:** Logic changes in Python MUST be mirrored in both JS backends

## Current Version: v38.5.0

## What's Been Implemented
- Complete rice mill management (Entries, Milling, Cash Book, Payments, Reports, Staff, Mill Parts, FY Summary, etc.)
- Double-entry accounting with Cash Book and Ledger views
- Private Paddy Purchase with auto-ledger creation
- Agent/Mandi-wise reports with "Move to Paddy Purchase" for extra qntl
- Daily Reports (Normal + Detail) with PDF export
- Global confirm dialog (ConfirmProvider) replacing window.confirm for Electron
- Auto-fix endpoint for data consistency
- Keyboard shortcuts (Ctrl+N)

## Recently Fixed (v38.5.0 - 25 Mar 2026)
- **P0 Fixed: Agent Extra entries now show in Cash Book** - Removed `isAgentExtra` skip from cash_transactions creation
- **P0 Fixed: Daily Report Qntl now shows correct values** - Added `quantity_qntl` fallback chain
- **P0 Fixed: PDF Report field names corrected** - `d.kg` → `d.qntl`, `pp.total_kg` → `pp.total_qntl`
- **P0 Fixed: Python backend account type corrected** - Changed `account:'ledger'` to `account:'cash'` for move-to-pvt entries
- **P0 Fixed: Auto-fix now includes agent_extra entries** - Fixes missing fields and creates cash book entries

## Root Causes Found (4 combined issues)
1. `source:'agent_extra'` entries were explicitly SKIPPED from cash_transactions creation
2. Desktop/local-server `move-to-pvt` didn't include `final_qntl`/`qntl`/`kg` fields
3. Python backend `move-to-pvt` used `account:'ledger'` instead of `account:'cash'`
4. Daily Report PDF template referenced wrong field names (`d.kg` instead of `d.qntl`)

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
