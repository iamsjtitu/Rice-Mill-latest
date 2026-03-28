# Mill Entry System - PRD

## Current Version: v49.0.0

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON
- Local Server: Express + Local JSON
- Triple Backend Parity enforced

## Credentials
- Username: admin, Password: admin123

## v49.0.0 Features
- Custom Branding Fields (5-6 fields, L/C/R alignment, in all PDF/Excel headers)
- FY System Only (Apr-Mar) - KMS concept fully removed from UI/PDF/Excel
- Opening Stock Balance (9 items: paddy, rice_usna, rice_raw, bran, kunda, broken, kanki, husk, frk)
- Auto Carry Forward (closing -> opening stock)
- Stock Calculator centralized (utils/stock_calculator.py)
- Payment Service centralized (utils/payment_service.py)
- Sale Voucher stock items include opening stock
- Desktop/Local stock-summary + stock-items include opening stock

## Key Technical Note
- Internal DB field `kms_year` remains unchanged (backward compatibility)
- All user-facing labels, PDF/Excel headers use "FY" instead of "KMS"
- FY logic: April-March (month >= 3 = current year start)

## Key API Endpoints
- GET/PUT /api/branding, /api/fy-settings, /api/opening-stock
- POST /api/opening-stock/carry-forward
- GET /api/stock-summary, /api/paddy-stock, /api/sale-book/stock-items
- POST/DELETE /api/private-payments
- POST /api/cash-book/auto-fix

## Completed (This Session)
- Replaced all "KMS" user-facing labels with "FY" across:
  - Frontend: App.js, Dashboard.jsx, Payments.jsx, Reports.jsx, BalanceSheet.jsx, ExcelImport.jsx, MillingTracker.jsx, FYSummaryDashboard.jsx, LocalPartyAccount.jsx, WhatsNew.jsx, constants.js, CashBook.jsx, PaddyPurchase.jsx, DCTracker.jsx
  - Python Backend: entries.py, cashbook.py, milling.py, reports.py, payments.py, exports.py, dc_payments.py, fy_summary.py, daily_report.py, diesel.py, ledgers.py, auth.py, mill_parts.py, private_trading.py
  - Desktop-app routes: cashbook.js, daily_report.js, exports.js, fy_summary.js, mill_parts.js, private_trading.js, purchase_vouchers.js, reports_pnl.js
  - Local-server routes: cashbook.js, daily_report.js, fy_summary.js, mill_parts.js, private_trading.js, purchase_vouchers.js, reports_pnl.js, server.js
- Fixed FY year calculation logic (Oct-Sep -> Apr-Mar) in all components

## Upcoming
- P1: Export Preview feature (Preview data before exporting to Excel/PDF)

## Backlog
- P2: Desktop/Local server code deduplication
- P2: Centralize payment logic into service layer
