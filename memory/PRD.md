# Mill Entry System - PRD

## Current Version: v55.32.0

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture.

## Architecture
- **Triple Backend**: Python FastAPI (Web) + Electron Express (Desktop) + Local Express (LAN Server)
- **Frontend**: React with Tailwind CSS
- **Database**: MongoDB (Web) / Local JSON (Desktop & Local)
- **Hardware**: Serial Port (Electron) for Weighbridge, IP Cameras

## What's Been Implemented (Latest)
- **v55.23.0**: 
  - Electron Serial Port integration for real weighbridge hardware (COM4, 2400 baud).
  - `serial-handler.js`, `preload.js` IPC bridge, `useRealScale` / `useSimulatorScale` hooks.
  - **Vehicle Weight JS Routes Created**: `desktop-app/routes/vehicle_weight.js` and `local-server/routes/vehicle_weight.js` now fully mirror the Python `vehicle_weight.py` backend. All 13 API endpoints ported: list, pending, next-rst, auto-notify-setting, auto-notify, by-rst, send-manual, create, second-weight, delete, edit, slip-pdf. Mounted in `main.js` and `server.js`. Desktop "Data fetch error" FIXED.
- **v55.22.0**: Edit dialog, A5 Print (2 copies), manual WA/Group with complete text.
- **v55.21.x**: Auto messaging, Settings toggle, manual WA/Group updated.
- **v55.20.0**: White theme, 2 cameras.
- **v55.19.x**: AutoSuggest, Cash/Diesel fix, Scale auto-connect, RST editable, Delete.

## Key Features
- Triple Backend (Python FastAPI + Electron/Express + Local Express)
- Double-entry accounting, Cash Book, Party Ledgers
- Auto Vehicle Weight: real serial port (Electron) / simulator (web), 2 cameras, auto-messaging
- Edit, Print A5 (Party+Customer copy), Download, WA, Group, Delete actions
- RST auto-fill between Vehicle Weight → Mill Entries
- Weighbridge Configuration in Settings (COM port, baud rate, parity, stop bits)
- WhatsApp (360Messenger) & Telegram Bot integration for messaging

## Key DB Schema
- `vehicle_weights`: {id, rst_no, date, kms_year, vehicle_no, party_name, farmer_name, product, trans_type, j_pkts, p_pkts, tot_pkts, first_wt, first_wt_time, second_wt, second_wt_time, net_wt, gross_wt, tare_wt, remark, cash_paid, diesel_paid, status, created_at}
- `cash_transactions`: {id, date, account, txn_type, category, party_type, amount, linked_payment_id}
- `private_paddy`: {id, date, party_name, mandi_name, total_amount, paid_amount, balance}

## Key API Endpoints
- `/api/vehicle-weight` (GET/POST) - List/Create
- `/api/vehicle-weight/pending` (GET)
- `/api/vehicle-weight/next-rst` (GET)
- `/api/vehicle-weight/auto-notify-setting` (GET/PUT)
- `/api/vehicle-weight/auto-notify` (POST)
- `/api/vehicle-weight/by-rst/:rst_no` (GET)
- `/api/vehicle-weight/send-manual` (POST)
- `/api/vehicle-weight/:id/second-weight` (PUT)
- `/api/vehicle-weight/:id/edit` (PUT)
- `/api/vehicle-weight/:id/slip-pdf` (GET)
- `/api/vehicle-weight/:id` (DELETE)

## Tools
- **Route Sync Checker** (`/app/scripts/sync_check.py`): Compares all Python FastAPI endpoints against both JS Express backends. Cross-file matching eliminates false positives. Run modes: `--brief`, `--fix` (boilerplate), `--json`. Current sync: ~98.3%.
- **CI/CD Sync Check** (`.github/workflows/route-sync-check.yml`): Runs sync checker automatically on every push/PR that touches route files. Posts warnings to PR comments if endpoints are missing.

## Prioritized Backlog
### P2 - Future
- Export Preview feature
- Code deduplication across Desktop/Local JS backends
- Centralize payment/stock logic
- Refactor App.js (~2500 lines)
