# Mill Entry System - PRD

## Original Problem Statement
Rice mill management tool ("Mill Entry System") for Navkar Agro, Jolko, Kesinga. Full-stack application with React frontend, FastAPI backend, and two Node.js backends (desktop-app for Electron, local-server for portable use).

## Core Architecture
```
/app
├── .github/workflows/build-desktop.yml   # CI/CD - builds frontend in CI
├── backend/          # Python/FastAPI backend (web preview)
├── desktop-app/      # Electron backend (OPTIMIZED)
│   ├── routes/       # 19+ modular route files + pdf_helpers.js
│   ├── frontend-build/  # Built frontend for desktop
│   └── main.js       # Core Electron process (perf optimized)
├── local-server/     # Node.js portable backend (OPTIMIZED)
│   ├── routes/       # 19+ modular route files + pdf_helpers.js
│   └── server.js     # Server bootstrap (perf optimized)
└── frontend/         # React frontend (shared across all backends)
```

## Version: 3.6.0

## What's Been Implemented
- Full entries CRUD with auto-calculations
- Truck & Agent payment management with history & invoices
- Mandi targets with progress tracking
- Cash Book (jama/nikasi) with categories and exports
- DC entries & deliveries tracking + MSP payments
- Gunny bags stock management
- Milling entries with paddy stock tracking
- Byproduct stock & sales
- FRK purchases & stock tracking
- Paddy custody register
- Private paddy trading & rice sales
- Reports: CMR vs DC, outstanding, party ledger with all party types
- Diesel pump/accounts management with exports
- Mill parts stock management
- Staff attendance with monthly reports & salary calculation
- Daily reports, P&L reports, Local party accounts
- Excel import, Backups (auto + manual)
- Branding customization, Multi-user auth (admin/staff)
- All PDF/Excel exports: professional, centered styling
- Print-friendly views (all pages)
- Performance optimization (compression, caching, debounced DB saves)

## Completed Tasks (Mar 10, 2026 - Current Session)
- [x] Performance Optimization:
  - Database save debouncing (300ms) to reduce disk writes
  - Gzip compression middleware for all responses
  - Static file caching (1 year for JS/CSS, no-cache for HTML)
  - BrowserWindow: backgroundColor, no spellcheck, v8CacheOptions='code'
- [x] Print-Friendly Views:
  - Global @media print CSS (light theme, clean borders, proper formatting)
  - Print button in main toolbar (visible on all pages)
  - Print header with company name, page title, FY year
  - Hidden nav/sidebar/buttons during print
- [x] Version bumped to 3.6.0
- [x] 6 critical parity issues fixed (PDFs centered, salary calc, party ledger, etc.)
- [x] Build pipeline fixed (GitHub Actions builds frontend in CI)
- [x] Mill Parts dropdown fix (Radix Select portal → native select)

## Prioritized Backlog
### P0
- User verification: Desktop app update working after v3.6.0 release
### P2
- Additional UI improvements (if requested)

## Key Credentials
- Admin: admin / admin123
- Staff: staff / staff123
