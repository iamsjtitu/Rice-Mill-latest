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

## Complete Refactoring Summary (v90.3.0)

### Component Splitting Results
| File | Original | Final | Reduction | Extracted To |
|------|----------|-------|-----------|-------------|
| App.js | 1709 | 1136 | -573 | useFilters, useKeyboardShortcuts, AppHeader |
| Reports.jsx | 1391 | 38 | -1353 | CMRvsDC, SeasonPnL, DailyReport, AgentMandiReport |
| Payments.jsx | 2036 | 1731 | -305 | DieselAccount |
| cashbook.py | 1754 | 1618 | -136 | cashbook_service.py |
| **Total** | **6890** | **4523** | **-2367** | |

### New Files Created
| File | Lines | Purpose |
|------|-------|---------|
| hooks/useFilters.js | 137 | Filter state, FY settings, mandi cutting map |
| hooks/useKeyboardShortcuts.js | 130 | All keyboard shortcut handlers |
| entries/AppHeader.jsx | 281 | Header + FY selector + admin dropdown + action bar |
| reports/CMRvsDC.jsx | 84 | CMR vs DC comparison report |
| reports/SeasonPnL.jsx | 83 | Season Profit & Loss report |
| reports/DailyReport.jsx | 872 | Daily operational report |
| reports/AgentMandiReport.jsx | 337 | Agent & Mandi wise report |
| payments/DieselAccount.jsx | 316 | Diesel account management |
| services/cashbook_service.py | 164 | Cashbook transaction helpers |

### Security Fixes
- Wildcard → explicit imports (4 backend files)
- Dynamic __import__ → static imports (2 files)
- document.write XSS → safe patterns (6 frontend files)
- Empty catch → console.error (5 files)
- Test credentials → env vars (5 test files)

### Performance
- useMemo for truckWiseConsolidated in Payments.jsx
- Stable unique keys replacing array index in SaleBook.jsx

## Prioritized Backlog

### P1 (High)
- Quality Test Report Register
- Monthly Return Auto-generation

### P3 (Low)
- Triple backend code deduplication
- Remaining ~40 array-index-as-key fixes

## Permanent Rules
1. Version Bump + WhatsNew every fix/feature
2. Parity Check: `python3 /app/scripts/check-parity.py`
3. Route Sync: `bash /app/scripts/sync-js-routes.sh`
4. Hindi/Hinglish communication only
