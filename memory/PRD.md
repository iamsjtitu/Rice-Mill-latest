# Mill Entry System - Product Requirements Document

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with React frontend, Python/FastAPI backend (web), and two Node.js backends (desktop + local-server). User communicates in Hindi.

## Core Architecture
```
/app
├── shared/                    # Shared config for all backends
│   ├── report_config.json     # Column definitions (single source of truth)
│   ├── report_helper.js       # Node.js helper (now supports subkey param)
│   └── (Python helper at backend/utils/report_helper.py)
├── backend/                   # Python/FastAPI (MongoDB)
│   └── routes/                # API route modules
├── desktop-app/               # Node.js/Electron (JSON)
├── local-server/              # Node.js/Express (JSON)
├── frontend/                  # React (shared UI)
└── sync_backends.sh           # Sync script (desktop-app -> local-server)
```

## Key Collections (MongoDB)
- private_paddy, rice_sales, private_payments, entries, cash_transactions, gunny_bags, mandi_targets, dc_payments, staff, users, settings, milling_entries, frk_purchases, byproduct_sales, diesel_accounts

## Credentials
- Admin: `admin` / `admin123`

## Completed Features (All Sessions)
- Agent & Mandi Report: column alignment, filtered PDF/Excel exports
- Application-wide sorting (newest first)
- Gunny bag data cleanup + move-to-pvt fix
- Removed Outstanding tab + Fixed Final Wt Kg->QNTL bug
- Private Trading Page Overhaul (separate cols, balance fix, exports, search)
- Party-wise Summary Tab (aggregated view, date range filter, exports)
- Shared Config Extension to Cash Book + Party Ledger (10 reports total)
- G.Issued, Cash Paid, Diesel Paid fields in Pvt Paddy form/table/exports
- Auto Gunny Bag entries: BAG->IN, G.Issued->OUT (linked cascading)
- Select-all checkbox + bulk delete for Paddy Purchase and Rice Sale tables
- CMR Paddy Stock Formula: `QNTL - BAG - P.Cut` + private paddy (NOT custody)
- **Pvt Paddy → Cash Book + Diesel + Party Ledger** (2026-03-11):
  - Cash Paid auto-creates Cash Book nikasi entry
  - Diesel Paid auto-creates Diesel Account entry
  - Party Ledger: party_type="Pvt Paddy Purchase", party_name="Party - Mandi"
  - Cash/Diesel advances as separate credits in Party Ledger
  - Full cascade on update/delete
- **Migration Script** (2026-03-11): POST /api/private-paddy/migrate-cashbook to backfill existing entries
- **Daily Report Shared Config** (2026-03-11): PDF/Excel paddy entries section now uses report_config.json (summary_mode_columns + detail_mode_columns). Both Python + Node.js refactored.
- All 3 backends synced

## Shared Config Reports (now fully implemented)
agent_mandi_report, gunny_bags_report, dc_entries_report, msp_payments_report, private_paddy_report, rice_sales_report, party_summary_report, cashbook_report, party_ledger_report, **daily_paddy_entries_report** (summary + detail modes)

## Backlog
- P2: General code cleanup (style fixes, unused imports)
- P2: Code deduplication across 3 backends
