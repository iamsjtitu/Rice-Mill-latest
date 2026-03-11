# Mill Entry System - Product Requirements Document

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with React frontend, Python/FastAPI backend (web), and two Node.js backends (desktop + local-server). User communicates in Hindi.

## Core Architecture
```
/app
├── shared/              # Shared config for all backends
├── backend/             # Python/FastAPI (MongoDB)
├── desktop-app/         # Node.js/Electron (JSON)
├── local-server/        # Node.js/Express (JSON, synced from desktop-app)
├── frontend/            # React (shared UI)
└── sync_backends.sh
```

## Credentials
- Admin: `admin` / `admin123`

## Completed Features
- Agent & Mandi Report, Sorting, Gunny bag cleanup
- Private Trading: Paddy Purchase, Rice Sale, Party Summary tabs
- Shared Config for 10 reports, Daily Report refactor
- CMR Paddy Stock: `QNTL - BAG - P.Cut` + private paddy
- Pvt Paddy Payment Flow (Cash/Diesel→Truck, Advance→Party Ledger+CashBook)
- Truck Payments: "Pvt" badge, full payment actions
- Party Ledger Export: [Pvt] tag
- Delete Cascade: private paddy→truck_payments→cash_transactions
- CashBook Party Summary beautified (gradient cards, badges)
- Party Summary click navigation (Pvt Trading→CashBook)
- **Description Format (2026-03-11):** `{party} - {mandi} - {qntl} @ Rs.{rate}`, Advance: `Advance - {qntl} @ Rs.{rate}`
- **Mark Paid / Undo Paid / Payment History (2026-03-11):**
  - `POST /api/private-paddy/{id}/mark-paid` - fully paid, creates cash+ledger entries
  - `POST /api/private-paddy/{id}/undo-paid` - resets all payments, deletes linked
  - `GET /api/private-paddy/{id}/history` - payment history from private_payments
  - UI: ✓ Mark Paid (amber), ↶ Undo (red), ⏰ History (purple) buttons
  - PAID badge on balance column, conditional button visibility
  - History dialog with payment list

## Key Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/private-paddy` | GET/POST | Paddy CRUD |
| `/api/private-paddy/{id}/mark-paid` | POST | Mark fully paid (admin) |
| `/api/private-paddy/{id}/undo-paid` | POST | Reset payments (admin) |
| `/api/private-paddy/{id}/history` | GET | Payment history |
| `/api/private-payments` | POST | Individual payment |
| `/api/private-payments/fix-old-entries` | GET | Migration endpoint |

## Key Files
- `backend/routes/private_trading.py` - All pvt paddy logic + mark/undo/history
- `desktop-app/routes/private_trading.js` - Node.js synced logic
- `frontend/src/components/PrivateTrading.jsx` - 3 tabs, all payment UI
- `frontend/src/components/cashbook/PartySummaryTab.jsx` - Beautified UI

## Backlog
- P2: Code cleanup & refactoring (reduce Python/Node.js duplication)
