# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool. 3 backends (Python/FastAPI, Node.js local-server, Electron desktop-app), React frontend.

## Implemented Features

### Core
- Mill entries with 20+ columns
- Cash Book with edit, sync to Party Ledger
- Diesel/Pump Account with filters
- Staff Management (attendance, advance, salary, settlement)
- Mill Parts Stock (purchase, usage, party ledger auto-entry, settle)
- Local Party Account with settle feature
- Reports: Daily, Outstanding, CMR vs DC, Season P&L
- PDF & Excel exports for all reports (44 total)

### Auto-Update (v3.0.0+)
- GitHub Actions workflow, electron-updater, silent error handling
- Version auto-read from package.json

### v3.1.0 - Bug Fixes
- Attendance Save (desktop), Daily Report Blank Page, Daily Report PDF redesign

### v3.2.0 - Mill Parts Export & Filters
- Date/Part/Type/Party filters on Transactions tab
- Transaction PDF/Excel export with professional styling

### v3.3.0 - Part-wise Summary + PDF Audit
- Part-wise Summary tab (per-part stats + party breakdown + recent transactions)
- Party Name filter on transactions
- Professional PDF helper (pdf_helpers.js) for ALL PDFs
- Season P&L, CMR vs DC, Local Party PDFs redesigned
- Agent Payments PDF bug fixed (missing get_company_name)
- All 44 exports verified passing

### v3.3.1 (2026-03-09) - Critical Fixes + Quick Monthly Report
- Fixed Electron UNHANDLED_REJECTION crash: Added safeExecuteJS wrapper for all auto-updater executeJavaScript calls
- Fixed Staff Attendance PDF parity: Added Page 2 (Monthly Summary) to desktop-app and local-server PDF exports
- Fixed Staff Attendance Excel parity: Added Breakdown and Month-wise Estimated Salary sections to Excel Sheet 2
- **NEW: Quick Monthly Report tab** in Staff section:
  - Auto-loads current month attendance summary
  - Staff Name filter dropdown
  - Summary cards (Total Staff, P, A, H, CH, Est. Salary)
  - Detailed table with per-staff breakdown
  - Total row for multi-staff view
  - Excel and PDF export buttons

## Build & Release
```
Save to GitHub -> Create Release (tag vX.Y.Z) -> GitHub Actions auto builds
```

## Credentials
- Admin: admin / admin123 | Staff: staff / staff123

## Backlog
- P1: Publish stable v3.3.1 release (requires user to create GitHub release)
- P1: GitHub Actions build stability (re-run if 503 error)
- P2: Refactor desktop-app/main.js modular routes
- P2: UI improvements (dashboard, dark mode, charts)
