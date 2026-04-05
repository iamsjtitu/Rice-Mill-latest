# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, LAN network access, multi-user data safety, and role-based access control.

## Current Version: v88.8.0

## Architecture
- Triple Backend: Python (web), Desktop JS (Electron), Local JS (LAN)
- Frontend: React with shadcn/ui
- All three backends share identical business logic
- Shared report_config.json for report column definitions

## Global Systems
- **Rounding**: `round_amount(val)` / `roundAmount(val)`: >.50 rounds up, <=.50 rounds down (Python, JS, Frontend). Fixed 72 broken `round_amount(val, 2)` calls in Python and 60+ broken `roundAmount(val*100)/100` no-op patterns in JS
- **Date Format**: DD-MM-YYYY globally via `fmt_date()` / `fmtDate()` across ALL exports (Excel/PDF) and report_helper
- **File Watcher**: Desktop/Local-server poll JSON file every 5s for Google Drive sync detection

## Completed Features
- [x] Global round figure amount system (FIXED in all backends - was broken in JS)
- [x] Duplicate RST/TP blocking with real-time warning toast
- [x] TP duplicate shows which RST has it
- [x] Toast expand=true (no hover needed)
- [x] Vehicle/Party/Source suggestions from mill_entries + vehicle_weights
- [x] Enter key navigation reaches Save button
- [x] Auto Weight Entries edit fix
- [x] Login page Enter key navigation (Username -> Enter -> Password -> Enter -> Login)
- [x] Rice Stock Split: Raw vs Parboiled in APIs and DC Tracker
- [x] Image Upload Crash fix (Buffer support in JS backends)
- [x] Global Date Format DD-MM-YYYY in ALL Excel and PDF exports (Python + JS backends)
- [x] Mill Entries - expandable row details on click (KMS Year, Season, Cutting, KG, Created By, Remark)
- [x] Paddy Purchase Register row click navigates to Mill Entries tab with highlighted entry
- [x] Google Drive LAN sync file watcher (5s polling) in desktop-app and local-server

## Upcoming Tasks
- [ ] P1: Daily Summary Report (Auto)
- [ ] P2: Export Preview feature

## Future Tasks
- [ ] P3: Python backend service layer refactoring
- [ ] P3: Centralized stock calculation logic
