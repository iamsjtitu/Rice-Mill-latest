# Mill Entry System - Product Requirements Document

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with React frontend, Python/FastAPI backend (web), and two Node.js backends (desktop + local-server). User communicates in Hindi.

## Core Architecture
```
/app
├── shared/                    # Shared config for all backends
│   ├── report_config.json     # Column definitions (single source of truth)
│   ├── report_helper.js       # Node.js helper functions
│   └── (Python helper at backend/utils/report_helper.py)
├── backend/                   # Python/FastAPI (MongoDB)
│   └── routes/                # API route modules
├── desktop-app/               # Node.js/Electron (JSON)
├── local-server/              # Node.js/Express (JSON)
├── frontend/                  # React (shared UI)
└── sync_backends.sh           # Sync script (desktop-app -> local-server)
```

## Key Collections (MongoDB)
- private_paddy, rice_sales, private_payments, entries, cash_transactions, gunny_bags, mandi_targets, dc_payments, staff, users, settings

## Credentials
- Admin: `admin` / `admin123`

## Completed Features
- Agent & Mandi Report: column alignment, filtered PDF/Excel exports
- Application-wide sorting (newest first via compound sort)
- Gunny bag data cleanup + move-to-pvt fix
- Removed Outstanding tab + Fixed Final Wt Kg->QNTL bug
- Private Trading Page Overhaul (separate cols, balance fix, exports, search)
- Party-wise Summary Tab (aggregated view, date range filter, exports)
- Shared Config Extension to Cash Book + Party Ledger (10 reports total)
- **G.Issued, Cash Paid, Diesel Paid** fields in Pvt Paddy form/table/exports
- **Auto Gunny Bag entries**: BAG→IN, G.Issued→OUT (linked_entry_id for cascading delete/update)
- **Select-all checkbox + bulk delete** for Paddy Purchase and Rice Sale tables
- All 3 backends synced

## Shared Config Reports (10 total)
agent_mandi_report, gunny_bags_report, dc_entries_report, msp_payments_report, private_paddy_report (14 cols), rice_sales_report, party_summary_report, cashbook_report, party_ledger_report, daily_paddy_entries_report (config only)

## Backlog
- P2: General code cleanup (style fixes, unused imports)
- Daily Report refactoring to shared config (complex, deferred)
