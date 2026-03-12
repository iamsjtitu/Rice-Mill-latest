# Mill Entry System - PRD

## Original Problem Statement
NAVKAR AGRO Mill Entry System - Comprehensive rice mill management with paddy purchase tracking, milling, cash book, payments, ledgers, private trading, sale book (vouchers), GST settings, staff management.

## Core Architecture
- **Frontend**: React (CRA) + Tailwind CSS + shadcn/ui
- **Backend**: FastAPI (Python) + MongoDB
- **Desktop**: Electron app wrapper
- **Language**: Hindi (UI and user communication)

## Menu Order (as of Mar 2026)
Entries → Dashboard & Targets → Milling (CMR) → DC (Payments) → Vouchers → Cash Book & Ledgers → Payments → Reports → Mill Parts → Staff → FY Summary → Settings

## What's Been Implemented

### Core Modules
1. **Mill Entries** - CRUD with filters, bulk operations, Excel/PDF exports
2. **Dashboard & Targets** - Mandi targets, KMS year tracking
3. **Milling (CMR)** - Milling tracker with by-product management
4. **DC (Payments)** - DC tracker with truck payment management
5. **Vouchers Tab** (5 sub-tabs):
   - Sale Vouchers: Tally-style sales, GST, ₹ payment button, Print Invoice
   - Purchase Vouchers: Custom item purchase, auto accounting, ₹ payment button
   - Paddy Purchase: Weight calculations, payment tracking
   - Stock Summary: All stocks (Paddy, Rice, By-products, FRK, Custom, Gunny Bags) + category filter
   - Party Summary: 3 sections (Sale, Purchase, Paddy)
6. **Cash Book & Ledgers** - Full cash book with party ledger, opening balance
7. **Payments** - Truck payments, agent payments, MSP payments, Gunny Bags
8. **Reports** - Various report generation
9. **Mill Parts, Staff, FY Summary, Settings, GST**

### Accounting Sync Features
- ₹ Payment button on all voucher types (Sale/Purchase/Gunny)
- Payment auto-creates: Cash Book entry + Party Ledger entry + Local Party Accounts entry
- Voucher creation auto-creates Local Party Accounts entries (debit + advance)
- Cross-system sync: any payment source updates all ledgers

### Gunny Bags (Enhanced)
- Purchase form: Invoice No, Truck No, RST No, Party Name, separate CGST%/SGST%, Advance
- Auto accounting (Party Ledger + Cash Book + Local Party)
- Stock Summary integration (Raw Material category)
- **Purchase Report**: Party-wise summary with GST breakup (Excel + PDF)

### Sale Voucher Print Invoice
- Professional A4 HTML invoice with company branding, line items, GST breakup, payment details

## Key API Endpoints
- `POST /api/voucher-payment` - Universal payment for any voucher type
- `GET /api/sale-book/invoice/{id}` - HTML invoice
- `GET /api/gunny-bags/purchase-report` - Party-wise purchase summary with GST
- `GET /api/gunny-bags/purchase-report/excel|pdf` - Export purchase report
- All standard CRUD endpoints for entries, vouchers, payments, etc.

## Key Files
- `backend/routes/voucher_payments.py` - Payment system + Sale Invoice
- `backend/routes/dc_payments.py` - Gunny bags CRUD + Purchase Report
- `backend/routes/salebook.py` - Sale voucher + local party sync
- `backend/routes/purchase_vouchers.py` - Purchase voucher + stock summary
- `frontend/src/App.js` - Main layout with reordered menu
- `frontend/src/components/DCTracker.jsx` - Gunny Bags enhanced component
- `frontend/src/components/SaleBook.jsx` - Sale voucher with payment + invoice
- `frontend/src/components/PurchaseVouchers.jsx` - Purchase voucher with payment

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Data Status
- All data cleared (user requested fresh start for testing)
- Admin user preserved
