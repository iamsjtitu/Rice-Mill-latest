# Mill Entry System - Product Requirements Document

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with React frontend, Python/FastAPI backend (web), and two Node.js backends (desktop + local-server). User communicates in Hindi.

## Core Architecture
```
/app
├── shared/                    # NEW: Shared config for all backends
│   ├── report_config.json     # Column definitions (single source of truth)
│   └── report_helper.js       # Node.js helper functions
├── backend/                   # Python/FastAPI (MongoDB)
│   └── utils/report_helper.py # Python helper (reads shared config)
├── desktop-app/               # Node.js/Electron (JSON)
├── local-server/              # Node.js/Express (JSON)
├── frontend/                  # React (shared UI)
└── sync_backends.sh           # Sync script (desktop-app -> local-server)
```

## Shared Config System (NEW)
- `/app/shared/report_config.json` defines all column definitions for Agent & Mandi Report
- Column order, headers, field names, types, widths all defined in ONE place
- Python backend reads via `utils/report_helper.py`
- Node.js backends read via `shared/report_helper.js`
- To add/remove/reorder columns: edit `report_config.json` only
- Run `bash sync_backends.sh` to sync desktop-app -> local-server

## Implemented Features

### Agent & Mandi Report
- Column order: Date, Truck No, QNTL, BAG, G.Dep, G.Iss, GBW, P.Pkt, P.Cut, Mill W, M%, M.Cut, C%, D/D/P, Final W
- Target based on Final W: actual_final_qntl = total_final_w / 100
- PDF/Excel respects expanded mandis filter (only exports what's expanded)
- Grand Total scoped to filtered mandis only
- Cash/Diesel columns removed
- Synced across all 3 backends via shared config

### Gunny Bag Automation
- Auto entries: BAG=IN, g_issued=OUT (bag_type=old)
- Auto badge, filters (Type + IN/OUT), summary cards
- PDF/Excel exports with filters

### Other Modules
- Mill Entry CRUD, Cash Book, DC & Payments
- Payments (Truck/Owner/Agent/Diesel/Local Party/Gunny Bags)
- Mandi Target Management, Private Purchase
- Excel Import, Telegram integration

## Credentials
- Admin: `admin` / `admin123`

## Completed (11-Mar-2026)
- Fixed Agent & Mandi Report column misalignment (G.Iss after G.Dep)
- PDF/Excel export filter: only expanded mandis exported, Grand Total scoped
- **Shared config system**: report_config.json + helpers for Python & Node.js
- Sync script for desktop-app -> local-server
- All 3 backends refactored to use shared config
- Frontend build updated in desktop-app

## Backlog
- P2: Cleanup old Gunny Bag entries (g_deposite logic)
