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

## What's Been Implemented

### Web App (Stable) ✅
- Full entry management with mill entries
- DC Tracker with deliveries, MSP payments
- Cash Book with bank accounts, party ledger, GST ledger
- Sale & Purchase vouchers with E-Way Bill
- Bank account management with per-bank opening balances
- Reports (PDF/Excel) for all modules
- Settings, staff management, FY summary
- Telegram integration for notifications

### Desktop App Sync (Completed) ✅
All new features ported to Node.js/Express backend with NeDB:
- `bank_accounts.js` - Bank account CRUD
- `gst_ledger.js` - GST ledger with opening balances
- `voucher_payments.js` - Voucher payment processing
- `salebook.js` - Sale vouchers with E-Way Bill
- `purchase_vouchers.js` - Purchase vouchers with E-Way Bill
- `dc_payments.js` - Updated with:
  - New delivery fields (invoice_no, rst_no, eway_bill_no, bags_used, cash_paid, diesel_paid, cgst, sgst)
  - Auto-entries for cash/diesel/bags
  - Cascading delete for auto-entries
  - Delivery invoice endpoint
  - Updated Excel export with Deliveries sheet
- `cashbook.js` - Updated with per-bank opening balance (bank_details)
- `main.js` - delete-all-data includes bank_accounts
- Frontend rebuilt with ELECTRON_API_URL fallback for all components

### Bug Fixes (March 2026)
- **Cash Paid Ledger Entry**: Fixed missing Ledger Nikasi entry for cash_paid in truck entries. Both add and update entry functions now create ledger nikasi entries for cash deductions.
- **Truck Payments Sync with Cash Book**: Fixed Truck Payments page to calculate paid_amount from the ledger (source of truth) instead of only the truck_payments collection. Manual Cash Book payments for trucks now correctly reflect in Truck Payments with proper status (paid/partial/pending). Uses FIFO distribution for multi-entry trucks.
- **Payment Undo → Cash Book Cleanup**: Fixed undo-paid for truck and agent payments to delete ALL related entries from Cash Book and Ledger (both Pay/Mark Paid auto-entries AND manual Cash Book payments). Previously only deleted Cash entries, missed Ledger entries. Also fixed: undo now works even when payment was made manually from Cash Book (no truck_payments doc required).
- **ELECTRON_API_URL**: Fixed 5 components that used process.env directly without ELECTRON_API_URL fallback.
- **DC Entry Delete Cascade**: Fixed to also delete auto-entries (cash/diesel/bags) when a DC entry and its deliveries are deleted.

## Backlog
- P2: Refactor duplicated business logic between Python and Node.js backends
