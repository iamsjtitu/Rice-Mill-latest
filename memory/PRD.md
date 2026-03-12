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
8. **Vouchers** (formerly Sale Book + Pvt Trading) - Consolidated tab with:
   - **Sale Vouchers**: Tally-style sales with GST, invoice numbers, PDF/Excel export, stock overview, multi-part accounting (party ledger, cash book, diesel accounts, truck payments)
   - **Paddy Purchase**: Private paddy purchase with weight calculations, payment tracking, mark paid/undo
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

### UI Restructuring (Feb 2026)
- "Sale Book" tab renamed and moved into "Vouchers"
- "Pvt Trading" tab removed, content moved into "Vouchers" sub-tabs
- "Rice Sale" tab removed (was inside Pvt Trading)
- New unified "Vouchers" tab with 3 sub-tabs

## Key Database Collections
- `entries` - Main mill entries
- `cash_transactions` - Cash book entries
- `party_ledger` - Party wise ledger
- `sale_vouchers` - Sale book vouchers
- `truck_payments` - Truck payment records
- `diesel_accounts` - Diesel payment records
- `gst_settings` - GST configuration
- `private_paddy` - Private paddy purchases
- `rice_sales` - Rice sale entries
- `private_payments` - Private trading payments

## Prioritized Backlog

### P1 - Upcoming
- Purchase Vouchers sub-tab within Vouchers section

### P2 - Future
- Refactor duplicated logic between Python backend and Node.js desktop backend
- Code cleanup of old PrivateTrading.jsx (now only used for RiceSale sub-component reference)

## Tech Stack
- React 18 + Tailwind CSS + shadcn/ui
- FastAPI + Motor (async MongoDB)
- Electron (desktop)
- reportlab/openpyxl (PDF/Excel in Python)
- pdfkit/exceljs (PDF/Excel in Node.js)
- Telegram Bot API

## Credentials
- Admin: admin / admin123
