# Mill Entry System - PRD

## Current Version: v55.19.2

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture.

## What's Been Implemented (Latest)
- **v55.19.2**: Vehicle No AutoSuggest in Auto Vehicle Weight — same as Entries, suggests previously used vehicle numbers from both Mill Entries and Vehicle Weight history.
- **v55.19.1**: Cash/Diesel save during Second Weight, verified Vehicle Weight does NOT create accounting entries.
- **v55.19.0**: Scale auto-connects, RST editable, Delete in pending list.
- **v55.18.0**: Cash/Diesel fields, Weight Slip PDF, RST auto-fill in Entries, Inline Second Weight.

## Key Features
- Triple Backend (Python FastAPI + Electron/Express + Local Express)
- Double-entry accounting, Cash Book, Party Ledgers
- Mill Entries with auto-calculations
- Auto Vehicle Weight: auto-connected scale, editable RST, camera feed, Vehicle No AutoSuggest
- RST auto-fill between Vehicle Weight → Mill Entries
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
