# Rice Mill Management System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities. Must maintain perfect parity between web (Python/MongoDB) and desktop (Node.js/Local JSON) versions.

## Architecture
- **Frontend**: React (Vite) with Shadcn UI
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Triple Parity**: All logic changes in Python must be mirrored in desktop-app and local-server JS routes

## Key DB Schema
- `vehicle_weights`: {id, date, rst_no, vehicle_no, party_name, farmer_name, product, trans_type, tot_pkts, first_wt, second_wt, net_wt, tp_no, tp_weight, g_issued, cash_paid, diesel_paid}
- `mill_entries`: {id, date, kms_year, season, truck_no, rst_no, tp_no, tp_weight, agent_name, mandi_name, kg, qntl, bag, g_deposite, gbw_cut, mill_w, plastic_bag, p_pkt_cut, moisture, moisture_cut, cutting_percent, disc_dust_poll, final_w, g_issued, cash_paid, diesel_paid}

## Current Version: v88.74.0

## Completed Features (Latest First)
- v88.74.0: Export Totals Fix - TP Weight totals in Mill Entries, VW, and Daily Report PDF/Excel exports
- v88.73.0: TP Wt Export + Cascade Edit - VW/Mill Entries PDF/Excel TP Wt columns, VW cascade edit to Mill Entry
- v88.72.0: Error Message Fix - Proper error messages for TP duplicate warnings
- v88.71.0: VW Create Fix - weights2 scope error in TP duplicate check
- v88.70.0: TP Weight & Edit Dialog Fixes - QNTL storage, customer copy exclusion, diesel layout fix

## Upcoming Tasks
- P1: Export Preview feature (preview data before exporting)
- P2: Python backend service layer refactoring
- P2: Centralize stock calculation logic
- P3: Triple backend code deduplication

## Testing
- Test reports: /app/test_reports/iteration_179.json (21/21 pass - Export TP Weight)
- Credentials: admin / admin123
