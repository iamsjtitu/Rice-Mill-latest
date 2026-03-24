# Mill Entry System - PRD

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend (Web)**: FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Node.js/Express + JSON file DB

## Latest (v30.0.0)

### Critical Bug Fix: Auto-Ledger Double-Entry Logic
- **Bug**: Auto-ledger entries were ALWAYS created as `txn_type: 'nikasi'`, regardless of original cash transaction direction. This caused double-counting and wrong balances when viewing party ledgers.
- **Fix**: Auto-ledger now correctly reverses txn_type:
  - Cash Jama (received from party) → Ledger Nikasi (party's debt reduces) 
  - Cash Nikasi (paid to party) → Ledger Jama (party's debt increases)
- Update endpoint also reverses txn_type when editing
- Existing wrong auto_ledger entries migrated (web DB)
- **Files**: `backend/routes/cashbook.py`, `desktop-app/routes/cashbook.js`

### Bug Fix: Round Off Not Counted in Cash Balance
- Round Off entries excluded from Cash in Hand / Bank balance summary
- Applied to all three backends (web, desktop, local-server)

### UI: Auto Update Redesigned
- Removed old native dialog.showMessageBox
- New states: checking, available, downloading, downloaded, uptodate, error
- Silent auto-check suppressed; only manual "Check for Updates" triggers UI

### UI: Truck Lease Receipt Redesigned
- Mill Entry System header, teal banner, truck info card, details grid, payment history table, summary box, signatures, bilingual Hindi+English

### Previous Features
- Diesel Account Sync from CashBook
- Round Off in ALL 9 payment sections (balance fix applied)
- Store Room CRUD + exports
- Telegram Share + confirmation dialog

## Round Off Design
- **Amount field**: Actual cash paid (affects Cash in Hand)
- **Round Off field**: Discount/adjustment (does NOT affect Cash in Hand)
- **Ledger entry**: amount + round_off (party's full balance settled)

## Backlog
- P0: New desktop build required for all recent fixes
- P0: Desktop existing auto_ledger entries need migration (script needed)
- P1: Refactor PDF/Excel generation logic (duplication)
- P1: Centralize stock calculation logic
- P2: Sardar-wise monthly breakdown report
- P2: Centralize payment logic into service layer
