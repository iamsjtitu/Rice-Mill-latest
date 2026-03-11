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
- Agent & Mandi Report (columns: Date, Truck, QNTL, BAG, G.Dep, G.Iss, GBW, P.Pkt, P.Cut, Mill W, M%, M.Cut, C%, D/D/P, Final W)
- Mandi Target Management (DB-driven), Private Purchase module
- Excel Import, Telegram integration

### Auto Entries on Mill Entry Create/Update/Delete
- Cash Book entries (jama/nikasi), Diesel Account, Gunny Bag (BAG=IN, g_issued=OUT)

### Gunny Bag Logic
- Auto entries: BAG=IN, g_issued=OUT (bag_type=old), g_deposite=ignored
- Old Bags (Market) card = manual entries only, Auto badge on auto entries
- Total (Excl Govt) = All old bags IN - OUT, G.Issued total card
- Filters: Type (All/Mill/Market/Govt) + IN/OUT, applied to PDF/Excel exports

### Agent & Mandi Report
- Target based on Final W (QNTL): actual_final_qntl = total_final_w / 100, extra = actual - target
- Column order: Date, Truck No, QNTL, BAG, G.Dep, G.Iss, GBW, P.Pkt, P.Cut, Mill W, M%, M.Cut, C%, D/D/P, Final W
- G.Iss correctly positioned after G.Dep in table, Excel, and PDF exports
- Cash and Diesel columns removed
- Pvt Purchase move feature for excess quantity
- Synced across all 3 backends (Python, desktop-app, local-server)

## Credentials
- Admin: `admin` / `admin123`

## Completed Tasks (11-Mar-2026)
- Fixed Agent & Mandi Report column misalignment (P0): G.Iss was at end, moved to after G.Dep
- Fixed Python backend Excel/PDF exports column order
- Synced Node.js backends (desktop-app + local-server) with updated column structure
- Removed Cash/Diesel columns from Node.js PDF/Excel exports
- Added new columns (GBW, P.Pkt, P.Cut, M%, M.Cut, D/D/P) to Node.js exports
- Frontend build copied to desktop-app/frontend-build

## Backlog
- P2: Cleanup old Gunny Bag entries created with g_deposite logic
- P2: Automate multi-backend sync process
