# Mill Entry System - PRD

## Original Problem Statement
A comprehensive Mill Entry System (NAVKAR AGRO) for rice mill operations - tracking paddy purchases, milling, rice sales, payments, diesel, truck logistics, and complete accounting (Cash Book / Ledger / Party Summary).

## Core Architecture
- **Frontend**: React (Port 3000) - Dark theme mill management dashboard
- **Backend**: Python FastAPI (Port 8001) - `/app/backend/`
- **Desktop**: Node.js Electron app - `/app/desktop-app/`
- **Database**: MongoDB (test_database)

## Sale Book Accounting Logic (CRITICAL)
- **Cash Paid** = Cash given to truck driver → Cash NIKASI
- **Diesel Paid** = Diesel from pump (default: Titu Fuels) → Diesel Pump JAMA
- **Cash + Diesel** = Truck payment → Truck JAMA + Truck NIKASI
- **Advance** = Payment received FROM party → Party NIKASI (reduces debt)
- **Balance** = Total - Advance (NOT total - cash - diesel)
- **Party Ledger** = Sale amount JAMA (party owes us)

## Key Features
- All original features (Mill Entry, DC Tracker, Private Trading, Cash Book, etc.)
- **Sale Book**: Tally-style with Invoice No, multi-items, GST, Advance, Truck, Search, PDF/Excel export
- **GST Settings**: Configurable CGST/SGST/IGST
- **Opening Balance**: Cash/Bank/Ledger in both CashBook and SaleBook
- **CashBook Party Type Dropdown**: Manual override
- **By-product → Party Ledger**: Auto entries with Sale Book stock deduction

## API Endpoints (Sale Book)
- `GET/POST /api/sale-book` - List/Create with search filter
- `PUT /api/sale-book/{id}` - Edit (recreates ledger entries)
- `DELETE /api/sale-book/{id}` - Delete (cleans all linked entries)
- `GET /api/sale-book/stock-items` - Available stock
- `GET /api/sale-book/export/pdf` - A4 professional PDF
- `GET /api/sale-book/export/excel` - A4 landscape Excel
- `GET/PUT /api/gst-settings` - GST configuration
- `GET/POST/DELETE /api/opening-balances` - Opening balances

## Credentials
- Admin: admin / admin123

## Backlog
- P2: Desktop app sync for Sale Book routes
- P2: GST fields in existing forms (Rice Sale, Paddy Purchase)
- P3: Consolidate Python/Node.js backend duplicate logic
