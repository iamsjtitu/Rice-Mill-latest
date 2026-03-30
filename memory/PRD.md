# Mill Entry System - PRD

## Current Version: v55.19.1

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture.

## What's Been Implemented (Latest)
- **v55.19.1**: Bug fix — Cash/Diesel now correctly saved during Second Weight capture (backend update_second_weight + frontend handleSaveSecondWt). Verified: Vehicle Weight does NOT create accounting entries, only Mill Entries does.
- **v55.19.0**: Scale auto-connects (no Simulate button), RST editable, Delete in pending list.
- **v55.18.0**: Cash/Diesel fields, Weight Slip PDF, RST auto-fill in Entries, Inline Second Weight.
- **v55.16.0-v55.17.0**: AutoSuggest, RST Net Weight auto-fill
- **v55.13.0-v55.15.0**: 3-column layout, GOVT PADDY default

## Key Features
- Triple Backend System (Python FastAPI + Electron/Express + Local Express)
- Double-entry accounting with Cash Book, Party Ledgers
- Mill Entries with auto-calculations
- Auto Vehicle Weight with auto-connected scale, editable RST, camera feed
- RST auto-fill between Vehicle Weight and Mill Entries (Vehicle, Party, Mandi, Net Wt, Cash, Diesel)
- Vehicle Weight Cash/Diesel stored ONLY as data — accounting entries created ONLY from Mill Entries save
- Weight Slip PDF, WhatsApp/Telegram, Excel/PDF exports

## Prioritized Backlog
### P2 - Future
- Export Preview feature
- Code deduplication across Desktop/Local JS backends
- Centralize payment/stock logic
- Electron Serial Port for real weighbridge
- Refactor App.js (~2500 lines)

## Testing Status
- iteration_131.json: Scale auto-connect + RST editable + Pending delete - ALL PASS
