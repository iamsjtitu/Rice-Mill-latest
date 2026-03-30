# Mill Entry System - PRD

## Current Version: v55.18.0

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture.

## What's Been Implemented (Latest)
- **v55.18.0**: Cash Paid + Diesel Paid fields in Vehicle Weight. Weight Slip PDF redesigned with company header (from Settings), Gross/Tare/Net weights, Cash/Diesel section. RST auto-fill in Entries now includes cash_paid and diesel_paid. **Inline Second Weight Capture** - clicking pending vehicle loads details into main form for second weight capture (no popup dialog). Verified E2E: RST auto-fill → Mill Entry save → auto truck payment/ledger entries created.
- **v55.16.0-v55.17.0**: AutoSuggest for Party/Mandi, RST Net Weight auto-fill
- **v55.13.0-v55.15.0**: 3-column Keshav Computer-style layout, Second Weight Auto Capture, GOVT PADDY default + target auto-fill
- **v55.9.0-v55.12.0**: Vehicle Weight feature, sub-tab under Entries, exports fix (Cash/Diesel columns removed from Desktop/Local exports)

## Key Features
- Triple Backend System (Python FastAPI + Electron/Express + Local Express)
- Double-entry accounting with Cash Book, Party Ledgers
- Mill Entries with auto-calculations (QNTL, GBW, Cutting, Moisture)
- Auto Vehicle Weight with 3-column UI, live scale simulator, camera feed
- RST-based auto-fill between Vehicle Weight and Mill Entries
- Weight Slip PDF generation
- WhatsApp/Telegram messaging integration
- Excel/PDF export across all backends
- Mandi Targets management
- Staff management

## Prioritized Backlog
### P2 - Future
- Export Preview feature (preview before exporting)
- Code deduplication across Desktop and Local server JS backends
- Centralize payment and stock calculation logic
- Electron Serial Port for real weighbridge hardware
- Refactor App.js (~2500 lines) into smaller modules

## Testing Status
- iteration_129.json: Previous session tests
- iteration_130.json: Vehicle Weight inline second weight + RST auto-fill + backend APIs - ALL PASS
