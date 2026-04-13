# Rice Mill Management System - PRD

## Current Version: v90.3.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + SQLite/JSON
- **Backend (Local)**: Express + SQLite/JSON

## What's Been Implemented
- Mill Entry CRUD, Cash Book, Private Paddy Purchase, Sale/Purchase Vouchers
- DC Tracker, Milling Tracker (CMR), Staff Management, Hemali, Rice Sales, Truck Lease, Diesel, Mill Parts
- Government Registers (Form A-F, Transit Pass, CMR Delivery, FRK Blending, Gunny Bag, Security Deposit)
- Dynamic By-Product Categories (Settings → auto-populate everywhere)
- Reports (CMR vs DC, Season P&L, Daily, Agent/Mandi, Weight Discrepancy)
- FY Summary Dashboard, Balance Sheet, Quick Search, PDF/Excel export with watermark
- Multi-user with role-based access, WhatsApp/Telegram messaging, Camera, GST Ledger/Audit Log

## Code Quality & Refactoring (v90.3.0)

### Security Fixes
- Wildcard imports → explicit imports (auth.py, cashbook.py, dc_payments.py, milling.py)
- Dynamic __import__ → static imports (milling.py, govt_registers.py)
- document.write XSS → safe doc reference patterns (6 files)
- Empty catch blocks → console.error logging (5 files)
- Test credentials → environment variables (5 test files)

### Component Splitting
- **App.js** (1709→1394 lines): Extracted `useFilters` hook (137 lines), `useKeyboardShortcuts` hook (130 lines)
- **Reports.jsx** (1391→1236 lines): Extracted `reports/CMRvsDC.jsx` (84 lines), `reports/SeasonPnL.jsx` (83 lines)
- **cashbook.py** (1754→1618 lines): Extracted `services/cashbook_service.py` (164 lines) with detect_party_type, create_auto_ledger_entry, process_diesel_auto_entry, process_pvt_paddy_auto_payment

### Performance
- useMemo for expensive reduce() in Payments.jsx (truckWiseConsolidated)
- Stable unique keys replacing array index keys in SaleBook.jsx

## Prioritized Backlog

### P1 (High)
- Quality Test Report Register
- Monthly Return Auto-generation

### P2 (Medium)  
- Further Payments.jsx splitting (2035 lines → TruckPayments, AgentPayments sub-components)
- Further App.js splitting (1394 lines → EntriesActionBar, AppHeader components)
- DailyReport + AgentMandiReport extraction from Reports.jsx

### P3 (Low)
- Triple backend code deduplication
- Remaining array-index-as-key fixes (~40 instances)

## Permanent Rules
1. Version Bump + WhatsNew: Every fix/feature
2. Parity Check: `python3 /app/scripts/check-parity.py`
3. Route Sync: `bash /app/scripts/sync-js-routes.sh`
4. Hindi/Hinglish communication only
5. Dynamic By-Products: Models accept raw dict for Milling Entries
6. Opening Stock: `opening_stock` collection (Settings) falls back to `opening_balances` (FY Summary)
