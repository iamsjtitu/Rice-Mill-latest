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

## Key Business Logic

### Target & Excess Calculation
- Target = Base QNTL + Cutting% (e.g., 500 + 5% = 525Q)
- Stored in `mandi_targets` collection with `target_qntl`, `cutting_percent`, `expected_total`
- Extra = max(0, actual_final_w_qntl - expected_total)
- "Move to Pvt Trading" button appears when extra > 0
- Creates entry in `private_paddy` with last truck details, rate entered by user

### Private Trading
- Two sections: Paddy Purchase (buy) and Rice Sale (sell)
- Paddy Purchase: auto-calculations (QNTL, GBW, Mill W, Moisture Cut, Final W)
- Rice Sale: simple qty * rate calculation
- Both support payments, PDF/Excel exports, search filtering
- Entries from "move-to-pvt" include `source: "agent_extra"`, `balance`, `final_qntl`, `kg`

### Gunny Bags Schema
- Uses `txn_type` (in/out), `quantity`, `source`, `reference`
- Auto entries: BAG->IN, g_issued->OUT (bag_type=old)

### Sorting
All LIST endpoints sort `(date DESC, created_at DESC)` - newest first

## Credentials
- Admin: `admin` / `admin123`

## Completed (11-Mar-2026)
- Fixed Agent & Mandi Report column alignment (G.Iss after G.Dep)
- PDF/Excel export respects expanded mandis filter
- Shared config system for 6 reports (agent_mandi, gunny_bags, dc_entries, msp_payments, private_paddy, rice_sales)
- Sorting fix across all backends
- Old gunny bag entries cleanup
- Target calculation fixed: uses expected_total (target + cutting%) not just target
- "Move to Pvt Trading" with last truck details, rate input, duplicate protection
- Removed "Outstanding" tab from Party Ledger
- Fixed Final Wt Kg->QNTL display bug
- **Private Trading Page Overhaul:**
  - Separate columns for Party, Mandi, Agent in the table
  - Balance calculation fixed (was showing 0 for move-to-pvt entries)
  - final_qntl and kg fields added to move-to-pvt entries
  - PDF/Excel export for Paddy Purchase and Rice Sales
  - Search/filter functionality for both sections
  - All 3 backends synced (Python, desktop-app, local-server)
  - DB migration for existing agent_extra entries

## Backlog
- P1: Extend shared configuration system to all other major reports (Daily Report, Cash Book, Party Ledger)
- P2: General code cleanup and refactoring
