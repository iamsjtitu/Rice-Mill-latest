# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool. 3 backends (Python/FastAPI, Node.js local-server, Electron desktop-app), React frontend.

## Implemented Features (Latest Session - March 9, 2026)

### Bug Fixes
- Excel Export data misalignment fixed (P.Pkt, P.Pkt Cut, Mill W columns + totals row)
- Typing Bug on desktop app fixed (badge removal DOM scan + useEffect loops removed)
- PDF Export fixed (uses backend download instead of window.print)
- Excel Import entries not saving on desktop (data.mill_entries → data.entries mismatch)
- Cutting % auto-fill permanent fix (3 sources: mandi targets, existing entries, localStorage)

### New Features
- All columns in entry table: Date, Season, Truck, RST, TP, Agent, Mandi, QNTL, BAG, G.Dep, GBW, P.Pkt, P.Cut, Mill W, M%, M.Cut, C%, D/D/P, Final W, G.Iss, Cash, Diesel
- Date format changed to DD-MM-YYYY across all pages
- Cash/Diesel description: Agent Name → Mandi Name
- Cash/Diesel payment → Truck Owner ledger (not Agent)
- Cash Book Party Ledger: categories auto-create party ledgers, delete syncs
- Daily Report + PDF/Excel: all 20 columns with M%, M.Cut, D/D/P

## Build Process
```
cd /app/frontend && REACT_APP_BACKEND_URL="" yarn build
cp -r /app/frontend/build /app/desktop-app/frontend-build
cp -r /app/frontend/build /app/local-server/public
```

## Desktop Build
```
cd desktop-app && npm run build:win
```

## Credentials
- Admin: admin / admin123 | Staff: staff / staff123

## Backlog
- P2: "Entry not found" on Delete
- P2: Refactor desktop-app/main.js modular routes
