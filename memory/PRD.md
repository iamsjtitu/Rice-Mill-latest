# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v88.9.0

## Architecture
- Triple Backend: Python (web), Desktop JS (Electron), Local JS (LAN)
- Frontend: React with shadcn/ui
- All three backends share identical business logic
- Shared report_config.json for report column definitions

## Global Systems
- **Rounding**: `round_amount(val)` / `roundAmount(val)`: >.50 rounds up, <=.50 rounds down
- **Date Format**: DD-MM-YYYY globally via `fmt_date()` / `fmtDate()` across ALL exports
- **File Watcher**: Desktop/Local-server poll JSON file every 5s for Google Drive sync

## Completed Features (v88.9.0)
- [x] Global round figure amount system (FIXED in ALL 3 backends)
- [x] Duplicate RST/TP blocking with real-time warning toast
- [x] Login page Enter key navigation
- [x] Rice Stock Split: Raw vs Parboiled
- [x] Global Date Format DD-MM-YYYY in ALL exports
- [x] Mill Entries View button (Eye icon) → Dialog popup
- [x] PPR row click → Mill Entries redirect + View dialog (any date)
- [x] Dialog close → original filters restore
- [x] Google Drive LAN sync file watcher (5s polling)
- [x] Frontend build synced to desktop-app and local-server
- [x] WhatsNew + Version bumped to v88.9.0

## Upcoming Tasks
- [ ] P1: Daily Summary Report (Auto)
- [ ] P2: Export Preview feature

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
