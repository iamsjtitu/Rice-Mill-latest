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
- Staff management
- Hemali calculations
- Mill Parts tracking
- FY Summary reports
- Dashboard & Targets

### v46.0.0 Features (Latest)
- **Custom Branding Fields**: 5-6 extra fields in Settings (GST, Phone, Address etc.) with Left/Center/Right alignment. Appears in ALL PDF & Excel export headers
- **Financial Year (Apr-Mar)**: Separate FY selector alongside KMS year (Oct-Sep) in global header
- **Opening Stock Balance**: Set opening stock for 8 product types (Paddy, Rice, Bran, Kunda, Broken, Kanki, Husk, FRK) per KMS/FY year

### v45.x Features (Previous)
- 9-step auto-fix endpoint for data integrity
- Cascading delete fixes (Cashbook ↔ Payments ↔ Ledgers)
- Duplicate party name resolution
- GitHub Actions .exe build pipeline
- OTA auto-updater for desktop app

## Key API Endpoints
- `GET/PUT /api/branding` - Company branding with custom_fields
- `GET/PUT /api/fy-settings` - KMS year + Financial Year
- `GET/PUT /api/opening-stock` - Opening stock balances
- `POST /api/cash-book/auto-fix` - Data integrity check
- `POST /api/private-payments` - Payment processing
- `DELETE /api/private-payments/{id}` - Payment undo

## Key DB Collections
- `branding`: {company_name, tagline, custom_fields: [{label, value, position}]}
- `fy_settings`: {active_fy (KMS), season, financial_year (FY)}
- `opening_stock`: {kms_year, financial_year, stocks: {paddy, rice, bran, kunda, broken, kanki, husk, frk}}
- `cash_transactions`, `private_paddy`, `private_payments`, `party_ledger`

## Upcoming Tasks
- P1: Export Preview feature (Preview before PDF/Excel export)

## Future/Backlog
- P2: Centralize stock calculation logic
- P2: Refactor payment logic into service layer
- P2: Reduce code duplication across 3 backends
