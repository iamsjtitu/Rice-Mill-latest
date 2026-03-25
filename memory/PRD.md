# Mill Entry System - PRD

## Current Version: v38.4.0

## Architecture
- Frontend: React (CRA with CRACO)
- Backend: FastAPI (Python) + Node.js Express (Desktop/Local)
- Database: MongoDB (web) / Local JSON (desktop)

## ROOT CAUSE & FIX LOG

### v38.4.0 - Pvt Paddy Cash Book Fix (CRITICAL)
**Root Cause:** Party Jama entry was created with `account: 'ledger'` but user views Cash Book → "Cash Transactions" tab which filters `account: 'cash'`. Entry EXISTED but was INVISIBLE.
**Fix:** Changed `account: 'ledger'` to `account: 'cash'` in ALL backends + auto-fix + safety net. Added migration step to fix old entries (ledger → cash).

### v38.3.0 - Safety Net Fix
- Added `_ensurePartyJamaExists()` function, try-catch wrapper, frontend auto-fix call

### v38.2.0 - UI Freeze Fix
- Replaced ALL `window.confirm` with React AlertDialog via ConfirmProvider

### v38.1.0 - Ctrl+N + Delete Fix
- Ctrl+N selector fixed, delete function regex patterns corrected, qntl/rate fields fixed

## Pending
- P1: Export Preview feature
- P1: Stock calculation centralize
- P2: Sardar-wise monthly Hemali report
- P2: Payment logic refactor

## Credentials
- Username: admin, Password: admin123
