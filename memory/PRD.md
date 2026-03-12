# Mill Entry System - PRD

## Original Problem Statement
NAVKAR AGRO Mill Entry System - A comprehensive rice mill management application with paddy purchase tracking, milling, cash book, payments, ledgers, private trading, sale book (vouchers), GST settings, staff management, and more.

## Core Architecture
- **Frontend**: React (CRA) + Tailwind CSS + shadcn/ui components
- **Backend**: FastAPI (Python) + MongoDB
- **Desktop**: Electron app wrapper
- **Language**: Hindi (UI and user communication)

## User Personas
- **Admin**: Full access to all features, settings, user management
- **Operator**: Limited access, time-restricted editing (5 min window)

## What's Been Implemented

### Completed Features
1. **Mill Entries** - CRUD with filters, bulk operations, Excel/PDF exports
2. **Dashboard & Targets** - Mandi targets, KMS year tracking
3. **Payments** - Truck payments, agent payments with rate setting
4. **Milling (CMR)** - Milling tracker with by-product management
5. **Cash Book / Ledgers** - Full cash book with party ledger, opening balance
6. **DC & Payments** - DC tracker with truck payment management
7. **Reports** - Various report generation
8. **Vouchers Tab** (consolidated from Sale Book + Pvt Trading):
   - **Sale Vouchers**: Tally-style sales with GST, invoice numbers, PDF/Excel export, stock overview, multi-part accounting
   - **Purchase Vouchers** (NEW): Buy any custom item, auto accounting (Cash Book, Diesel Account, Party Ledger, Truck Payments), PDF/Excel export, search/filter, item autocomplete
   - **Paddy Purchase**: Private paddy purchase with weight calculations, payment tracking
   - **Stock Summary** (NEW): All stocks in one place - Paddy, Rice (Usna/Raw), By-products, FRK, Custom items. Shows In/Out/Available. PDF/Excel export
   - **Party Summary**: Consolidated view of all parties with purchase/sale breakdown
9. **Mill Parts** - Spare parts stock management
10. **Staff Management** - Staff salary, attendance tracking
11. **FY Summary** - Financial year summary dashboard
12. **Settings** - Branding, GST settings, backup, Telegram bot, error logs
13. **Opening Balance** - For both Cash Book and Sale Book
14. **GST Integration** - System-wide CGST/SGST/IGST settings
15. **By-product Ledger Integration** - Auto ledger entries on by-product sales

### Critical Bug Fixes Applied
- Party type auto-detection fix (permanent, with migration script)
- Sale Book multi-collection accounting (party ledger + cash + diesel + truck payments)
- Truck payment "Entry not found" fix for Sale Book vouchers
- PDF export weasyprint import fix

### UI Restructuring (Feb 2026)
- "Sale Book" tab renamed and merged into "Vouchers"
- "Pvt Trading" tab removed, content moved into "Vouchers" sub-tabs
- New unified "Vouchers" tab with 5 sub-tabs

## Key Database Collections
- `entries` - Main mill entries
- `cash_transactions` - Cash book entries
- `party_ledger` - Party wise ledger
- `sale_vouchers` - Sale book vouchers
- `purchase_vouchers` (NEW) - Purchase vouchers with custom items
- `truck_payments` - Truck payment records
- `diesel_accounts` - Diesel payment records
- `gst_settings` - GST configuration
- `private_paddy` - Private paddy purchases
- `rice_sales` - Rice sale entries
- `private_payments` - Private trading payments
- `milling_entries` - Milling/CMR records
- `byproduct_sales` - By-product sale records

## Key API Endpoints
- POST/GET/PUT/DELETE `/api/purchase-book` - Purchase voucher CRUD
- GET `/api/stock-summary` - Comprehensive stock summary
- GET `/api/purchase-book/item-suggestions` - Autocomplete for item names
- GET `/api/purchase-book/export/pdf`, `/api/purchase-book/export/excel` - Exports
- GET `/api/stock-summary/export/pdf`, `/api/stock-summary/export/excel` - Exports
- POST/GET/PUT/DELETE `/api/sale-book` - Sale voucher CRUD
- GET `/api/sale-book/stock-items` - Stock for sale form

## Prioritized Backlog

### P2 - Future
- Refactor duplicated logic between Python backend and Node.js desktop backend
- Desktop app sync with web version changes
- Advanced reporting and analytics

## Credentials
- Admin: admin / admin123
