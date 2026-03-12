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
- Auto-Ledger Fix: Cash Book auto-ledger now always creates Nikasi for any cash/bank entry
- Party Summary Ledger Fix: Vouchers Party Summary uses ledger for paid calculations
- All Payment Sections → Ledger Source of Truth

## Features Added (12-Mar-2026)
- **Sale Voucher Payment Mode**: Cash/Bank selector in payment dialog with bank account dropdown
- **Sale Voucher Undo Payment**: Undo button in Payment History removes all related entries
- **Cash Book → Sale Voucher Payment**: Direct "Sale Voucher Payment" button in Cash Book toolbar, shows pending vouchers with balance, supports Cash/Bank mode

## Backlog
- P1: Full regression test of all payment modules
- P2: Add same Cash/Bank/Undo features to Purchase Vouchers and Gunny Bags
- P2: Complete Desktop App feature sync
- P2: Refactor duplicated business logic between Python and Node.js backends
