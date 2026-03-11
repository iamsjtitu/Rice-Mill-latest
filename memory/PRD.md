# Mill Entry System - Product Requirements Document

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with React frontend, Python/FastAPI backend (web), and two Node.js backends (desktop + local-server). User communicates in Hindi.

## Core Architecture
```
/app
├── shared/                    # Shared config for all backends
│   ├── report_config.json     # Column definitions (single source of truth)
│   └── report_helper.js       # Node.js helper functions
├── backend/                   # Python/FastAPI (MongoDB)
│   └── utils/report_helper.py # Python helper (reads shared config)
├── desktop-app/               # Node.js/Electron (JSON)
├── local-server/              # Node.js/Express (JSON)
├── frontend/                  # React (shared UI)
└── sync_backends.sh           # Sync script (desktop-app -> local-server)
```

## Shared Config System
- `/app/shared/report_config.json` - Column definitions for 4 reports:
  - agent_mandi_report (15 cols)
  - gunny_bags_report (9 cols)
  - dc_entries_report (9 cols)
  - msp_payments_report (8 cols)
- Python reads via `utils/report_helper.py`, Node.js via `shared/report_helper.js`
- To change columns: edit `report_config.json` only
- Run `bash sync_backends.sh` to sync desktop-app -> local-server

## Key Schema Notes
- **Gunny Bags**: Uses `txn_type` (in/out), `quantity`, `source`, `reference` (NOT transaction_type/bags)
- **Auto entries**: Created with `is_auto_entry: True`, `linked_entry_id` 
- **Mill entries auto-create**: BAG->IN, g_issued->OUT (bag_type=old)

## Sorting
All LIST endpoints sort `(date DESC, created_at DESC)` - newest entry always first

## Credentials
- Admin: `admin` / `admin123`

## Completed (11-Mar-2026)
- Fixed Agent & Mandi Report column misalignment (G.Iss after G.Dep)
- PDF/Excel export respects expanded mandis filter, Grand Total scoped
- Shared config system for 4 reports (agent_mandi, gunny_bags, dc_entries, msp_payments)
- Sorting fix: ALL list endpoints sort newest first across all 3 backends
- Old gunny bag entries cleanup: Deleted broken entries, recreated with correct schema
- Node.js backends fully synced via sync script
- Frontend build updated in desktop-app

## Backlog
- None pending
