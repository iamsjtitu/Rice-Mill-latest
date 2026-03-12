# Mill Entry System
## Recent Bug Fixes (March 2026)
- **Cash Paid Ledger Entry Bug**: Fixed missing Ledger Nikasi entry for `cash_paid` in truck entries. Previously, only diesel_paid created a ledger nikasi entry, causing incorrect party balance calculations. Now both cash_paid and diesel_paid correctly deduct from the truck's party ledger balance. Backfill migration endpoint added at `/api/entries/fix-cash-ledger`. - PRD

## Overview
A comprehensive mill entry management system for NAVKAR AGRO, JOLKO, KESINGA. Handles milling, delivery challans, vouchers, payments, cash book, party ledgers, GST accounting, and reporting.

## Core Features
- **Entries**: Mill entries with full CRUD, paddy input/output tracking
- **Dashboard & Targets**: Mandi-wise targets, filtered PDF export
- **Milling (CMR)**: Custom Milling Register with stock tracking
- **DC (Payments)**: Delivery Challans with deliveries, MSP payments, Gunny Bags
- **Vouchers**: Sale Book, Purchase Vouchers with GST, payment recording
- **Cash Book & Ledgers**: Cash/Bank transactions, Party Ledger, GST Ledger
- **Reports**: PDF/Excel exports for all modules
- **Settings**: Mill info, user management, Telegram notifications

## Key Collections (MongoDB)
- `mill_entries`, `dc_entries`, `dc_deliveries`, `dc_msp_payments`
- `sale_vouchers`, `purchase_vouchers`, `gunny_bags`
- `cash_transactions`, `opening_balances`, `gst_opening_balances`
- `bank_accounts`, `local_party_accounts`, `party_ledger`
- `mandi_targets`, `settings`, `users`, `staff`

## Recent Changes (Mar 12, 2026)
- Removed "Cash" from MSP Payment mode dropdown (govt only pays via bank)
- Added Custom Bank Accounts management (CRUD)
- Added Opening Balance settings for Cash and per-bank separately
- Per-bank balance breakdown cards in Cash Book summary
- Bank Name dropdown in MSP Payment form (from bank_accounts)
- **DC Delivery form enhanced**: Invoice No, RST No, Bags (Govt bags minus), Cash Paid (auto Cash Book entry), Diesel Paid (auto Truck payment entry)
- **Delivery Invoice Print**: HTML invoice via GET /api/dc-deliveries/invoice/{id}
- **GST Ledger**: Full IGST/SGST/CGST tracking with Opening Balance, auto credit from Purchase, auto debit from Sale
- **Govt Bags Stock**: Tracking via /api/govt-bags/stock

## Key API Endpoints
- `GET /api/bank-accounts`, `POST /api/bank-accounts`, `DELETE /api/bank-accounts/{id}`
- `PUT /api/cash-book/opening-balance` (cash + per-bank bank_details)
- `GET /api/dc-deliveries/invoice/{id}` - Delivery invoice HTML
- `GET /api/gst-ledger` - Compute GST ledger from vouchers
- `GET/PUT /api/gst-ledger/opening-balance` - GST OB (IGST/SGST/CGST)
- `GET /api/govt-bags/stock` - Govt bags stock summary
- `POST /api/voucher-payment` - Universal payment for any voucher
- `GET /api/sale-book/invoice/{id}` - Sale invoice HTML
- All standard CRUD endpoints

## Architecture
- **Frontend**: React + Shadcn UI, dark theme
- **Backend**: FastAPI + Motor (async MongoDB)
- **Database**: MongoDB
- **Reports**: ReportLab (PDF), OpenPyXL (Excel)

## Backlog
- P2: Refactor duplicated logic between Python backend and desktop-app Node.js backend
