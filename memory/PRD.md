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

## Key Business Logic

### Target & Excess Calculation
- Target = Base QNTL + Cutting% (e.g., 500 + 5% = 525Q)
- Stored in `mandi_targets` collection with `target_qntl`, `cutting_percent`, `expected_total`
- Extra = max(0, actual_final_w_qntl - expected_total)
- "Move to Pvt Trading" button appears when extra > 0
- Creates entry in `private_paddy` with last truck details, rate entered by user

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
- Shared config system for 4 reports
- Sorting fix across all backends
- Old gunny bag entries cleanup
- Target calculation fixed: uses expected_total (target + cutting%) not just target
- "Move to Pvt Trading" with last truck details, rate input, duplicate protection
- All synced across 3 backends

## Backlog
- None pending
