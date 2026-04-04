# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local SQLite storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v88.5.0

## Architecture
- Triple Backend: Python (web), Desktop JS (Electron), Local JS (LAN)
- Frontend: React with shadcn/ui
- All three backends share identical business logic

## Global Rounding System (v88.6.0)
- `round_amount(val)`: >.50 rounds up, <=.50 rounds down
- Python: `models.py`, JS: `safe_handler.js`, Frontend: `utils/constants.js`
- Applied to all `"amount"` fields across all route files

## Completed Features (v88.5.0+)
- [x] Global round figure amount system (entire software)
- [x] Duplicate RST/TP blocking with real-time warning toast
- [x] TP duplicate shows which RST has it
- [x] Toast expand=true (no hover needed)
- [x] Vehicle/Party/Source suggestions from mill_entries + vehicle_weights
- [x] Enter key navigation reaches Save button
- [x] Auto Weight Entries edit fix

## Upcoming Tasks
- [ ] P0: Version bump v88.6.0
- [ ] P1: Daily Summary Report (Auto)
- [ ] P2: Export Preview feature

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
