# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app with local JSON storage. Requires double-entry accounting, advanced reporting, and offline-first desktop capabilities.

## Architecture
- **Web**: React Frontend + FastAPI Backend + MongoDB
- **Desktop**: Electron + Express + Local JSON (offline-first)
- **Local Server**: Express + Local JSON (LAN access)
- **Triple Backend Parity**: ALL logic changes replicated across Python, Desktop JS, Local Server JS

## Current Version: v49.0.0

## Credentials
- Username: admin, Password: admin123

## What's Implemented

### Core Features
- Mill Entry CRUD with KMS year & season filtering
- Milling (CMR) module with calculations
- DC Payments, Purchase Vouchers, Sale Book
- Cash Book (double-entry accounting)
- Private Paddy Trading with party ledgers
- Staff, Hemali, Mill Parts, FY Summary, Dashboard

### v49.0.0 Features
- **Custom Branding Fields**: 5-6 extra fields in Settings with Left/Center/Right alignment in ALL PDF & Excel headers
- **Dual Year System**: FY (Apr-Mar) + KMS (Oct-Sep) selectors in global header
- **Opening Stock Balance**: 9 items (paddy, rice_usna, rice_raw, bran, kunda, broken, kanki, husk, frk)
- **Auto Carry Forward**: Closing stock → opening stock carry-forward
- **Stock Calculator Centralization**: `utils/stock_calculator.py`
- **Payment Service Layer**: `utils/payment_service.py`
- **Desktop/Local Server Sync**: All changes replicated including opening stock in stock-summary

## Key API Endpoints
- `GET/PUT /api/branding` - Custom fields + alignment
- `GET/PUT /api/fy-settings` - KMS + FY year
- `GET/PUT /api/opening-stock` - Opening stock balances
- `POST /api/opening-stock/carry-forward` - Auto carry
- `GET /api/stock-summary` - With opening balances (Available = OB + In - Out)
- `GET /api/paddy-stock` - Paddy stock
- `POST/DELETE /api/private-payments` - Payment CRUD
- `POST /api/cash-book/auto-fix` - 9-step integrity check

## Upcoming Tasks
- P1: Export Preview feature

## Future/Backlog
- P2: Reduce code duplication across 3 backends
