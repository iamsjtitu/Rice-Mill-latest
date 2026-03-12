# Mill Entry System - PRD

## Original Problem Statement
The user wants a comprehensive Mill Entry System (rice mill management) with both a web application and a standalone desktop application. The desktop app must have 100% feature parity with the web app.

## Core Requirements
- Mandi entries with truck, paddy purchase tracking
- DC (Delivery Challan) management with deliveries
- Cash Book & Ledgers (Cash, Bank, Party Ledger)
- Sale/Purchase Voucher system with GST
- Gunny Bags stock management
- Reporting (PDF/Excel exports)
- Desktop standalone app with local JSON database
- **Ledger as Single Source of Truth**: All payment calculations must derive from the cashbook collection

## What's Been Implemented

### Web App (Stable)
- Full entry management with mill entries
- DC Tracker with deliveries, MSP payments, search by DC/Invoice number
- Cash Book with bank accounts, party ledger, GST ledger
- Sale & Purchase vouchers with E-Way Bill
- Bank account management with per-bank opening balances
- Reports (PDF/Excel) for all modules
- Settings, staff management, FY summary
- Telegram integration for notifications

### Bug Fixes (March 2026)
- Cash Paid Ledger Entry: Fixed missing Ledger Nikasi for cash_paid in truck entries
- Truck Payments Sync with Cash Book: Fixed to calculate paid_amount from ledger
- Payment Undo -> Cash Book Cleanup: Fixed undo-paid to delete ALL related entries
- All Payment Sections -> Ledger Source of Truth: Fixed Truck, Agent, Diesel, Local Party
- Gunny Bags/Purchase Vouchers/Sale Vouchers: Paid badge + Payment History when fully paid
- Payment History API: GET /api/voucher-payment/history/{party_name}
- **DC Delivery Cash/Diesel Complete Fix**: 
  - Creates Cash Book nikasi entries ✅
  - Creates Truck Ledger nikasi entries (shows in Truck Payments) ✅
  - Creates Diesel Account entries (shows in Diesel Account) ✅
  - DC Delivery trucks show in Truck Payments & Truck Owner tabs ✅
  - Delete delivery cleans up ALL auto-created entries ✅
- **DC Search Filter**: Search by DC Number and Invoice Number on DC page

## Key Architecture
- Ledger as Single Source of Truth for all payment calculations
- DC Deliveries create 4 cash_transactions (cash nikasi, ledger nikasi for cash, cash nikasi for diesel, ledger nikasi for diesel) + 1 diesel_accounts entry
- Truck Payments includes entries from: mill_entries, private_paddy, rice_sales, sale_vouchers, dc_deliveries

## Modules with Ledger Sync
- Truck Payments, Agent Payments, Diesel Accounts, Local Party, Gunny Bags, Purchase Vouchers, Sale Vouchers - all synced

## Backlog
- P1: Full regression test of all payment modules
- P2: Complete Desktop App feature sync
- P2: Refactor duplicated business logic between Python and Node.js backends
