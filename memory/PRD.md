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
- Auto-Ledger Fix: Cash Book auto-ledger always creates Nikasi
- Party Summary Ledger Fix: Vouchers Party Summary uses ledger for paid calculations
- Sale Voucher Creation: Fixed KeyError 'id' in _create_sale_ledger_entries
- All Payment Sections → Ledger Source of Truth

## Features Added (12-Mar-2026)
- Sale Voucher Payment: Cash/Bank selector + bank dropdown + Undo Payment
- Purchase Voucher Payment: Cash/Bank selector + bank dropdown + Undo Payment
- Cash Book Action Cards: Bank Accounts, Sale Voucher Payment, Purchase Voucher Payment, Set Opening Balance - displayed as colored cards above summary
- Cash Book → Direct Voucher Payment: Both Sale and Purchase voucher payments from Cash Book
- Select & Delete: Checkbox-based bulk select & delete for Sale and Purchase Vouchers
- Sale Book: Opening Balance button/dialog removed (managed via Cash Book)

## Backlog
- P1: Full regression test of all payment modules
- P2: Complete Desktop App feature sync
- P2: Refactor duplicated business logic between Python and Node.js backends
