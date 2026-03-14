# NAVKAR AGRO - Mill Entry System PRD

## Original Problem Statement
Web application + Desktop application (Electron) for managing mill entries, cash book, payments, reports and balance sheet for a rice mill operation. The web app is the "source of truth" for correct behavior.

## Tech Stack
- Frontend: React + Shadcn UI + Tailwind CSS
- Web Backend: FastAPI + MongoDB
- Desktop Backend: Express + NeDB/JSON
- Desktop: Electron

## What's Been Implemented

### Session 1 (Previous) - Desktop Sync
- Desktop app login fix, 35+ missing endpoints synced
- Frontend rebuild workflow established

### Session 2 (2026-03-14) - Bug Fixes
- ErrorBoundary for blank page crash prevention
- Balance Sheet: Agent accounts from entries+ledger (fixed wrong field names)
- Cash Book DELETE: Truck/agent payment revert
- Desktop cashbook: Case-insensitive agent detection + retroactive fix
- Enhanced cleanup script: wrong txn_type + missing party_type fix
- PrintButton: Electron compatibility

### Session 2.1 (2026-03-14) - Agent Name + Error Reporting
- Agent name in Agent/Mandi Payments from entries (not mandi_targets)
- Cash Book agent suggestions: new /api/cash-book/agent-names endpoint
- Desktop error reporting: preload.js + IPC + Help menu

### Session 2.2 (2026-03-14) - Comprehensive Audit
- **Route parity: 98%** (only 7 migration utilities + 1 dashboard-pdf missing)
- Fixed Balance Sheet PDF/Excel agent logic (still had old broken code)
- Added Agent party type to desktop Party Ledger reports
- Added null safety for desktop reports.js
- **All tests passed: iteration_88 (12/12) + iteration_89 (11/11 + UI)**
- Full audit report: /app/memory/AUDIT_REPORT.md
- Frontend rebuilt → v25.1.3

## Pending Issues
- P0: Blank page crash root cause (ErrorBoundary added as safety net, error reporting added for debugging)
- P1: Print preview in Electron (improved, needs user testing)

## Prioritized Backlog
### P1
- Dashboard PDF export endpoint for desktop
### P2
- Login debug panel removal
- PDF/Excel generation logic refactor (duplicated in fy_summary)
- Stock calculation centralization
- App.js breakdown (2700+ lines)

## Credentials
- Username: admin / Password: admin123
