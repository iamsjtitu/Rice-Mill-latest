# Mill Entry System - PRD

## Original Problem Statement
Comprehensive Mill Entry System (rice mill management) web + desktop app.

## Core Principle
**Ledger as Single Source of Truth** for all payment calculations.

## What's Been Implemented (Stable)
- Full entry management, DC Tracker, Cash Book, Vouchers, Gunny Bags, Reports
- Telegram integration, Settings, Staff, FY Summary
- DC Search by DC Number / Invoice Number

## Bug Fixes (March 2026)
- Cash Paid Ledger Entry: Fixed missing Ledger Nikasi for cash_paid
- Truck Payments Sync with Cash Book: ledger-based paid_amount
- Payment Undo → Cash Book Cleanup: delete ALL related entries
- All Payment Sections → Ledger Source of Truth (Truck, Agent, Diesel, Local Party, Gunny, Purchase, Sale)
- Gunny/Purchase/Sale Vouchers: "Paid" badge + Payment History when fully paid
- DC Delivery: Cash → Cash Book + Truck Ledger | Diesel → ONLY Truck Ledger + Diesel Account (NOT Cash Book)
- DC Delivery trucks now show in Truck Payments & Truck Owner tabs
- **DC Delivery auto-paid fix**: Rate=0 delivery shows as "Pending", not auto-"Paid"
- **Undo Paid fix**: truck_no extraction fixed for dc_deliveries (vehicle_no field), delivery deduction refs added to exclusion list
- **Truck Owner undo**: Now includes dc_deliveries, private_paddy, rice_sales
- **Truck Owner history**: Includes dc_delivery entry IDs for deduction detection
- **Auto-Ledger Fix (12-Mar-2026)**: Cash Book auto-ledger now always creates Nikasi for any cash/bank entry
- **Party Summary Ledger Fix (12-Mar-2026)**: Vouchers Party Summary uses ledger for paid calculations

## Features Added (12-Mar-2026)
- **Sale Voucher Payment Mode**: Cash/Bank selector in payment dialog with bank account dropdown
- **Sale Voucher Undo Payment**: Undo button in Payment History removes all related entries (cash, ledger, local_party)
- **Payment History Enhancement**: Shows can_undo flag, advance entries not undoable

## Diesel handling across all modules
- Mandi Entries: diesel → Ledger (truck) + Diesel Account (no Cash Book)
- DC Delivery: diesel → Ledger (truck) + Diesel Account (no Cash Book)
- Pvt Paddy: diesel → Ledger (truck) + Diesel Account (no Cash Book)
- Rice Sale: diesel → Ledger (truck) + Diesel Account (no Cash Book)

## Backlog
- P1: Full regression test of all payment modules
- P2: Complete Desktop App feature sync
- P2: Refactor duplicated business logic between Python and Node.js backends
- P2: Add same Cash/Bank/Undo features to Purchase Vouchers and Gunny Bags
