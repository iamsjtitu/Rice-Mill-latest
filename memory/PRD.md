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
- **Stock Items Dropdown in Purchase Voucher (12-Mar-2026):**
  - Backend: New `/api/purchase-book/stock-items` endpoint returns all stock items with available quantities
  - Frontend: Stock overview cards on Purchase Vouchers page showing all items (Paddy, Rice, FRK, Bran, etc.)
  - Frontend: Select dropdown in form shows stock items with quantities + "Other/Custom Item" option
  - Frontend: Stock column shows available qty for selected item
- **Purchase Voucher Form Redesign (12-Mar-2026):**
  - Redesigned to match Sale Voucher form exactly (table-based items, same section layout)
  - Items use Table component with columns: Name of Item (Select), Stock, Quantity, Rate, Amount
  - GST in bordered box, Payment card with Grand Total + Cash/Diesel + Advance/Balance
  - Balance auto-calculates: Grand Total - Advance Paid
- **Low Stock Alert (12-Mar-2026):**
  - Stock overview cards show OUT OF STOCK (red) and LOW STOCK (amber) labels
  - Low Stock Alert banner shows items needing reorder
- **PDF Ledger Balance (12-Mar-2026):**
  - Sale Book and Purchase Book PDFs now include ledger-based Paid and Balance columns
  - Cash Book manual payments are reflected in PDF/Excel exports
- **PDF A4 Optimization (12-Mar-2026):**
  - Both Sale and Purchase PDFs optimized with smaller fonts/margins to fit A4 landscape
- **Purchase Voucher Stock Integration Fix (12-Mar-2026):**
  - CRITICAL BUG FIX: Items purchased via Purchase Vouchers were NOT reflected in other modules
  - Fixed `/api/rice-stock` (milling.py) - now includes PV rice purchases in available stock
  - Fixed `/api/sale-book/stock-items` (salebook.py) - now includes PV items in stock dropdown
  - Fixed `/api/byproduct-stock` (milling.py) - now includes PV byproduct purchases
  - Dashboard shows "Purchase se kharida: + X Qntl" line in Rice Stock card
  - Low Stock Alert removed from Purchase Vouchers page (user request)
- **PDF/Excel Exports Enhanced (12-Mar-2026):**
  - Sale & Purchase PDFs: professional reportlab tables, A4 landscape fit, colorful headers, items in Qntl
  - Sale & Purchase Excels: rewritten with ledger-based Paid/Balance, colorful formatting, A4 fit, items in Qntl
  - All exports use ledger-based balance (Cash Book manual payments included)
- **Paddy Stock PV Integration (12-Mar-2026):**
  - `/api/paddy-stock` now includes Purchase Voucher paddy items (`pv_paddy_in_qntl`)
  - Dashboard Paddy Stock card shows "Purchase se kharida" line when PV paddy exists
- **Paddy Stock Calculation Fix (12-Mar-2026):**
  - Fixed purchase-book/stock-items Paddy to use same formula as paddy-stock (qntl-bag/100-p_pkt_cut/100)
  - Paddy now correctly shows 297Q instead of 461.96Q
- **Individual Voucher Print (12-Mar-2026):**
  - New endpoints: GET /api/sale-book/{id}/pdf and GET /api/purchase-book/{id}/pdf
  - Both Sale and Purchase tables have Printer icon for each voucher row
  - Clicking opens professional PDF invoice in new tab with company header, items table, totals, signature line
  - Print PDF does NOT show Cash Paid or Diesel (clean invoice)
- **Stock Summary Fix (12-Mar-2026):**
  - Fixed Paddy calculation: uses CMR formula (qntl-bag/100-p_pkt_cut/100) consistently - 297Q correct
  - All stock items (Rice, Bran, Kunda, etc.) details show Purchase Voucher contributions
  - Details format: "Milling: XQ + Purchase: YQ - DC: ZQ - Pvt: WQ - Sale: VQ"

## Backlog
- P1: Full regression test of all payment modules
- P2: Complete Desktop App feature sync
- P2: Refactor duplicated business logic between Python and Node.js backends
- P3: Refactor large components (CashBook.jsx, SaleBook.jsx, PurchaseVouchers.jsx) into smaller pieces
