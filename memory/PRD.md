# Mill Entry System - PRD

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend (Web)**: FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Node.js/Express + JSON file DB

## Latest (v27.0.0)

### Bug Fix: Round Off Not Counted in Cash Balance
- **Bug**: Round Off entries (party_type: "Round Off") were being included in the Cash in Hand / Bank balance summary calculation, inflating the cash balance. E.g., ₹12,400 cash paid + ₹68 round off showed Cash in Hand as -₹12,468 instead of -₹12,400.
- **Fix**: Excluded `party_type === "Round Off"` entries from cash_in/cash_out/bank_in/bank_out calculations in the summary endpoint. Applied to all three backends (web, desktop, local-server) including opening balance carry-forward calculations.
- **Files**: `backend/routes/cashbook.py`, `desktop-app/routes/cashbook.js`, `local-server/routes/cashbook.js`

### Bug Fix: UI Freeze After Delete (Radix pointer-events)
- **Bug**: `window.confirm()` blocks JS execution while Radix UI has `pointer-events: none` on body. After confirm closes, pointer-events stay stuck, freezing the entire UI.
- **Fix**: Global monkey-patch of `window.confirm` in `index.js` that restores `pointer-events` after every native confirm dialog.
- **File**: `frontend/src/index.js`

### Critical Bug Fix: Round Off Balance in ALL Payment Types
- **Bug**: Round off amount was NOT included in ledger/payment entries, causing incorrect balances
- **Fix Applied to ALL routes** (web + desktop): Truck, Agent, Owner, Diesel, Hemali, Voucher, CashBook, Local Party
- **Pattern**: Cash entry = actual amount paid, Ledger entry = total (amount + round_off)

### Previous Features
- Diesel Account Sync from CashBook
- Local Party Settlement mein Round Off option
- Telegram confirmation dialog with date/recipients
- Cash Transactions: Round Off toggle (show/hide)
- Daily Report: Telegram Share + Store Room in exports
- Store Room CRUD + Room-wise Report + All exports
- Round Off in ALL 9 payment sections
- What's New auto-popup + Footer

## Round Off Design
- **Amount field**: Actual cash paid (affects Cash in Hand)
- **Round Off field**: Discount/adjustment (does NOT affect Cash in Hand)
- **Ledger entry**: amount + round_off (party's full balance settled)
- **Separate Round Off cash_transaction**: Created for record-keeping but excluded from balance calculations

## Backlog
- P0: New desktop build required for all recent fixes
- P1: Refactor PDF/Excel generation logic (duplication)
- P1: Centralize stock calculation logic
- P2: Sardar-wise monthly breakdown report
- P2: Centralize payment logic into service layer
