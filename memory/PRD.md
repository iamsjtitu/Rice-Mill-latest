# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool ("Mill Entry System") for Navkar Agro, Jolko, Kesinga. Full-stack application with React frontend, FastAPI backend, and two Node.js backends (desktop-app for Electron, local-server for portable use).

## Core Architecture
```
/app
├── .github/workflows/build-desktop.yml   # CI/CD - builds frontend in CI
├── backend/          # Python/FastAPI backend (web preview)
├── desktop-app/      # Electron backend (MODULARIZED)
│   ├── routes/       # 19 modular route files + pdf_helpers.js
│   ├── frontend-build/  # Built frontend for desktop
│   └── main.js       # Core Electron process
├── local-server/     # Node.js portable backend (MODULARIZED)
│   ├── routes/       # 19 modular route files + pdf_helpers.js
│   └── server.js     # Server bootstrap
└── frontend/         # React frontend (shared across all backends)
```

## What's Been Implemented
- Full entries CRUD with auto-calculations
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
- Daily reports, P&L reports, Local party accounts
- Excel import functionality, Backups (auto + manual)
- Branding customization, Multi-user auth (admin/staff)
- All PDF/Excel exports with professional centered styling

## Completed Tasks (Mar 10, 2026)
- [x] Fixed 6 critical parity issues between preview and desktop app
- [x] PDF centering: All PDFs now centered on page (pdf_helpers.js rewrite)
- [x] Salary calculation: Fixed param mismatch (period_from/to) and response field parity
- [x] Staff Payments: Added PDF export support (was Excel only)
- [x] Party Ledger: Complete rewrite with all party types (truck, cash, FRK, buyer, pvt paddy, rice)
- [x] Outstanding Report: Professional table-based PDF/Excel
- [x] Build pipeline: Fixed to build frontend in GitHub Actions CI
- [x] About dialog: Updated to show "Designed By: 9x.Design"
- [x] Mill Parts dropdown: Fixed Radix Select portal conflict in Electron (native select)
- [x] Version bumped to 3.5.2
- [x] All changes synced to both desktop-app and local-server

## Previous Completed Tasks (Feb-Mar 2026)
- [x] Modularized desktop-app/main.js and local-server/server.js
- [x] Mill Parts UI overhaul with search-first approach
- [x] UNHANDLED_REJECTION error fix
- [x] Staff Attendance Export Parity
- [x] Quick Monthly Report for Staff page
- [x] Auto-Update UX confirmation dialog
- [x] Error Log Clear button

## Prioritized Backlog
### P0
- User verification: Desktop app update working after v3.5.2 release
### P2
- Performance optimization (if needed)
- UI improvements

## Key Credentials
- Admin: admin / admin123
- Staff: staff / staff123
