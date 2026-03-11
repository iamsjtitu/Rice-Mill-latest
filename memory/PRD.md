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

## Shared Config Reports (report_config.json)
| Report | Columns | Python | Node.js | Status |
|--------|---------|--------|---------|--------|
| agent_mandi_report | 18 | reports.py | daily_report.js | Done |
| gunny_bags_report | 5 | reports.py | daily_report.js | Done |
| dc_entries_report | 7 | reports.py | daily_report.js | Done |
| msp_payments_report | 6 | reports.py | daily_report.js | Done |
| private_paddy_report | 11 | private_trading.py | private_trading.js | Done |
| rice_sales_report | 9 | private_trading.py | private_trading.js | Done |
| party_summary_report | 10 | private_trading.py | private_trading.js | Done |
| cashbook_report | 10 | cashbook.py | cashbook.js | Done |
| party_ledger_report | 7 | ledgers.py | - | Done |
| daily_paddy_entries | 9+20 | - | daily_report.js | Config only |

## Credentials
- Admin: `admin` / `admin123`

## Completed
- Agent & Mandi Report: column alignment, filtered PDF/Excel exports
- Sorting fix across all backends (newest first)
- Gunny bag data cleanup
- Move to Pvt Trading with correct logic
- Removed Outstanding tab from Party Ledger
- Fixed Final Wt Kg->QNTL display bug
- Private Trading Page Overhaul (separate cols, balance fix, exports, search)
- Party-wise Summary Tab (aggregated view, date range filter, exports)
- Shared Config Extension to Cash Book + Party Ledger (P1 complete)
- Node.js backend sync via sync_backends.sh

## Backlog
- P2: General code cleanup (style fixes, unused imports)
- Daily Report Excel/PDF refactoring to use shared config (complex, deferred)
