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

## Completed Features (All Sessions)
- Agent & Mandi Report, Application-wide sorting, Gunny bag cleanup
- Private Trading Page: Paddy Purchase, Rice Sale, Party Summary tabs
- Shared Config for all reports (10 reports total)
- G.Issued, Cash Paid, Diesel Paid fields + Auto Gunny Bag entries
- Select-all checkbox + bulk delete
- CMR Paddy Stock: `QNTL - BAG - P.Cut` + private paddy (NOT custody)
- Pvt Paddy Payment Flow: Cash/Diesel -> Truck Payment, Advance -> Party Ledger + Cash Book
- Daily Report Shared Config: PDF/Excel uses report_config.json
- Migration script for existing entries backfilled
- Bug fix: empty string float conversion on edit
- Truck Payments: Pvt Paddy entries with "Pvt" badge, full payment actions
- Party Ledger Export: [Pvt] tag in PDF/Excel
- Delete Cascade: private paddy delete removes linked truck_payments
- **Party Summary Tab Restored (2026-03-11):** Restored in Private Trading after accidental removal
- **CashBook Party Summary Beautified (2026-03-11):** Enhanced with gradient cards, icons, styled type badges, status pills
- **BUG FIX: Pvt Paddy Payment Cash Book Entries (2026-03-11, P0):**
  - Fixed: payment category was generic "Pvt Paddy Payment" -> now uses actual party name (e.g., "Amit - Kullu")
  - Fixed: party_type was empty -> now "Pvt Paddy Purchase"
  - Added: Ledger entry (account="ledger") created alongside cash entry
  - Migration: fix_old_payment_cashbook_entries endpoint fixed 4 old entries
  - Synced fix to Node.js desktop-app backend
- **Party Summary Click Navigation (2026-03-11):** Clicking party in Pvt Trading Party Summary navigates to Cash Book

## Pvt Paddy Payment Flow Summary
| Payment Source | Cash Book | Truck Ledger | Party Ledger | Diesel Account |
|---------|-----------|-------------|--------------|----------------|
| Cash (at entry) | nikasi (truck) | nikasi (truck) | - | - |
| Diesel (at entry) | - | nikasi (truck) | - | debit |
| Advance (at entry) | nikasi (party) | - | - | - |
| Payment (₹ button) | nikasi (party) | - | nikasi (party ledger) | - |
| Rice Payment (₹) | jama (party) | - | jama (party ledger) | - |

## Key Files
- `frontend/src/components/PrivateTrading.jsx` - Paddy Purchase + Rice Sale + Party Summary tabs
- `frontend/src/components/cashbook/PartySummaryTab.jsx` - CashBook Party Summary (beautified)
- `frontend/src/components/CashBook.jsx` - Cash Book main component
- `backend/routes/private_trading.py` - Private paddy CRUD + payments + financial side-effects
- `backend/routes/payments.py` - Truck payments (CMR + Pvt Paddy)
- `backend/routes/cashbook.py` - Cash Book + Party Summary API
- `desktop-app/routes/private_trading.js` - Node.js sync of private trading logic

## Backlog
- P2: General code cleanup & refactoring (reduce duplication between Python and Node.js backends)
