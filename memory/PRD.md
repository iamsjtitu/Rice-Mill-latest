# Mill Entry System - PRD

## Original Problem Statement
A comprehensive Mill Entry System (NAVKAR AGRO) for rice mill operations - tracking paddy purchases, milling, rice sales, payments, diesel, truck logistics, and complete accounting (Cash Book / Ledger / Party Summary).

## Core Architecture
- **Frontend**: React (Port 3000) - Dark theme mill management dashboard
- **Backend**: Python FastAPI (Port 8001) - `/app/backend/`
- **Desktop**: Node.js Electron app - `/app/desktop-app/`
- **Database**: MongoDB (test_database)

## Key Features Implemented
- Mill Entry CRUD with auto-calculations
- DC Tracker (Government deliveries)
- Private Trading (Paddy Purchase + Rice Sale)
- Cash Book (Cash/Bank/Ledger with double-entry)
- Party Ledger with auto jama/nikasi
- Staff Management, FRK Purchase & Stock
- By-Product Stock & Sales (with auto party ledger + Sale Book deduction)
- Dashboard with stock widgets (Paddy/Rice)
- Milling Tracker with CMR calculations
- PDF/Excel exports across all modules
- Telegram notifications, FY Summary & Opening Balance
- **Sale Book** (Tally-style multi-item vouchers with GST, Edit, PDF export)
- **GST Settings** (CGST/SGST/IGST configurable)
- **Opening Balance** (Cash/Bank/Ledger - in both CashBook and SaleBook)
- **CashBook Party Type Dropdown** (manual override)

## API Endpoints (Key)
- `/api/sale-book` - GET/POST/PUT/DELETE sale vouchers
- `/api/sale-book/stock-items` - Available stock for all items
- `/api/sale-book/export/pdf` - PDF export
- `/api/gst-settings` - GET/PUT GST configuration
- `/api/opening-balances` - GET/POST/DELETE opening balances
- `/api/cash-book/fix-empty-party-types` - Fix historical empty party types
- `/api/byproduct-stock` - Now deducts Sale Book sales

## Recent Changes (March 2026 - Session 2)
1. Rice Type dropdown: Only Usna/Raw, type-specific stock display
2. Party Type auto-detect permanent fix with "Cash Party" fallback
3. Sale Book: full CRUD + Edit + PDF export + stock deduction from by-products
4. GST: configurable CGST/SGST/IGST in Settings + Sale Book form
5. Opening Balance: Cash/Bank/Ledger in both CashBook and SaleBook
6. CashBook: Party Type manual dropdown
7. By-product sales auto-create party ledger entries

## Credentials
- Admin: admin / admin123

## Backlog
- P2: Consolidate Python/Node.js backend duplicate business logic
- P3: Desktop app sync for Sale Book routes
- P3: GST fields in existing forms (Rice Sale, Paddy Purchase, By-Product)
