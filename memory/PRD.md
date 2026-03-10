# Mill Entry System - PRD

## Version: 3.6.2

## Original Problem Statement
Rice mill management tool ("Mill Entry System") for Navkar Agro. Full-stack app: React frontend, FastAPI backend, Electron desktop + local-server Node.js backends.

## All Implemented Features (Complete)
- Full entries CRUD with auto-calculations
- Truck & Agent payment management with invoices
- Mandi targets with progress tracking
- Cash Book (jama/nikasi) with opening balance carry forward (Tally-style)
- DC entries & deliveries tracking + MSP payments
- Gunny bags stock management
- Milling entries with paddy stock tracking
- Byproduct stock & sales, FRK purchases & stock
- Paddy custody register
- Private paddy trading & rice sales
- Reports: CMR vs DC, outstanding, party ledger (all party types)
- Diesel pump/accounts with exports
- Mill parts stock management
- Staff: attendance, monthly report (with advance col), advance ledger (debit/credit/balance), salary payment (single + bulk settle)
- Daily reports, P&L reports, Local party accounts (search + all parties view)
- Excel import, Backups (auto + manual)
- Branding, Multi-user auth (admin/staff)
- All PDF/Excel exports: centered, dd-mm-yyyy date format
- Print-friendly views, Performance optimization

## Completed Tasks (v3.6.2)
- [x] Multiple staff salary settlement ("Settle All" button)
- [x] Desktop typing fix (webContents focus on window focus/show)
- [x] FY Year Opening Balance (Tally-style carry forward in Node.js cashbook)
- [x] All PDFs centered, dd-mm-yyyy date format
- [x] Advance Ledger: full debit/credit/balance with staff filter, PDF/Excel
- [x] Monthly Report: advance amount column
- [x] Advance Deduct auto-fill in salary settlement
- [x] Part-wise Summary: search all parts (master + summary)
- [x] Local Party: standalone search input
- [x] Performance: compression, caching, debounced saves
- [x] Build pipeline: GitHub Actions builds frontend in CI

## Key Credentials
- Admin: admin / admin123
- Staff: staff / staff123
