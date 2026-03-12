# Mill Entry System - PRD

## Original Problem Statement
NAVKAR AGRO Mill Entry System - A comprehensive rice mill management application with paddy purchase tracking, milling, cash book, payments, ledgers, private trading, sale book (vouchers), GST settings, staff management, and more.

## Core Architecture
- **Frontend**: React (CRA) + Tailwind CSS + shadcn/ui components
- **Backend**: FastAPI (Python) + MongoDB
- **Desktop**: Electron app wrapper
- **Language**: Hindi (UI and user communication)

## What's Been Implemented

### Completed Features
1. **Mill Entries** - CRUD with filters, bulk operations, Excel/PDF exports
2. **Dashboard & Targets** - Mandi targets, KMS year tracking
3. **Payments** - Truck payments, agent payments, MSP payments, Gunny Bags
4. **Milling (CMR)** - Milling tracker with by-product management
5. **Cash Book / Ledgers** - Full cash book with party ledger, opening balance
6. **DC & Payments** - DC tracker with truck payment management
7. **Reports** - Various report generation
8. **Vouchers Tab** (5 sub-tabs):
   - **Sale Vouchers**: Tally-style sales with GST, multi-part accounting, **₹ payment button**, **print invoice**
   - **Purchase Vouchers**: Any custom item purchase, auto accounting, **₹ payment button**
   - **Paddy Purchase**: Weight calculations, payment tracking
   - **Stock Summary**: All stocks - Paddy, Rice, By-products, FRK, Custom items, Gunny Bags + **category filter**
   - **Party Summary**: Aggregated from sale_vouchers + purchase_vouchers + paddy_purchase
9. **Mill Parts, Staff, FY Summary, Settings, GST, Opening Balance**
10. **Gunny Bags Management** (Enhanced):
    - Full purchase form with Invoice No, Truck No, RST No, Party Name, **separate CGST%/SGST% fields**, Advance
    - Automatic accounting entries (Party Ledger JAMA, Advance NIKASI, Cash NIKASI)
    - **Local Party Accounts** entry auto-created on purchase
    - Integrated into Stock Summary under "Raw Material" category
    - **₹ Payment button** for each purchase entry

### Cross-System Accounting Sync (Mar 2026)
- **Every voucher (Sale/Purchase/Gunny)** now has a ₹ payment button
- Payment from any voucher auto-creates:
  - **Cash Book**: JAMA (cash in for sale) or NIKASI (cash out for purchase/gunny)
  - **Party Ledger**: NIKASI (reduces outstanding)
  - **Local Party Accounts**: Payment entry for tracking
- **Voucher creation** auto-creates:
  - **Local Party Accounts**: Debit entry (for tracking what party owes/owed)
  - **Advance**: Separate payment entry in Local Party

### Sale Voucher Print Invoice
- Professional A4 HTML invoice with company branding
- Line items, GST breakup, payment details, balance due
- Opens in new tab for browser printing

## Key Database Collections
- `mill_entries`, `milling_entries`, `private_paddy`
- `sale_vouchers` - Now has `paid_amount`, `balance` fields updated by payments
- `purchase_vouchers` - Now has `paid_amount`, `balance` fields updated by payments
- `gunny_bags` - Now has separate `cgst_amount`, `sgst_amount`, `cgst_percent`, `sgst_percent`
- `cash_transactions` - Includes entries from voucher payments (reference: `voucher_payment:*`)
- `local_party_accounts` - Now includes entries from all voucher types (sale_voucher, purchase_voucher, gunny_bag)
- `truck_payments`, `diesel_accounts`

## Key API Endpoints
- `POST /api/voucher-payment` - Universal payment for any voucher (sale/purchase/gunny)
- `GET /api/sale-book/invoice/{id}` - HTML invoice generation
- `POST/GET/PUT/DELETE /api/gunny-bags` - Gunny bag CRUD with separate CGST/SGST
- `GET /api/stock-summary` - Consolidated stock (includes Gunny Bags)
- All existing endpoints preserved

## Pending/Upcoming Tasks
- P2: Refactor duplicated business logic between Python backend and Node.js desktop-app
- Stock Summary dropdown filter (category filter implemented via buttons)
- Party Summary search/export verification

## Credentials
- Admin: admin / admin123
