# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool. 3 backends (Python/FastAPI, Node.js local-server, Electron desktop-app), React frontend.

## Implemented Features

### Daily Report (Enhanced March 2026)
- Summary: Total Mill W (QNTL), Total BAG, Final W. QNTL (Auto), Total Bag Deposite, Total Bag Issued, Total Cash Paid, Total Diesel Paid
- Detail: All entry columns (Truck, Agent, Mandi, RST, TP No, QNTL, Bags, G.Dep, GBW Cut, Mill W, Cut%, P.Pkt, P.Pkt Cut, Final W, G.Issued, Cash, Diesel)
- Pump Account section showing diesel/pump transactions for the day
- Excel/PDF exports with P.Pkt, P.Pkt Cut, G.Dep columns, A4 optimized

### Other Features
- Local Party Payment System, Mill Entry Excel Import (formula support)
- Cash Book & Diesel: Select All + Delete Selected (bulk delete)
- Auto Cutting % from Mandi Target, Party-wise Report
- Mill Parts Stock (Search, Edit, Stock Preview)

### CRITICAL BUILD PROCESS
```
cd /app/frontend && REACT_APP_BACKEND_URL="" yarn build
cp -r /app/frontend/build /app/desktop-app/frontend-build
cp -r /app/frontend/build /app/local-server/public
```

## Backlog
- P2: Refactor desktop-app/main.js into modular route files

## Credentials
- Admin: admin / admin123 | Staff: staff / staff123
