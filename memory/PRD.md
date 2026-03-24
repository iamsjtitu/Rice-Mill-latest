# Mill Entry System - PRD

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend (Web)**: FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Node.js/Express + JSON file DB

## Latest (v27.0.0)

### Bug Fix: UI Freeze After Delete (Radix pointer-events)
- **Bug**: `window.confirm()` blocks JS execution while Radix UI has `pointer-events: none` on body. After confirm closes, pointer-events stay stuck, freezing the entire UI. Opening/closing any dialog was the only workaround.
- **Fix**: Global monkey-patch of `window.confirm` in `index.js` that restores `pointer-events` after every native confirm dialog. Fixes all 50+ delete/confirm actions across the entire app.
- **File**: `frontend/src/index.js`

### Critical Bug Fix: Round Off Balance in ALL Payment Types
- **Bug**: Round off amount was NOT included in ledger/payment entries, causing incorrect balances
- **Fix Applied to ALL routes** (web + desktop): Truck, Agent, Owner, Diesel, Hemali, Voucher, CashBook, Local Party
- **Pattern**: Cash entry = actual amount paid, Ledger entry = total (amount + round_off)
- Payment records (truck_payments, agent_payments, diesel_accounts, etc.) now store total_settled
- Desktop build config: utils/**/* added to electron-builder files array

### Previous Features
- Diesel Account Sync from CashBook
- Local Party Settlement mein Round Off option
- Telegram confirmation dialog with date/recipients
- Cash Transactions: Round Off toggle (show/hide)
- Daily Report: Telegram Share + Store Room in exports
- Store Room CRUD + Room-wise Report + All exports
- Round Off in ALL 9 payment sections
- What's New auto-popup + Footer

## Backlog
- P0: New desktop build required for all recent fixes
- P1: Refactor PDF/Excel generation logic (duplication)
- P1: Centralize stock calculation logic
- P2: Sardar-wise monthly breakdown report
- P2: Centralize payment logic into service layer
