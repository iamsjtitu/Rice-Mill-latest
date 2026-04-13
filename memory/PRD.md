# Rice Mill Management System - PRD

## Current Version: v90.3.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + SQLite/JSON
- **Backend (Local)**: Express + SQLite/JSON

## What's Been Implemented
- Mill Entry CRUD, Cash Book, Private Paddy Purchase, Sale/Purchase Vouchers, DC Tracker, Milling Tracker
- Staff Management, Hemali, Rice Sales, Truck Lease, Diesel, Mill Parts, Government Registers
- Dynamic By-Product Categories, Reports, FY Summary, Balance Sheet, Quick Search, PDF/Excel export
- Multi-user RBAC, WhatsApp/Telegram, Camera, GST Ledger/Audit Log

## Refactoring Summary (v90.3.0)

### Component Splitting (Total: -911 lines from monoliths)
| File | Before | After | Extracted To |
|------|--------|-------|-------------|
| App.js | 1709 | 1394 | useFilters (137), useKeyboardShortcuts (130) |
| Payments.jsx | 2036 | 1731 | payments/DieselAccount.jsx (316) |
| Reports.jsx | 1391 | 1236 | reports/CMRvsDC.jsx (84), reports/SeasonPnL.jsx (83) |
| cashbook.py | 1754 | 1618 | services/cashbook_service.py (164) |

### Security Fixes
- Wildcard → explicit imports (auth.py, cashbook.py, dc_payments.py, milling.py)
- Dynamic __import__ → static imports (milling.py, govt_registers.py)
- document.write XSS → safe patterns (6 frontend files)
- Empty catch → console.error (5 files), test credentials → env vars (5 test files)

### Performance
- useMemo for truckWiseConsolidated in Payments.jsx
- Stable unique keys replacing array index in SaleBook.jsx

## Prioritized Backlog

### P1 (High)
- Quality Test Report Register
- Monthly Return Auto-generation

### P2 (Medium)
- Further App.js splitting (1394 lines → EntriesActionBar, AppHeader)
- DailyReport + AgentMandiReport extraction from Reports.jsx (1236 lines)
- Truck/Agent invoice print HTML templates extraction to utils

### P3 (Low)
- Triple backend code deduplication
- Remaining ~40 array-index-as-key fixes

## Permanent Rules
1. Version Bump + WhatsNew every fix/feature
2. Parity Check: `python3 /app/scripts/check-parity.py`
3. Route Sync: `bash /app/scripts/sync-js-routes.sh`
4. Hindi/Hinglish communication only
