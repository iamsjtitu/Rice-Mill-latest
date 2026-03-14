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
│   ├── routes/              # Desktop Express backend
│   ├── frontend-build/      # Rebuilt React frontend for desktop
│   ├── main.js              # Electron main + cleanup + error reporting
│   ├── preload.js           # Enhanced with error logging IPC
│   └── package.json         # v25.1.2
├── frontend/src/
│   ├── components/
│   │   ├── ErrorBoundary.jsx  # Prevents blank page crashes + Electron error logging
│   │   ├── PrintButton.jsx    # Electron-compatible printing
│   │   ├── CashBook.jsx       # Now includes agent/mandi names in dropdown
│   │   └── cashbook/
│   └── App.js                 # ErrorBoundary wraps all tabs
├── backend/routes/
│   ├── cashbook.py            # Agent-names endpoint + truck/agent payment revert
│   ├── fy_summary.py          # Balance sheet: agent calc from entries+ledger
│   └── payments.py            # Agent_name from entries (not mandi_targets)
└── memory/PRD.md
```

## What's Been Implemented

### Session 1 (Previous)
- Desktop app login fix ✅
- 35+ missing API endpoints synced ✅
- Cash Book & Payment logic fixes ✅
- Data cleanup script for orphaned ledger entries ✅
- Frontend rebuild workflow established ✅

### Session 2 (2026-03-14)
- ErrorBoundary added to prevent blank page crashes ✅
- Balance Sheet Fix: Agent accounts from entries+ledger ✅
- Cash Book DELETE: Truck/agent payment revert ✅
- Desktop cashbook: Case-insensitive agent detection ✅
- Cleanup script: Fix wrong txn_type + missing party_type ✅
- PrintButton: Electron compatibility ✅

### Session 2.1 (2026-03-14) - Current
- **Agent name in Agent/Mandi Payments**: Now fetched from entries (first entry for that mandi) instead of mandi_targets ✅
- **Cash Book agent suggestions**: New `/api/cash-book/agent-names` endpoint returns mandi names, truck numbers, agent names from entries ✅
- **Desktop error reporting**: 
  - Enhanced preload.js: catches renderer errors, sends to main process ✅
  - IPC handlers for frontend error logging ✅
  - Help menu: "Error Log Dekhein" (Ctrl+Shift+L), "Developer Console" (Ctrl+Shift+I), "Error Log Clear Karein" ✅
  - ErrorBoundary sends errors to desktop log ✅
- Frontend rebuilt, v25.1.2 ✅

## Pending Issues
- P0: Blank page crash in Party Ledger - ErrorBoundary added as safety net + error reporting for debugging. Needs user testing with console screenshot.
- P1: Print preview in Electron - improved, needs user testing

## Prioritized Backlog

### P0 (Critical)
- Verify blank page crash resolved after ErrorBoundary + desktop fixes

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
