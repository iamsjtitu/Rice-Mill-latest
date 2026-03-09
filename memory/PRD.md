# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool with comprehensive entry tracking, payment management, and reporting. Supports 3 backends (Python/FastAPI, Node.js local-server, Electron desktop-app) with a React frontend.

## What's Been Implemented

### Core Features
- Local Party Payment System, Mill Entry Excel Import (formula support)
- Mill Parts Stock (Search, Edit, Stock Preview), Cash Book (Balance Preview)
- Auto Cutting % from Mandi Target, Party-wise Report, DC Tracker, Gunny Bags, Diesel Account

### Recent Changes (March 2026)
- **P&L Summary removed** from Dashboard
- **Daily Report enhanced**: Summary shows Total Mill W (QNTL), Total BAG, Final W. QNTL (Auto)
- **Daily Report detail view**: ALL entry columns (Truck, Agent, Mandi, RST, TP No, QNTL, Bags, Mill W, Cut%, P.Pkt, P.Pkt Cut, Final W, G.Issued, Cash, Diesel)
- **Cash Book**: Select All & Delete Selected (bulk delete)
- **Diesel Account**: Select All & Delete Selected (bulk delete)
- **Excel/PDF exports**: P.Pkt and P.Pkt Cut columns added, A4 optimized
- **Diesel Account ₹50,000 bug fixed**: Summary cards only show on Truck/Agent tabs
- **Excel Import formula fix**: ExcelJS formula object handling for Node.js backends
- **Cutting % auto-fill improved**: useEffect watcher + mandi target name merge into suggestions

### CRITICAL BUILD PROCESS
```
cd /app/frontend && REACT_APP_BACKEND_URL="" yarn build
cp -r /app/frontend/build /app/desktop-app/frontend-build
cp -r /app/frontend/build /app/local-server/public
```

## Key API Endpoints
- `POST /api/cash-book/delete-bulk` - Bulk delete cash transactions
- `POST /api/diesel-accounts/delete-bulk` - Bulk delete diesel transactions
- `GET /api/reports/daily?date=&mode=detail` - Enhanced daily report with all fields

## Backlog
- P2: Refactor desktop-app/main.js into modular route files

## Credentials
- Admin: admin / admin123 | Staff: staff / staff123
