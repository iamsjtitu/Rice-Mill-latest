# Mill Entry System - PRD

## Version: 3.6.1

## Original Problem Statement
Rice mill management tool ("Mill Entry System") for Navkar Agro. Full-stack app: React frontend, FastAPI backend, Electron desktop + local-server Node.js backends.

## Completed Tasks (Mar 10, 2026 - Current Session)
- [x] ALL PDF tables centered on page (pdf_helpers.js, daily_report.js rewrite)
- [x] Date format: yyyy-mm-dd → dd-mm-yyyy in ALL PDFs (fmtDate helper)
- [x] Salary Payment fix: param mismatch (period_from/to), response field parity, auto-fill advance deduct
- [x] Staff Advance Ledger: full ledger view (debit/credit/running balance), staff filter, PDF/Excel export
- [x] Monthly Report: advance amount column added
- [x] Part-wise Summary: search includes all parts from summary (not just master)
- [x] Local Party: standalone search input (not inside Radix Select portal)
- [x] Party Ledger: rewrite with all party types, fmtDate
- [x] Outstanding Report: professional table-based PDF/Excel
- [x] Staff Payments: PDF export support added
- [x] Performance: compression, caching, debounced DB saves
- [x] Print-friendly views: @media print CSS, Print button
- [x] Build pipeline: GitHub Actions builds frontend in CI
- [x] Mill Parts dropdown fix (Radix Select → native select in dialogs)

## Remaining / Next Tasks
- [ ] Multiple staff salary settlement at once
- [ ] Desktop typing/input focus issue investigation
- [ ] FY Year Opening Balance system (like Tally - closing → opening carry forward)

## Key Credentials
- Admin: admin / admin123
- Staff: staff / staff123
