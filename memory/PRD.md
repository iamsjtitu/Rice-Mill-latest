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
3. **Payments** - Truck payments, agent payments with rate setting
4. **Milling (CMR)** - Milling tracker with by-product management
5. **Cash Book / Ledgers** - Full cash book with party ledger, opening balance
6. **DC & Payments** - DC tracker with truck payment management
7. **Reports** - Various report generation
8. **Vouchers Tab** (5 sub-tabs):
   - **Sale Vouchers**: Tally-style sales with GST, multi-part accounting
   - **Purchase Vouchers**: Any custom item purchase, auto accounting
   - **Paddy Purchase**: Weight calculations, payment tracking
   - **Stock Summary**: All stocks - Paddy, Rice, By-products, FRK, Custom items, **Gunny Bags**
   - **Party Summary**: Aggregated from sale_vouchers + purchase_vouchers + paddy_purchase
9. **Mill Parts, Staff, FY Summary, Settings, GST, Opening Balance**
10. **Gunny Bags Management** (Enhanced - Mar 2026):
    - Full purchase form with Invoice No, Truck No, RST No, Party Name, GST (CGST+SGST / IGST), Advance
    - Automatic accounting entries (Party Ledger JAMA, Advance NIKASI, Cash NIKASI)
    - Integrated into Stock Summary under "Raw Material" category
    - Stock Summary category filter (All, Raw Material, Finished, By-Product, Custom)

### Bug Fixes (Mar 2026)
- Stock Summary: Fixed `db.entries` → `db.mill_entries` for correct paddy stock
- Party Summary: Added sale_vouchers + purchase_vouchers aggregation
- Stock Summary PDF/Excel: Rewritten with professional reportlab formatting

## Key Database Collections
- `mill_entries` - Main mill entries (paddy incoming)
- `milling_entries` - CMR/Milling records
- `private_paddy` - Private paddy purchases
- `sale_vouchers` - Sale book vouchers
- `purchase_vouchers` - Purchase vouchers with custom items
- `gunny_bags` - Gunny bag purchases and tracking (enhanced with invoice_no, truck_no, rst_no, party_name, gst, advance)
- `cash_transactions` - Cash book entries (includes gunny_purchase, gunny_advance, gunny_cash references)
- `truck_payments`, `diesel_accounts`, `rice_sales`, `byproduct_sales`, etc.

## Key API Endpoints
- `POST/GET/PUT/DELETE /api/gunny-bags` - Gunny bag CRUD with GST + accounting
- `GET /api/gunny-bags/summary` - Summary by bag type
- `GET /api/stock-summary` - Consolidated stock (includes Gunny Bags)
- `GET /api/private-trading/party-summary` - 3-section party summary with search
- `POST/GET/PUT/DELETE /api/purchase-book` - Purchase vouchers
- `GET /api/stock-summary/export/pdf|excel` - Stock exports

## Credentials
- Admin: admin / admin123
