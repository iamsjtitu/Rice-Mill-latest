# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON/SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v88.22.0

## Architecture
- Triple Backend: Python (web), Desktop JS (Electron 28), Local JS (LAN)
- Frontend: React with shadcn/ui
- All three backends share identical business logic
- Shared report_config.json for report column definitions

## Global Systems
- **Rounding**: `round_amount(val)` / `roundAmount(val)`: >.50 rounds up, <=.50 rounds down
- **Date Format**: DD-MM-YYYY globally via `fmt_date()` / `fmtDate()` across ALL exports (PDF, Excel, Print)
- **File Watcher**: Desktop/Local-server poll JSON file every 5s for Google Drive sync
- **Export Sorting**: All PDF/Excel exports sort ascending by date (oldest first)
- **Mandi Column Width**: 28mm PDF, 18 Excel for private_paddy and party_summary reports
- **Export Preview**: ExportPreviewDialog component with Print, PDF, Excel, Search

## Completed Features (v88.19.0)
- [x] Global round figure amount system (ALL 3 backends)
- [x] Duplicate RST/TP blocking with real-time warning toast
- [x] Login page Enter key navigation
- [x] Rice Stock Split: Raw vs Parboiled
- [x] Global Date Format DD-MM-YYYY in ALL exports (all backend routes) - v88.19.0
- [x] Mill Entries View button -> Dialog popup
- [x] PPR Eye button -> ViewEntryDialog opens in-place
- [x] Dialog close -> original filters restore
- [x] Google Drive LAN sync file watcher (5s polling)
- [x] ViewEntryDialog shared component
- [x] ESC key priority: zoomed photo first, dialog second (all 3 photo dialogs covered including AutoWeightEntries)
- [x] Season/FY filter persisted in localStorage
- [x] KG/QNTL fields locked when auto-fetched via RST AND when editing existing entries
- [x] PPR and Mill Entries UI table sorting (descending by date/rst)
- [x] Global PDF/Excel export sorting (ascending by date) - v88.17.0
- [x] Mandi column width increased (28mm PDF) for long names - v88.17.0
- [x] Export Preview feature - all sections (20+ components) - v88.18.0
- [x] Print button in Export Preview modal - direct browser print - v88.19.0

## Files with fmt_date() in exports
- entries.py ✅ (had it)
- exports.py ✅ (had it)
- hemali.py ✅ (had it)
- mill_parts.py ✅ (had it)
- milling.py ✅ (had it)
- vehicle_weight.py ✅ (had it)
- truck_lease.py ✅ (had it)
- cashbook.py ✅ (via report_config)
- private_trading.py ✅ (via report_config)
- dc_payments.py ✅ (FIXED v88.19.0)
- diesel.py ✅ (FIXED v88.19.0)
- staff.py ✅ (FIXED v88.19.0)
- daily_report.py ✅ (FIXED v88.19.0)
- ledgers.py ✅ (FIXED v88.19.0)

## JS Backend Date Format Fix (desktop-app + local-server) - COMPLETED
All export routes in BOTH `/app/desktop-app/routes/` and `/app/local-server/routes/` now use `fmtDate()` for dates in PDF/Excel/HTML outputs:
- cashbook.js ✅ (Excel pre-processed rows + PDF rows)
- daily_report.js ✅ (writeRow + Excel title)
- gunny_bags.js ✅ (Excel, PDF, HTML purchase report)
- reports.js ✅ (Party Ledger Excel cells)
- diesel.js ✅ (Excel cells + PDF rows)
- mill_parts.js ✅ (Part summary PDF + Excel)
- dc_payments.js ✅ (Excel DC entries, deliveries, MSP payments + HTML delivery slip)
- truck_lease.js ✅ (PDF + Excel start/end dates)
- report_config.json ✅ (All date columns: type 'text' → 'date' for auto-format via fmtVal)

## Date Format Validator Health Check - COMPLETED
- Python backend: Startup check (`run_startup_date_check`) validates `fmt_date()` + scans DB collections
- Python API: `GET /api/health/date-format` returns full validation report
- JS backends: `runStartupDateCheck()` validates `fmtDate()` + checks report_config.json column types
- JS API: `GET /api/health/date-format` returns validation report
- Bug found & fixed: Python `fmt_date()` was reversing already-formatted DD-MM-YYYY dates (missing `len(parts[0]) == 4` check)

## JS Backend Ascending Sort Fix for ALL Exports - COMPLETED
All PDF/Excel export handlers in BOTH desktop-app and local-server now sort data ascending by date (oldest first):
- exports.js: Mill entries Excel/PDF, Truck payments Excel/PDF, Paddy Custody Excel/PDF
- reports.js: Party Ledger Excel/PDF, Agent-Mandi-Wise Excel/PDF
- private_trading.js: Pvt Paddy Excel/PDF, Rice Sales Excel/PDF
- vehicle_weight.js: VW Export Excel/PDF
- dc_payments.js: DC Entries Excel/PDF, MSP Payments Excel/PDF
- gunny_bags.js: Gunny Bags Excel/PDF
- mill_parts.js: Parts Stock Excel/PDF, Part Detail Excel/PDF
- staff.js: Staff Payments Excel/PDF
- cmr_exports.js (local-server): Milling Report, FRK Purchases, Byproduct Sales, Paddy Custody
- ledgers.js (local-server): Party Ledger Excel/PDF
- Total: Desktop-app 49 sorts, Local-server 59 sorts (extra from cmr_exports + ledgers)

## RST Number Sequential Sorting - COMPLETED
- All export handlers in desktop-app, local-server, AND Python backend now sort by date ascending THEN rst_no ascending
- Same-date entries will show RST 1, 2, 3... instead of random order

## Mandi Column Width Increased - COMPLETED
- exports.js: PDF Mandi width 40→55, Excel width 14→22
- vehicle_weight.js: PDF Mandi width 55→72, Excel Mandi width 15→22
- report_config.json: private_paddy_report/party_summary width_pdf_mm→35, width_excel→20

## Export Preview Feature - REMOVED (v88.21.0)
- User ne request kiya "bekar hai" — ExportPreviewDialog.jsx deleted
- 20 files se 30+ ExportPreviewDialog instances remove kiye
- WhatsNew changelog entries bhi clean kiye

## Upcoming Tasks
- [ ] P1: Daily Summary Report (Auto) - End of day summary of entries, payments, cash position

## Bug Fixes (v88.21.0)
- [x] KG & QNTL fields now disabled in edit mode (editingId set) - prevents manual weight tampering
- [x] ESC key no longer closes parent photo dialog when zoom overlay is open (VehicleWeight, AutoWeightEntries, ViewEntryDialog)
- [x] AutoWeightEntries missing ESC handler for zoom overlay - added useEffect with stopImmediatePropagation

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
