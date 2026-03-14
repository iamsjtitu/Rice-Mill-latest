# NAVKAR AGRO - Mill Entry System PRD

## Original Problem Statement
Web application + Desktop application (Electron) for managing mill entries, cash book, payments, reports and balance sheet for a rice mill operation. The web app is the "source of truth" for correct behavior. All bug reports and feature requests pertain to the desktop application. After every fix, frontend must be rebuilt and copied to the desktop app.

## User Personas
- Mill owner/admin: Uses the desktop app daily for financial tracking, entries, and reporting.

## Core Requirements
- Mill Entry management (paddy purchase tracking)
- Cash Book (jama/nikasi transactions with auto-ledger)
- Payments (truck, agent, private paddy)
- Reports (Party Ledger, Outstanding Report, DC Tracker)
- Balance Sheet (FY Summary with accurate calculations)
- Print functionality across all sections
- Desktop app must match web app behavior

## Tech Stack
- Frontend: React + Shadcn UI + Tailwind CSS
- Web Backend: FastAPI + MongoDB
- Desktop Backend: Express + NeDB/JSON
- Desktop: Electron

## Architecture
```
/app
├── desktop-app/
│   ├── src/api/routes/      # Desktop Express backend
│   ├── frontend-build/      # Rebuilt React frontend for desktop
│   ├── main.js              # Electron main process + cleanup scripts
│   └── package.json
├── frontend/src/
│   ├── components/          # Shared React components
│   │   ├── ErrorBoundary.jsx  # NEW: Prevents blank page crashes
│   │   ├── PrintButton.jsx    # UPDATED: Electron-compatible printing
│   │   ├── CashBook.jsx
│   │   ├── Ledgers.jsx
│   │   └── cashbook/
│   └── App.js               # UPDATED: ErrorBoundary wraps all tabs
├── backend/routes/
│   ├── cashbook.py           # UPDATED: Truck/Agent payment revert on delete
│   ├── fy_summary.py         # UPDATED: Balance sheet agent calc from entries+ledger
│   ├── payments.py
│   └── reports.py
└── memory/
    └── PRD.md
```

## What's Been Implemented

### Session 1 (Previous)
- Desktop app login fix ✅
- 35+ missing API endpoints synced ✅
- Cash Book & Payment logic fixes ✅
- Data cleanup script for orphaned ledger entries ✅
- Frontend rebuild workflow established ✅

### Session 2 (2026-03-14) - Current
- **ErrorBoundary** added to prevent blank page crashes ✅
- **Balance Sheet Fix**: Agent accounts now correctly calculated from mill_entries (total) + ledger nikasi (paid), instead of wrong field names from agent_payments ✅
- **Cash Book DELETE Fix**: Now properly reverts truck/agent payment amounts when deleting linked cash book entries ✅
- **Desktop cashbook.js**: Case-insensitive agent detection + retroactive party_type fix ✅
- **Desktop reports.js**: Added Agent party type to Party Ledger + safety checks ✅
- **Desktop cleanup script**: Enhanced to fix wrong txn_type auto-ledger entries + fill missing party_types ✅
- **PrintButton**: Improved for Electron compatibility ✅
- **Frontend rebuilt** and copied to desktop-app ✅
- **Version bumped** to 25.1.1 ✅
- **All tests passed**: 12/12 backend + all frontend (iteration_88) ✅

## Pending Issues
- P0: Blank page crash - ErrorBoundary added as safety net. Root cause needs console screenshot from user (Party Ledger search)
- P1: Print preview in Electron - improved but needs user testing on desktop

## Prioritized Backlog

### P0 (Critical)
- Verify blank page crash is resolved after ErrorBoundary + desktop fixes

### P1 (Important)
- Comprehensive audit: Compare all desktop features vs web features
- Test all print buttons across the application

### P2 (Nice to have)
- Login debug panel removal
- PDF/Excel generation logic refactor
- Stock calculation centralization
- App.js breakdown (2700+ lines)

## Credentials
- Username: admin
- Password: admin123
