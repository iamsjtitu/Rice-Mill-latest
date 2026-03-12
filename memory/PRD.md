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
- DC Tracker with deliveries, MSP payments
- Cash Book with bank accounts, party ledger, GST ledger
- Sale & Purchase vouchers with E-Way Bill
- Bank account management with per-bank opening balances
- Reports (PDF/Excel) for all modules
- Settings, staff management, FY summary
- Telegram integration for notifications

### Bug Fixes (March 2026)
- **Cash Paid Ledger Entry**: Fixed missing Ledger Nikasi entry for cash_paid in truck entries
- **Truck Payments Sync with Cash Book**: Fixed to calculate paid_amount from ledger
- **Payment Undo -> Cash Book Cleanup**: Fixed undo-paid to delete ALL related entries
- **All Payment Sections -> Ledger Source of Truth**: Fixed Truck, Agent, Diesel, Local Party
- **Gunny Bags - Paid Badge**: Fixed to show "Paid" badge + History button when ledger_balance <= 0
- **Purchase Vouchers - Paid Badge**: Same fix as Gunny Bags
- **Sale Vouchers - Ledger Sync**: Added ledger-based balance calculation + Paid badge + History dialog
- **Payment History API**: GET /api/voucher-payment/history/{party_name}
- **DC Delivery Cash/Diesel Bug Fix**: Fixed delivery creation to also create Truck Ledger entries AND Diesel Account entries (was only creating Cash Book entries)
- **DC Delivery Delete Cleanup**: Fixed delete to clean up ALL auto-created entries (cash, ledger, diesel_accounts, gunny_bags)
- **DC Search Filter**: Added search by DC Number and Invoice Number on DC/Delivery Challan page

## Key Architecture Principle
**Ledger as Single Source of Truth**: All balance/paid calculations use the `cashbook` (cash_transactions) collection.

## Modules with Ledger Sync
- Truck Payments, Agent Payments, Diesel Accounts, Local Party, Gunny Bags, Purchase Vouchers, Sale Vouchers - all synced

## Modules WITHOUT Full Ledger Sync (Potential Risk)
- Private Paddy Purchase: Has own payment system (mark-paid/undo-paid). Low risk.
- Rice Sales: Same as above

## Backlog
- P1: Full regression test of all payment modules
- P2: Complete Desktop App feature sync
- P2: Refactor duplicated business logic between Python and Node.js backends
