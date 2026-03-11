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
│   └── routers/               # API route modules
├── desktop-app/               # Node.js/Electron (JSON)
├── local-server/              # Node.js/Express (JSON)
├── frontend/                  # React (shared UI)
└── sync_backends.sh           # Sync script (desktop-app -> local-server)
```

## Credentials
- Admin: `admin` / `admin123`

## Completed Features (All Sessions)
- Agent & Mandi Report, Application-wide sorting, Gunny bag cleanup
- Private Trading Page Overhaul
- Shared Config for all reports (10 reports total)
- G.Issued, Cash Paid, Diesel Paid fields + Auto Gunny Bag entries
- Select-all checkbox + bulk delete
- CMR Paddy Stock: `QNTL - BAG - P.Cut` + private paddy (NOT custody)
- **Pvt Paddy Payment Flow (2026-03-11):**
  - Cash + Diesel -> Truck Payment (category=truck_no, party_type="Truck")
  - Advance (paid_amount) -> Party Ledger credit + Cash Book nikasi
  - Cash/Diesel removed from Party Ledger
  - Cash Book: cash under truck + advance under party
  - Diesel Account entry created
  - Full cascade on CRUD
- **Daily Report Shared Config** (2026-03-11): PDF/Excel uses report_config.json
- Migration script for existing entries backfilled
- Bug fix: empty string float conversion on edit
- **Party Summary Tab Removed (2026-03-11):** Backend endpoint deleted, frontend cleaned up, only Paddy Purchase & Rice Sale tabs remain
- Truck Payments: Pvt Paddy entries with "Pvt" badge, full payment actions
- Party Ledger Export: [Pvt] tag in PDF/Excel
- Delete Cascade: private paddy delete removes linked truck_payments

## Pvt Paddy Payment Flow Summary
| Payment | Cash Book | Truck Ledger | Party Ledger | Diesel Account |
|---------|-----------|-------------|--------------|----------------|
| Cash    | nikasi (truck) | nikasi (truck) | - | - |
| Diesel  | - | nikasi (truck) | - | debit |
| Advance | nikasi (party) | - | credit | - |

## Key Files
- `frontend/src/components/PrivateTrading.jsx` - Private Trading page (Paddy Purchase + Rice Sale tabs)
- `backend/routers/private_trading.py` - Private paddy CRUD with financial side-effects
- `backend/routers/payments.py` - Truck payments (CMR + Pvt Paddy)
- `backend/routers/ledgers.py` - Party Ledger with [Pvt] tags
- `backend/routers/reports.py` - Daily Report using shared config
- `desktop-app/routes/private_trading.js` - Node.js sync of private trading logic
- `desktop-app/routes/daily_report.js` - Node.js daily report with shared config

## Backlog
- P2: General code cleanup & refactoring (reduce duplication between Python and Node.js backends)
