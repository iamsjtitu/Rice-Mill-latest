# Rice Mill Management System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities. Must maintain perfect parity between web (Python/MongoDB) and desktop (Node.js/Local JSON) versions.

## Architecture
- **Frontend**: React (Vite) with Shadcn UI
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Triple Parity**: All logic changes in Python must be mirrored in desktop-app and local-server JS routes

## Current Version: v88.74.0

## Completed Features (Latest First)
- v88.74.0: Export Totals Fix + UI Fixes
  - TP Weight totals in Mill Entries, VW, and Daily Report PDF/Excel exports
  - Eye/View dialog now shows TP Weight (Q) field
  - Paddy Purchase Register TOTAL row alignment fix (colSpan shifted due to TP Wt column)
  - VW Excel totals row added (Bags, 1st/2nd/Net Wt, TP Wt, G.Issued, Cash, Diesel)
  - VW PDF TP Wt and G.Issued totals fix
  - Daily Report TP Weight column in summary + detail mode
  - TotalsResponse model updated with total_tp_weight
  - Triple Parity: All fixes mirrored to desktop-app and local-server
- v88.73.0: TP Wt Export + Cascade Edit
- v88.72.0: Error Message Fix
- v88.71.0: VW Create Fix
- v88.70.0: TP Weight & Edit Dialog Fixes

## Key DB Schema
- `vehicle_weights`: {id, date, rst_no, vehicle_no, party_name, farmer_name, product, trans_type, tot_pkts, first_wt, second_wt, net_wt, tp_no, tp_weight, g_issued, cash_paid, diesel_paid}
- `mill_entries`: {id, date, kms_year, season, truck_no, rst_no, tp_no, tp_weight, agent_name, mandi_name, kg, qntl, bag, g_deposite, gbw_cut, mill_w, plastic_bag, p_pkt_cut, moisture, moisture_cut, cutting_percent, disc_dust_poll, final_w, g_issued, cash_paid, diesel_paid}

## Upcoming Tasks
- P1: Export Preview feature (preview data before exporting)
- P2: Python backend service layer refactoring
- P2: Centralize stock calculation logic
- P3: Triple backend code deduplication

## Key Files Modified in v88.74.0
- `/app/backend/models.py` - TotalsResponse: added total_tp_weight
- `/app/backend/routes/entries.py` - Aggregation pipeline + Excel/PDF totals row
- `/app/backend/routes/daily_report.py` - PDF summary + Excel summary with TP Weight
- `/app/shared/report_config.json` - daily_paddy_entries_report: tp_weight in summary + detail
- `/app/frontend/src/components/ViewEntryDialog.jsx` - Added TP Weight (Q) field
- `/app/frontend/src/components/PaddyPurchaseRegister.jsx` - Fixed TOTAL row colSpan
- `/app/desktop-app/routes/exports.js` - Mill Entries Excel/PDF: TP Wt column + totals
- `/app/desktop-app/routes/vehicle_weight.js` - VW Excel totals row, PDF TP/G.Issued totals
- `/app/desktop-app/routes/daily_report.js` - Excel summary with TP Wt
- `/app/desktop-app/routes/daily_report_logic.js` - PDF summary + data with tp_weight
- `/app/local-server/routes/` - All above changes mirrored

## Testing
- Test reports: /app/test_reports/iteration_179.json (21/21 pass - Export TP Weight)
- Credentials: admin / admin123
