# Mill Entry System - PRD

## Original Problem Statement
Desktop app (Electron) synced with web app for rice mill data management. Web app is source of truth.

## Versions

### v25.1.38 (2026-03-15) - DATE FORMAT + PDF FIX
- **Date format**: DD-MM-YYYY across entire software (15 frontend files + PDF/Excel exports)
- **PDF Receipt fix**: Removed Hindi text (ReportLab font limitation), English-only with NAVKAR AGRO branding
- **Advance auto-fetch**: 400ms debounced auto-fetch when typing sardar name in create dialog
- Shared utility: `/app/frontend/src/utils/date.js`
- Backend helper: `_fmt_date()` in daily_report.py, `fmt_d()` in hemali.py
- Backend: 100% (14/14), Frontend: 100%

### v25.1.37 (2026-03-15) - HEMALI ENHANCEMENTS
- Print receipt NAVKAR AGRO branded, Daily/Detail Report Hemali section, Monthly Summary month filter

### v25.1.36 (2026-03-15) - MONTHLY SUMMARY + PARTY LEDGER
### v25.1.35 (2026-03-15) - HEMALI PAYMENT WORKFLOW
### v25.1.34 (2026-03-15) - HEMALI PAYMENT FEATURE
### v25.1.33 - STOCK SUMMARY FIX
### v25.1.32 - BALANCE SHEET FIX
### v25.1.31 - MIGRATION SCRIPT
### v25.1.30 - COMPREHENSIVE ACCOUNTING FIX

## Key DB Models
### Hemali
- **hemali_items**: {id, name, rate, unit, is_active, created_at}
- **hemali_payments**: {id, sardar_name, date, items, total, advance_before, advance_deducted, amount_payable, amount_paid, new_advance, status(unpaid/paid), kms_year, season}

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic
- Stock Summary PDF download verification pending
### P2
- All completed

## Credentials
- Username: admin, Password: admin123
