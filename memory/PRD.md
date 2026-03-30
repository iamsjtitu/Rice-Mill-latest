# Mill Entry System - PRD

## Current Version: v55.19.0

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture.

## What's Been Implemented (Latest)
- **v55.19.0**: Scale auto-connects (no Simulate button needed), STABLE badge auto-shows when weight ready. RST number auto-fills AND is editable. Delete option added for pending RST entries. Old Second Weight Dialog removed, inline mode only.
- **v55.18.0**: Cash Paid + Diesel Paid fields in Vehicle Weight. Weight Slip PDF redesigned. RST auto-fill in Mill Entries (Vehicle, Party, Mandi, Net Wt, Cash, Diesel). Inline Second Weight Capture.
- **v55.16.0-v55.17.0**: AutoSuggest for Party/Mandi, RST Net Weight auto-fill
- **v55.13.0-v55.15.0**: 3-column Keshav Computer-style layout, GOVT PADDY default + target auto-fill
- **v55.9.0-v55.12.0**: Vehicle Weight feature, sub-tab under Entries, exports fix

## Key Features
- Triple Backend System (Python FastAPI + Electron/Express + Local Express)
- Double-entry accounting with Cash Book, Party Ledgers
- Mill Entries with auto-calculations (QNTL, GBW, Cutting, Moisture)
- Auto Vehicle Weight with 3-column UI, auto-connected live scale, camera feed
- RST-based auto-fill between Vehicle Weight and Mill Entries
- Weight Slip PDF generation
- WhatsApp/Telegram messaging integration
- Excel/PDF export across all backends
- Mandi Targets management, Staff management

## Prioritized Backlog
### P2 - Future
- Export Preview feature
- Code deduplication across Desktop and Local server JS backends
- Centralize payment and stock calculation logic
- Electron Serial Port for real weighbridge hardware
- Refactor App.js (~2500 lines) into smaller modules

## Testing Status
- iteration_130.json: Vehicle Weight inline second weight + RST auto-fill - ALL PASS
- iteration_131.json: Scale auto-connect + RST editable + Pending delete - ALL PASS (14/14 frontend, 9/9 backend)
