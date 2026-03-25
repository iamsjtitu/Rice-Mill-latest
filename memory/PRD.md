# Mill Entry System - PRD

## Current Version: v38.3.0

## Architecture
- **Frontend**: React (CRA with CRACO) 
- **Backend**: FastAPI (Python) + Node.js Express (Desktop/Local)
- **Database**: MongoDB (web) / Local JSON (desktop)

## Bug Fixes (25 March 2026)

### v38.3.0 - Pvt Paddy Party Name BULLETPROOF Fix
- Added `_ensurePartyJamaExists()` function to ALL 3 backends (desktop, local-server, python)
- 3-layer protection: Backend helper → Safety net check → Frontend auto-fix call
- POST and PUT handlers now: try helper → catch error → always verify entry exists
- Frontend PaddyPurchase calls `/api/cash-book/auto-fix` after every save as safety net
- Auto-fix on startup also creates missing entries for historical data

### v38.2.0 - UI Freeze Fix (Global)
- Replaced ALL `window.confirm` across 15+ components with React AlertDialog via ConfirmProvider

### v38.1.0 - Ctrl+N + Pvt Paddy fixes
- Ctrl+N selector fixed, delete function fixed, qntl/rate fields corrected

## Pending Items
### P1
- Export Preview feature
- Centralize stock calculation logic

### P2  
- Sardar-wise monthly Hemali report breakdown
- Payment logic refactor into service layer

## Credentials
- Username: admin, Password: admin123
