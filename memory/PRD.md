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
- Dual Year System (FY Apr-Mar + KMS Oct-Sep)
- Opening Stock Balance (9 items: paddy, rice_usna, rice_raw, bran, kunda, broken, kanki, husk, frk)
- Auto Carry Forward (closing → opening stock)
- Stock Calculator centralized (utils/stock_calculator.py)
- Payment Service centralized (utils/payment_service.py)
- Sale Voucher stock items include opening stock
- Desktop/Local stock-summary + stock-items include opening stock

## Key API Endpoints
- GET/PUT /api/branding, /api/fy-settings, /api/opening-stock
- POST /api/opening-stock/carry-forward
- GET /api/stock-summary, /api/paddy-stock, /api/sale-book/stock-items
- POST/DELETE /api/private-payments
- POST /api/cash-book/auto-fix

## Upcoming
- P1: Export Preview feature

## Backlog
- P2: Desktop/Local server code deduplication
