# Rice Mill Management System - PRD

## Current Version: v90.3.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind (with React.lazy + Suspense)
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + SQLite/JSON
- **Backend (Local)**: Express + SQLite/JSON

## What's Been Implemented
- Mill Entry CRUD, Cash Book, Private Paddy Purchase, Sale/Purchase Vouchers, DC Tracker, Milling Tracker
- Staff Management, Hemali, Rice Sales, Truck Lease, Diesel, Mill Parts, Government Registers
- Dynamic By-Product Categories, Reports, FY Summary, Balance Sheet, Quick Search, PDF/Excel export
- Multi-user RBAC, WhatsApp/Telegram, Camera, GST Ledger/Audit Log

## Refactoring Summary (v90.3.0)

### Component Splitting (Total: -2367 lines from monoliths)
| File | Original | Final | Extracted To |
|------|----------|-------|-------------|
| App.js | 1709 | 1136 | useFilters, useKeyboardShortcuts, AppHeader |
| Reports.jsx | 1391 | 38 | CMRvsDC, SeasonPnL, DailyReport, AgentMandiReport |
| Payments.jsx | 2036 | 1731 | DieselAccount |
| cashbook.py | 1754 | 1618 | cashbook_service.py |

### Lazy Loading (17 components)
**Eager (instant):** LoginPage, Dashboard, Payments, MillingTracker, CashBook, ErrorBoundary, EntryTable, AppHeader
**Lazy (on-demand):** Reports, DCTracker, Ledgers, MillPartsStock, StaffManagement, FYSummaryDashboard, BalanceSheet, Vouchers, HemaliPayment, GovtRegisters, Settings, VehicleWeight, AutoWeightEntries, PaddyPurchaseRegister, WhatsNew

### Security Fixes
- Wildcard → explicit imports, Dynamic __import__ → static, document.write XSS → safe patterns
- Empty catch → console.error, Test credentials → env vars

## Prioritized Backlog
### P1: Quality Test Report Register, Monthly Return Auto-generation
### P3: Triple backend code deduplication, Remaining array-index-as-key fixes

## Permanent Rules
1. Version in `utils/constants-version.js` + 3x package.json + WhatsNew.jsx
2. Parity: `python3 /app/scripts/check-parity.py` + `bash /app/scripts/sync-js-routes.sh`
3. Hindi/Hinglish communication only
4. New tab components → use React.lazy() in App.js
