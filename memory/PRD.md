# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool ("Mill Entry System") for Navkar Agro, Jolko, Kesinga. Full-stack application with React frontend, FastAPI backend, and two Node.js backends (desktop-app for Electron, local-server for portable use).

## Core Architecture
```
/app
├── .github/workflows/build-release.yml   # CI/CD for desktop app
├── backend/          # Python/FastAPI backend (web preview)
├── desktop-app/      # Electron backend (MODULARIZED - Feb 2026)
│   ├── routes/       # 19 modular route files
│   │   ├── auth.js, entries.js, dashboard.js, payments.js
│   │   ├── cashbook.js, dc_payments.js, gunny_bags.js, milling.js
│   │   ├── private_trading.js, reports.js, diesel.js, exports.js
│   │   ├── backups.js, staff.js, mill_parts.js, daily_report.js
│   │   ├── reports_pnl.js, local_party.js, import_excel.js
│   │   ├── excel_helpers.js, pdf_helpers.js, safe_handler.js
│   └── main.js       # Core Electron process only (~1273 lines)
├── local-server/     # Node.js portable backend (MODULARIZED - Feb 2026)
│   ├── routes/       # 19 modular route files (incl. diesel.js)
│   └── server.js     # Server bootstrap only (~691 lines)
└── frontend/         # React frontend (shared across all backends)
```

## What's Been Implemented
- Full entries CRUD with auto-calculations (qntl, gbw, moisture, cutting, final weight)
- Truck & Agent payment management with history
- Mandi targets with progress tracking
- Cash Book (jama/nikasi) with categories and exports
- DC entries & deliveries tracking + MSP payments
- Gunny bags stock management
- Milling entries with paddy stock tracking
- Byproduct stock & sales (bran, kunda, broken, kanki, husk)
- FRK purchases & stock tracking
- Paddy custody register
- Private paddy trading & rice sales
- Reports: outstanding, party ledger with exports
- Diesel pump/accounts management with exports
- Mill parts stock management
- Staff attendance with monthly reports
- Daily reports
- P&L reports
- Local party accounts
- Excel import functionality
- Backups (auto + manual)
- Branding customization
- Multi-user auth (admin/staff roles)
- All PDF/Excel exports with professional styling

## Completed Tasks (Feb 2026 - Current Session)
- [x] Modularized desktop-app/main.js: 3300 → 1273 lines (13 new route files created)
- [x] Modularized local-server/server.js: 820 → 691 lines (diesel.js route created)
- [x] Created shared excel_helpers.js for professional Excel styling
- [x] All route modules verified loading correctly
- [x] Full regression test passed (25/25 backend tests, frontend login flow)

## Completed Tasks (Previous Sessions)
- [x] Critical Electron App Crash Fix (safeExecuteJS wrapper)
- [x] Staff Attendance Export Parity Fix (PDF/Excel consistency)
- [x] Quick Monthly Report feature for Staff page
- [x] Auto-Update UX confirmation dialog

## Prioritized Backlog
### P0 - None currently
### P1
- GitHub Actions build stability monitoring (user action pending)
### P2
- UI improvements (dashboard enhancements, dark mode, charts)

## Key Credentials
- Admin: admin / admin123
- Staff: staff / staff123
