# Rice Mill Management System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and robust data entry validation. Maintain perfect parity between the web version (Python/MongoDB) and desktop version (Node.js/Local JSON).

## Architecture
- **Frontend**: React (CRA) with Shadcn/UI + TailwindCSS
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + Local JSON
- **Local Network Backend**: Express + Local JSON (for LAN access)
- **Triple Parity Rule**: All logic changes must be replicated across all 3 backends

## Current Version: v88.66.0

## What's Been Implemented (Latest)
- **v88.66.0** (Apr 2026): TP Weight field added end-to-end
  - VehicleWeight form, table, edit dialog, photo slip, print slip
  - MillEntryForm (locked on RST fetch)
  - EntryTable column
  - Python + Desktop JS + Local JS backends (create, second-weight, edit endpoints)
  - Agent & Mandi Report (tp_weight per entry, total_tp_weight in totals)
  - report_config.json updated for Excel/PDF exports
  - Fixed hardcoded localhost URL in WhatsApp report feature

- **v88.65.0**: VW Cascade Delete + Daily Report Paddy Chalna
- **v88.64.0**: Paddy Chalna in Daily Report
- **v88.63.0**: PDF Header GST Fix
- **v88.62.0**: Paddy Chalna Export Fix
- **v88.61.0**: Paddy Chalna (Cutting) module
- Earlier: VW Linked Edit toggle, TP duplicate validation, sync-status endpoint, etc.

## Key DB Schema
- `vehicle_weights`: {id, rst_no, date, kms_year, vehicle_no, party_name, tp_no, **tp_weight**, g_issued, first_wt, second_wt, net_wt, cash_paid, diesel_paid, ...}
- `mill_entries`: {id, date, rst_no, tp_no, **tp_weight**, agent_name, mandi_name, qntl, bag, mill_w, final_w, ...}
- `cash_transactions`, `private_paddy`, `private_payments`

## Key API Endpoints
- POST/GET/PUT/DELETE `/api/vehicle-weight`
- POST/GET/PUT/DELETE `/api/entries`
- GET `/api/reports/agent-mandi-wise`
- POST `/api/cash-book/auto-fix`

## Prioritized Backlog
### P1 - Upcoming
- Export Preview feature (preview data before Excel/PDF export)

### P2 - Technical Debt
- Python backend service layer refactoring
- Centralize stock calculation logic
- Triple backend code deduplication

### P3 - Future
- OTA auto-updater verification (GitHub Actions .exe build)
