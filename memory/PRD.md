# Mill Entry System - Product Requirements Document

## Original Problem Statement
Rice mill management tool ("Mill Entry System") with React frontend, Python/FastAPI backend, two Node.js backends. User communicates in Hindi.

## Credentials
- Admin: `admin` / `admin123`

## Completed Features
- Agent & Mandi Report, Sorting, Gunny bag cleanup, Shared Config (10 reports)
- CMR Paddy Stock: `QNTL - BAG - P.Cut` + private paddy
- Private Trading: Paddy Purchase, Rice Sale, Party Summary tabs
- **Pvt Paddy Payment Flow**: Cash/Diesel → Truck Payment + Cash Book, Advance → Party Ledger
- **Rice Sale Payment Flow (2026-03-11)**: 
  - RST No field (searchable), Cash Paid, Diesel Paid fields
  - Cash/Diesel → Truck Payment page (auto) + Cash Book nikasi
  - Total Amount → Party Ledger jama entry
  - Edit re-creates linked entries, Delete cascades all linked entries
- **Mark Paid / Undo Paid / Payment History**: Both Paddy Purchase & Rice Sale
- Description Format: `{party} - {qty} @ Rs.{rate}`
- Truck Payments: CMR + Pvt Paddy + Rice Sale entries
- CashBook Party Summary beautified, Party click navigation

## Rice Sale Financial Flow
| Event | Cash Book | Truck Ledger | Party Ledger | Diesel Account |
|-------|-----------|-------------|--------------|----------------|
| Total Amount | - | - | jama (party) | - |
| Cash Paid | nikasi (truck) | nikasi (truck) | - | - |
| Diesel Paid | - | nikasi (truck) | - | debit |
| ₹ Payment | jama (party) | - | jama (party) | - |

## Key Files
- `backend/routes/private_trading.py` - All pvt trading + rice sale logic
- `backend/routes/payments.py` - Truck payments (CMR + Pvt + Rice Sale)
- `frontend/src/components/PrivateTrading.jsx` - 3 tabs, forms, payment UI

## Backlog
- P2: Code cleanup & refactoring (reduce Python/Node.js duplication)
