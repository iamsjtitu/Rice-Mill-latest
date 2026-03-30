# Mill Entry System - PRD

## Current Version: v55.21.1

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture.

## What's Been Implemented (Latest)
- **v55.21.1**: Manual WA/Group send updated — no PDF, just complete text (RST#, Date, Vehicle, Party, Product, Pkts, Gross/Tare/Net, Cash, Diesel) + camera photos (Front View + Side View). New backend endpoint POST /api/vehicle-weight/send-manual.
- **v55.21.0**: Auto messaging on weight completion — WA + TG auto-send. Settings toggle.
- **v55.20.0**: White theme + 2 cameras.
- **v55.19.x**: Vehicle No AutoSuggest, Cash/Diesel fix, Scale auto-connect, RST editable, Delete.

## Key Features
- Triple Backend (Python FastAPI + Electron/Express + Local Express)
- Double-entry accounting, Cash Book, Party Ledgers
- Auto Vehicle Weight: white theme, 2 cameras, auto-connected scale, editable RST, AutoSuggest
- Complete messaging: auto-send on weight completion + manual WA/Group send with text + camera photos
- RST auto-fill between Vehicle Weight → Mill Entries
- Weight Slip PDF, WhatsApp/Telegram, Excel/PDF exports

## Prioritized Backlog
### P2 - Future
- Export Preview feature
- Code deduplication across Desktop/Local JS backends
- Centralize payment/stock logic
- Electron Serial Port for real weighbridge
- Refactor App.js (~2500 lines)
