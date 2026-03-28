# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app with local JSON storage. Requires double-entry accounting, advanced reporting, and offline-first desktop capabilities.

## Architecture
- **Web**: React Frontend + FastAPI Backend + MongoDB
- **Desktop**: Electron + Express + Local JSON (offline-first)
- **Local Server**: Express + Local JSON (LAN access)
- **Triple Backend Parity**: ALL logic changes must be replicated across Python, Desktop JS, Local Server JS

## Current Version: v46.0.0

## Credentials
- Username: admin, Password: admin123

## What's Implemented (Completed)

### Core Features
- Mill Entry CRUD with KMS year & season filtering
- Milling (CMR) module with calculations
- DC Payments system
- Purchase Vouchers with PDF generation
- Sale Book with PDF/Excel export
- Cash Book (double-entry accounting)
- Private Paddy Trading with party ledgers
- Staff management, Hemali calculations, Mill Parts tracking
- FY Summary reports, Dashboard & Targets

### v46.0.0 Features (Latest)
- **Custom Branding Fields**: 5-6 extra fields in Settings (GST, Phone, Address etc.) with Left/Center/Right alignment in ALL PDF & Excel headers
- **Financial Year (Apr-Mar)**: Separate FY selector alongside KMS year (Oct-Sep) in global header
- **Opening Stock Balance**: 9 product types with opening stock per KMS/FY year, integrated into Stock Summary (Available = Opening + In - Out)
- **Auto Carry Forward**: Closing stock → opening stock carry-forward button
- **Stock Calculator Centralization**: All stock formulas centralized in `utils/stock_calculator.py`
- **Payment Service Layer**: Payment creation/deletion centralized in `utils/payment_service.py`

## Key Files
- `utils/stock_calculator.py` - Pure calculation functions for stock
- `utils/payment_service.py` - Payment + Cashbook + Ledger DB operations
- `utils/branding_helper.py` - Branding data fetch helpers
- `utils/export_helpers.py` - PDF/Excel header generation with custom fields

## Key API Endpoints
- `GET/PUT /api/branding` - Company branding with custom_fields
- `GET/PUT /api/fy-settings` - KMS year + Financial Year
- `GET/PUT /api/opening-stock` - Opening stock balances (9 items)
- `POST /api/opening-stock/carry-forward` - Auto carry closing→opening
- `GET /api/stock-summary` - Stock summary with opening balances
- `GET /api/paddy-stock` - Paddy stock calculation

## Upcoming Tasks
- P1: Export Preview feature (Preview before PDF/Excel export)

## Future/Backlog
- P2: Reduce code duplication across 3 backends (desktop-app, local-server)
