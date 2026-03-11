# Mill Entry System - Product Requirements Document

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with React frontend, Python/FastAPI backend (web), and two Node.js backends (desktop + local-server). User communicates in Hindi.

## Credentials
- Admin: `admin` / `admin123`

## Completed Features
- Agent & Mandi Report, Sorting, Gunny bag cleanup
- Private Trading: Paddy Purchase, Rice Sale, Party Summary tabs
- Shared Config for 10 reports, Daily Report refactor
- CMR Paddy Stock: `QNTL - BAG - P.Cut` + private paddy
- Pvt Paddy Payment Flow (Cash/Diesel→Truck, Advance→Party Ledger+CashBook)
- Truck Payments: "Pvt" badge, full payment actions
- Party Ledger Export: [Pvt] tag, Delete Cascade
- CashBook Party Summary beautified
- Description Format: `{party} - {mandi} - {qntl} @ Rs.{rate}`
- Mark Paid / Undo Paid / Payment History (Paddy Purchase + Rice Sale)
- **Rice Sale Enhancements (2026-03-11):**
  - RST No field (searchable)
  - Cash Paid / Diesel Paid → auto-creates truck payment + diesel entries
  - Mark Paid / Undo Paid / Payment History (same as Paddy)
  - Edit populates RST, Cash, Diesel fields
  - Delete cascades to cash_transactions, diesel_accounts, private_payments
  - Search includes RST No, party, truck, type

## Key Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rice-sales` | GET/POST | CRUD with rst_no, cash/diesel |
| `/api/rice-sales/{id}/mark-paid` | POST | Mark fully paid (admin) |
| `/api/rice-sales/{id}/undo-paid` | POST | Reset payments (admin) |
| `/api/rice-sales/{id}/history` | GET | Payment history |
| `/api/private-paddy` | GET/POST | Paddy CRUD |
| `/api/private-paddy/{id}/mark-paid` | POST | Mark paid (admin) |
| `/api/private-paddy/{id}/undo-paid` | POST | Undo (admin) |
| `/api/private-paddy/{id}/history` | GET | History |

## Key Files
- `backend/routes/private_trading.py` - All pvt trading logic
- `desktop-app/routes/private_trading.js` - Node.js synced logic
- `frontend/src/components/PrivateTrading.jsx` - 3 tabs, all payment UI

## Backlog
- P2: Code cleanup & refactoring (reduce Python/Node.js duplication)
