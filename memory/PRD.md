# Rice Mill Management System - PRD

## Current Version: v90.3.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind (React.lazy + Suspense)
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + SQLite/JSON
- **Backend (Local)**: Express + SQLite/JSON

## What's Been Implemented
- Mill Entry CRUD, Cash Book, Private Paddy Purchase, Sale/Purchase Vouchers, DC Tracker, Milling Tracker
- Staff Management, Hemali, Rice Sales, Truck Lease, Diesel, Mill Parts, Government Registers
- Dynamic By-Product Categories, Reports, FY Summary, Balance Sheet, Quick Search, PDF/Excel export
- Multi-user RBAC, WhatsApp/Telegram, Camera, GST Ledger/Audit Log

## Code Quality Status (v90.3.0)

### Wildcard Imports: ZERO remaining
All 11 route files now use explicit imports from models.py

### Empty Catch Blocks: ALL fixed
useFilters.js, CameraSetupTab.jsx, MessagingTab.jsx, WatermarkTab.jsx, WeighbridgeTab.jsx, download.js, useMessagingEnabled.js - all have console.error logging

### Array Index Keys: Fixed (20+ instances)
MessagingTab (4), BrandingTab (7), DailyReport (4), SaleBook (3), Ledgers (2)

### useMemo: Applied
Payments.jsx - truckTotals, agentTotals, consolidatedTotals, truckWiseConsolidated, consolidatedTruckList

### Security
- document.write XSS → safe doc reference (6 files)
- Test credentials → env vars (5 test files)
- Dynamic __import__ → static (2 files)

### Component Splitting
| File | Original | Final |
|------|----------|-------|
| App.js | 1709 | 1136 |
| Reports.jsx | 1391 | 38 |
| Payments.jsx | 2036 | 1732 |
| cashbook.py | 1754 | 1618 |

### Lazy Loading: 17 components on-demand

## Prioritized Backlog
### P1: Quality Test Report Register, Monthly Return Auto-generation
### P3: Triple backend code deduplication, Remaining array-index-as-key fixes (~20)

## Permanent Rules
1. Version in utils/constants-version.js + 3x package.json + WhatsNew.jsx
2. Parity: python3 /app/scripts/check-parity.py + bash /app/scripts/sync-js-routes.sh
3. Hindi/Hinglish communication only
4. New tab components → use React.lazy() in App.js
5. No wildcard imports - always explicit from models
