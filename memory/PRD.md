# Mill Entry System - Product Requirements Document

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with React frontend, Python/FastAPI backend (web), and two Node.js backends (desktop + local-server). User communicates in Hindi.

## Core Architecture
```
/app
├── shared/                    # Shared config for all backends
│   ├── report_config.json     # Column definitions (single source of truth)
│   ├── report_helper.js       # Node.js helper (supports subkey)
│   └── (Python helper at backend/utils/report_helper.py)
├── backend/                   # Python/FastAPI (MongoDB)
│   └── routes/                # API route modules
├── desktop-app/               # Node.js/Electron (JSON)
├── local-server/              # Node.js/Express (JSON)
├── frontend/                  # React (shared UI)
└── sync_backends.sh           # Sync script (desktop-app -> local-server)
```

## Credentials
- Admin: `admin` / `admin123`

## Completed Features
- Agent & Mandi Report, Application-wide sorting, Gunny bag cleanup
- Private Trading Page: Paddy Purchase, Rice Sale, Party Summary tabs
- Shared Config for all reports (10 reports total)
- CMR Paddy Stock: `QNTL - BAG - P.Cut` + private paddy
- Pvt Paddy Payment Flow with full cascade on CRUD
- Daily Report Shared Config
- Truck Payments: Pvt Paddy entries with "Pvt" badge
- Party Ledger Export: [Pvt] tag
- Delete Cascade: private paddy delete removes linked entries
- Party Summary Click Navigation (Pvt Trading → Cash Book)
- CashBook Party Summary Beautified
- **Description Format Fix (2026-03-11):**
  - All pvt paddy cash/ledger entries now show: `{party} - {mandi} - {qntl} @ Rs.{rate}`
  - Advance entries: `Advance - {qntl} @ Rs.{rate}`
  - Rate auto-calculated from `total_amount / qntl` when not stored
  - Clean number formatting (50 not 50.0, 1600 not 1600.0)
  - Migration endpoint updated all old entries
  - Node.js backend synced

## Key Description Format
| Entry Type | Description Format |
|-----------|-------------------|
| Cash/Diesel payment | `Raju - Nanu - 50 @ Rs.1600` |
| Advance | `Advance - 50 @ Rs.1600` |
| ₹ button payment | `Amit - Kullu - 500 @ Rs.1579.67` |
| Deleted ref entry | `Raju - Rs.729208` (fallback) |

## Key Files
- `backend/routes/private_trading.py` - `_fmt_detail()` helper, all CRUD + payments
- `desktop-app/routes/private_trading.js` - `_fmtDetail()` helper, synced logic
- `frontend/src/components/PrivateTrading.jsx` - 3 tabs with navigation
- `frontend/src/components/cashbook/PartySummaryTab.jsx` - Beautified UI

## Backlog
- P2: Code cleanup & refactoring (reduce Python/Node.js duplication)
