# Mill Entry System - PRD

## Original Problem Statement
Comprehensive Mill Entry System (rice mill management) web + desktop app.

## Core Principle
**Ledger as Single Source of Truth** for all payment calculations.

## What's Been Implemented (Stable)
- Full entry management, DC Tracker, Cash Book, Vouchers, Gunny Bags, Reports
- Telegram integration, Settings, Staff, FY Summary

## Bug Fixes & Features (12-Mar-2026)
- Auto-Ledger Fix: Cash Book auto-ledger always creates Nikasi for cash/bank entries
- Party Balance Fix: New Transaction hint now uses ONLY ledger entries (not cash), labels show Jama/Nikasi
- Party Summary Ledger Fix: Vouchers Party Summary uses ledger for paid calculations
- Sale Voucher Creation Fix: KeyError 'id' fixed
- Sale/Purchase Voucher Payment: Cash/Bank selector + bank dropdown + Undo Payment
- Cash Book: Normal buttons for Bank Accounts, Sale/Purchase Voucher Payment, Set Opening Balance
- Select & Delete: Bulk select/delete for Sale and Purchase Vouchers
- Sale Book: Opening Balance button removed

## Backlog
- P1: Full regression test of all payment modules
- P2: Complete Desktop App feature sync
- P2: Refactor duplicated business logic between Python and Node.js backends
