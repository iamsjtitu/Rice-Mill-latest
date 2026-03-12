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

## Diesel handling across all modules
- Mandi Entries: diesel → Ledger (truck) + Diesel Account ✅ (no Cash Book)
- DC Delivery: diesel → Ledger (truck) + Diesel Account ✅ (no Cash Book)  
- Pvt Paddy: diesel → Ledger (truck) + Diesel Account ✅ (no Cash Book)
- Rice Sale: diesel → Ledger (truck) + Diesel Account ✅ (no Cash Book)

## Backlog
- P1: Full regression test of all payment modules
- P2: Complete Desktop App feature sync
- P2: Refactor duplicated business logic between Python and Node.js backends
