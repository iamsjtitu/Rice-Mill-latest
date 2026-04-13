# Rice Mill Management System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Triple backend architecture with MongoDB (web) and SQLite/JSON (desktop/local). Requires double-entry accounting, advanced reporting, offline-first desktop, and cross-device sync.

## Current Version: v90.3.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + SQLite/JSON
- **Backend (Local)**: Express + SQLite/JSON

## What's Been Implemented

### Core Features
- Mill Entry CRUD with full weight/cut/payment tracking
- Cash Book (Jama/Nikasi) with double-entry accounting
- Private Paddy Purchase with party ledgers
- Sale & Purchase Vouchers (with Bill No, Destination, Bill Book, Oil %)
- DC Tracker (Delivery Challans)
- Milling Tracker (CMR)
- Staff Management with salary/advance
- Hemali Payment system
- Rice Sales tracking
- Truck Lease management
- Diesel Accounts
- Mill Parts Stock

### Reports
- CMR vs DC comparison
- Season P&L
- Daily Report
- Agent & Mandi reports
- Weight Discrepancy report
- Mandi Wise Custody Register (QNTL, professional Excel)
- Paddy Custody Register (Final W)

### Government Registers (v89.1.0 - v89.3.0)
- Paddy Custody Register, Transit Pass Register, CMR Delivery Tracker
- Form A/B/E/F, FRK Blending Register, Gunny Bag Stock Register
- Security Deposit Management
- All registers with government-format Excel export

### Dynamic By-Product Categories (v90.0.0 - v90.3.0)
- Settings mein 'By-Products' tab - custom categories
- Categories auto-populate in Milling Form, Stock Summary, Sale Voucher, FY Summary
- Opening Stock from Settings reflects in FY Summary/Balance Sheet

### Code Quality Fixes (v90.3.0)
- Replaced wildcard imports with explicit imports (auth.py, cashbook.py, dc_payments.py, milling.py)
- Fixed dynamic __import__ calls → static imports (milling.py uuid, govt_registers.py timedelta)
- Fixed document.write XSS → safe doc reference patterns (print.js, PrintButton, LocalPartyAccount, StaffManagement, BalanceSheet)
- Added console.error logging to all empty catch blocks (MessagingTab, WatermarkTab, WeighbridgeTab, download.js, useMessagingEnabled)
- Added useMemo for expensive computations (Payments.jsx truckWiseConsolidated)
- Replaced array index keys with stable unique keys (SaleBook.jsx)
- Moved test credentials to environment variables

### Features
- Quick Search, PDF/Excel export with watermark, FY Summary Dashboard, Balance Sheet
- Branding/Settings, Auto-update, WhatsApp/Telegram, Camera, GST Ledger/Audit Log
- Multi-user with role-based access, Bags validation

## Prioritized Backlog

### P1 (High)
- Quality Test Report Register
- Monthly Return Auto-generation

### P2 (Medium)
- Large component splitting (App.js, Payments.jsx, CashBook.jsx, Reports.jsx)
- Cashbook routes complexity refactoring (add_cash_transaction → smaller functions)
- Python backend service layer refactoring
- Triple backend code deduplication

### P3 (Low)
- Payment logic centralized service layer
- Remaining array-index-as-key fixes (55 instances, ~40 remaining)

## Key Technical Notes
- Triple Backend: Python changes must be replicated in desktop-app and local-server JS routes
- Auth: Session-cookie based, no JWT
- Collection mapping: MongoDB `mill_entries` = JS `entries`
- Dynamic By-Products: Models accept raw dict for Milling Entries
- Opening Stock: `opening_stock` collection (Settings) falls back to `opening_balances` (FY Summary)

## Permanent Rules
1. Version Bump + WhatsNew: Every fix/feature
2. Parity Check: `python3 /app/scripts/check-parity.py`
3. Route Sync: `bash /app/scripts/sync-js-routes.sh`
4. Hindi/Hinglish communication only
