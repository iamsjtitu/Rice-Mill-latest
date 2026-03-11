# Mill Entry System - Product Requirements Document

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with React frontend, Python/FastAPI backend (web), and two Node.js backends (desktop + local-server). User communicates in Hindi.

## Core Architecture
```
/app
├── backend/          # Python/FastAPI (MongoDB)
├── desktop-app/      # Node.js/Electron (JSON)
├── local-server/     # Node.js/Express (JSON)
└── frontend/         # React (shared UI)
```

## Implemented Features (Mar 2026)

### Modules
- Mill Entry CRUD, Cash Book, DC & Payments, Payments (Truck/Owner/Agent/Diesel/Local Party/Gunny Bags)
- Agent & Mandi Report (with all columns: QNTL, BAG, G.Dep, GBW, P.Pkt, P.Cut, Mill W, M%, M.Cut, C%, D/D/P, Final W, G.Iss, Cash, Diesel)
- Mandi Target Management (DB-driven), Private Purchase module
- Excel Import, Telegram integration

### Auto Entries on Mill Entry Create/Update/Delete
- Cash Book entries (jama/nikasi), Diesel Account, Gunny Bag (BAG→IN, g_issued→OUT)

### Gunny Bag Logic
- Auto entries: BAG=IN, g_issued=OUT (bag_type=old), g_deposite=ignored
- Old Bags (Market) card = manual entries only, Auto badge on auto entries
- Total (Excl Govt) = All old bags IN - OUT, G.Issued total card
- Filters: Type (All/Mill/Market/Govt) + IN/OUT, applied to PDF/Excel exports

### Agent & Mandi Report
- Target based on Final W (QNTL): actual_final_qntl = total_final_w / 100, extra = actual - target
- All 15 data columns in table, PDF, and Excel exports
- Pvt Purchase move feature for excess quantity

## Credentials
- Admin: `admin` / `admin123`

## Backlog
- None pending
