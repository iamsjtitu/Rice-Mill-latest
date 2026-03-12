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

### Desktop App Sync (Completed)
All new features ported to Node.js/Express backend with NeDB

### Bug Fixes (March 2026)
- **Cash Paid Ledger Entry**: Fixed missing Ledger Nikasi entry for cash_paid in truck entries
- **Truck Payments Sync with Cash Book**: Fixed to calculate paid_amount from ledger
- **Payment Undo -> Cash Book Cleanup**: Fixed undo-paid to delete ALL related entries
- **All Payment Sections -> Ledger Source of Truth**: Fixed Truck, Agent, Diesel, Local Party
- **Gunny Bags - Paid Badge**: Fixed to show "Paid" badge + History button when ledger_balance <= 0, hides "Payment Karein" button for fully paid items
- **Gunny Bags - Payment History**: Added working Payment History dialog with data from ledger API
- **Purchase Vouchers - Paid Badge**: Fixed to show "Paid" badge + History button when fully paid, same pattern as Gunny Bags
- **Sale Vouchers - Ledger Sync**: Added ledger-based balance calculation to GET /sale-book endpoint, conditional Paid badge and Payment History dialog
- **Payment History API**: New endpoint GET /api/voucher-payment/history/{party_name} for fetching payment history from ledger

## Key Architecture Principle
**Ledger as Single Source of Truth**: All balance/paid calculations use the `cashbook` (cash_transactions) collection. Never trust static `paid_amount` fields in individual collections.

## Modules with Ledger Sync
- Truck Payments ✅
- Agent Payments ✅
- Diesel Accounts ✅
- Local Party ✅
- Gunny Bags ✅ (with Paid badge + History)
- Purchase Vouchers ✅ (with Paid badge + History)
- Sale Vouchers ✅ (with Paid badge + History)

## Modules WITHOUT Full Ledger Sync (Potential Risk)
- Private Paddy Purchase: Has own payment system (private_payments + mark-paid/undo-paid). Balance uses collection field, not ledger. Low risk since it has its own payment_status tracking.
- Rice Sales: Same as above - has own payment system

## Backlog
- P1: Full regression test of all payment modules
- P2: Complete Desktop App feature sync (after web bugs fixed)
- P2: Refactor duplicated business logic between Python and Node.js backends
