# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool ("Mill Entry System") for Navkar Agro, Jolko, Kesinga. Full-stack application with React frontend, FastAPI backend, and two Node.js backends (desktop-app for Electron, local-server for portable use).

## Core Architecture
```
/app
├── .github/workflows/build-desktop.yml   # CI/CD - NOW builds frontend in CI
├── backend/          # Python/FastAPI backend (web preview)
├── desktop-app/      # Electron backend (MODULARIZED - Feb 2026)
│   ├── routes/       # 19 modular route files
│   ├── frontend-build/  # Built frontend for desktop (also built in CI)
│   └── main.js       # Core Electron process (~1276 lines)
├── local-server/     # Node.js portable backend (MODULARIZED - Feb 2026)
│   ├── routes/       # 19 modular route files
│   └── server.js     # Server bootstrap only (~691 lines)
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
- All PDF/Excel exports with professional styling

## Completed Tasks (Mar 9-10, 2026 Session)
- [x] Fixed native "About" dialog - updated to show "Designed By: 9x.Design, Contact: +91 72059 30002"
- [x] Fixed build pipeline - workflow now builds frontend in GitHub Actions (root cause of desktop app not updating)
- [x] Fixed ajv module error in CI - added explicit ajv@8 install step
- [x] Fixed Mill Parts dropdown bug - Select inside Dialog portal conflict (Radix→native select)
- [x] Version bumped to 3.5.1
- [x] Rebuilt frontend-build and local-server/public with latest code

## Completed Tasks (Previous Sessions - Feb 2026)
- [x] Modularized desktop-app/main.js: 3300 → 1273 lines (13 new route files)
- [x] Modularized local-server/server.js: 820 → 691 lines (diesel.js route)
- [x] Created shared excel_helpers.js for professional Excel styling
- [x] Mill Parts: Part-wise Summary redesigned - search-first approach
- [x] Mill Parts: Party-wise purchase cards redesigned with beautiful UI
- [x] Mill Parts: Single part PDF/Excel export (all 3 backends)
- [x] Frontend production build verified
- [x] Critical Electron App Crash Fix (safeExecuteJS wrapper)
- [x] Staff Attendance Export Parity Fix (PDF/Excel consistency)
- [x] Quick Monthly Report feature for Staff page
- [x] Auto-Update UX confirmation dialog
- [x] Error Log "Clear" button and endpoint
- [x] UNHANDLED_REJECTION error fix (.catch() added)

## Prioritized Backlog
### P0
- User verification: Desktop app update working after new release (v3.5.1)
### P1
- Performance optimization for desktop software (user requested)
- GitHub Actions build stability monitoring
### P2
- UI improvements (dashboard enhancements, dark mode, charts)

## Key Credentials
- Admin: admin / admin123
- Staff: staff / staff123
