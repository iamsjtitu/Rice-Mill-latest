# Mill Entry System - PRD

## Original Problem Statement
Desktop app (Electron) synced with web app for rice mill data management. Web app is source of truth.

## Versions

### v25.1.37 (2026-03-15) - HEMALI ENHANCEMENTS
- **Print Receipt**: Beautiful NAVKAR AGRO branded A5 PDF with Hindi+English labels, orange branding, items table, calculation section, signature lines, footer
- **Daily/Detail Report**: Hemali section added (data + PDF + Excel) with summary cards and detail table showing PAID/UNPAID badges
- **Monthly Summary**: Month filter dropdown (last 12 months)
- **Party Ledger**: Hemali sardars show individually (not as generic "Hemali Payment")
- Desktop backend synced with all changes
- Backend: 100% (16/16 tests), Frontend: 100%

### v25.1.36 (2026-03-15) - MONTHLY SUMMARY + PARTY LEDGER
- Monthly Summary sub-tab with sardar-wise report, items breakdown, advances
- Party Ledger integration for Hemali sardars
- PDF/Excel export

### v25.1.35 (2026-03-15) - HEMALI PAYMENT WORKFLOW
- 4 action buttons: Make Payment, Undo, Print, Delete
- Create (Unpaid) → Mark Paid → Undo → Re-mark cycle

### v25.1.34 (2026-03-15) - HEMALI PAYMENT FEATURE
- Full Hemali system: Items Config, Payment creation, Advance management, Cash Book + Ledger

### v25.1.33 - STOCK SUMMARY FIX
### v25.1.32 - BALANCE SHEET FIX
### v25.1.31 - MIGRATION SCRIPT
### v25.1.30 - COMPREHENSIVE ACCOUNTING FIX

## Key DB Models
### Hemali
- **hemali_items**: {id, name, rate, unit, is_active, created_at}
- **hemali_payments**: {id, sardar_name, date, items, total, advance_before, advance_deducted, amount_payable, amount_paid, new_advance, status(unpaid/paid), kms_year, season}

## Key API Endpoints
- `/api/hemali/payments/{id}/print` - NAVKAR AGRO styled receipt PDF
- `/api/hemali/monthly-summary?month=YYYY-MM` - Monthly report with filter
- `/api/reports/daily?date=` - Now includes hemali_payments section
- `/api/reports/party-ledger?party_type=Hemali` - Individual sardars

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic
- Stock Summary PDF download verification pending
### P2
- All completed

## Credentials
- Username: admin, Password: admin123
