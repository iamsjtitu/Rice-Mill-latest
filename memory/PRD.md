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

## Modules
- Entries, Dashboard & Targets, Payments, Milling (CMR), Cash Book/Ledgers, DC & Payments, Reports, Pvt Trading, Mill Parts, Staff, FY Summary, Settings

## Key Collections (MongoDB)
- private_paddy, rice_sales, private_payments, entries, cash_transactions, gunny_bags, mandi_targets, dc_payments, staff, users, settings

## Credentials
- Admin: `admin` / `admin123`

## Completed Features (11-Mar-2026)
- Agent & Mandi Report: column alignment, filtered PDF/Excel exports
- Shared config system for 7 reports (agent_mandi, gunny_bags, dc_entries, msp_payments, private_paddy, rice_sales, party_summary)
- Application-wide sorting (newest first via compound sort)
- Gunny bag data cleanup
- Target calculation with cutting%
- Move to Pvt Trading with last truck details
- Removed "Outstanding" tab from Party Ledger
- Fixed Final Wt Kg->QNTL display bug
- **Private Trading Page Overhaul:**
  - Separate columns for Party, Mandi, Agent
  - Balance calculation fixed (move-to-pvt entries)
  - PDF/Excel export for Paddy Purchase and Rice Sales
  - Search/filter functionality
- **Party-wise Summary Tab (NEW):**
  - Aggregated view: Paddy Purchase + Rice Sale per party
  - 10 columns: Party, Mandi, Agent, Purchase Amt, Paid(Paddy), Paddy Bal, Sale Amt, Received(Rice), Rice Bal, Net Balance
  - Date range filter (from/to)
  - Party name search
  - PDF/Excel export
  - Summary cards with key totals
  - TOTAL row with aggregation
  - All 3 backends synced

## Backlog
- P1: Extend shared configuration system to remaining reports (Daily Report, Cash Book, Party Ledger)
- P2: General code cleanup and refactoring
