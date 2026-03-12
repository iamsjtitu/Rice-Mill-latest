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
- **PDF/Excel Export Fix (12-Mar-2026):**
  - Sale Book PDF: Fixed - was returning HTML, now returns proper PDF via reportlab
  - Purchase Book PDF: Fixed - replaced broken weasyprint with reportlab platypus tables
  - Sale Book Excel: Working (openpyxl)
  - Purchase Book Excel: Working (openpyxl)
- **Purchase Voucher Save Error Fix (12-Mar-2026):**
  - Fixed KeyError 'id' in `_create_purchase_ledger_entries` (line 163) - d["id"] changed to doc_id
  - Advance Paid now correctly deducted from total (balance = total - advance)
- **Frontend Export URL Fix:** PurchaseVouchers handleExport now includes kms_year/season/search query params

## Backlog
- P1: Full regression test of all payment modules
- P2: Complete Desktop App feature sync
- P2: Refactor duplicated business logic between Python and Node.js backends
- P3: Refactor large components (CashBook.jsx, SaleBook.jsx, PurchaseVouchers.jsx) into smaller pieces
