# Rice Mill Management System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities. Must maintain perfect parity between web (Python/MongoDB) and desktop (Node.js/Local JSON) versions.

## Current Version: v88.76.0

## Architecture
- **Frontend**: React (Vite) with Shadcn UI
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Triple Parity**: All logic changes in Python must be mirrored in desktop-app and local-server JS routes

## Completed Features (This Session)
- v88.76.0: TP Weight auto-validation (red indicator on diff) + Weight Discrepancy Report (new tab)
- v88.75.0: Agent & Mandi Report TP Wt fix, Daily Report Chalna section, PPR total alignment
- v88.74.0: Export Totals Fix (Mill Entries, VW, Daily Report PDF/Excel with TP Weight)

## Bug Fixes (This Session)
- Fixed Agent & Mandi PDF row overlap in JS backends (desktop-app & local-server). Root cause: pdfkit `doc.rect().fill()` does not advance `doc.y`, causing mandi title bar text to position incorrectly and subsequent header/data rows to start inside the orange title rect. Fix: Save `titleY`, position text at `titleY+4`, explicitly set `doc.y = titleY + 20` after title bar.
- Fixed floating-point rounding bugs (`2459.8999999`) in `fmtVal` helper across Python and JS backends.

## Key Files Modified
- `/app/frontend/src/components/VehicleWeight.jsx` - Red indicator on TP Wt in edit dialog + table
- `/app/frontend/src/components/entries/MillEntryForm.jsx` - Red indicator on TP Wt input
- `/app/frontend/src/components/entries/EntryTable.jsx` - Red indicator on TP Wt in table
- `/app/frontend/src/components/WeightDiscrepancy.jsx` - New report component
- `/app/frontend/src/components/Reports.jsx` - Added Wt Discrepancy tab
- `/app/backend/routes/reports.py` - 3 new endpoints (data, excel, pdf)
- `/app/desktop-app/routes/reports.js` - 3 new endpoints mirrored + PDF row overlap fix
- `/app/local-server/routes/reports.js` - 3 new endpoints mirrored + PDF row overlap fix

## Upcoming Tasks
- P1: Export Preview feature
- P2: Python backend service layer refactoring
- P2: Centralize stock calculation logic
- P3: Triple backend code deduplication

## Testing
- Credentials: admin / admin123
