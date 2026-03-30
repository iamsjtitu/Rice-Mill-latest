# Mill Entry System - PRD

## Current Version: v55.21.0

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture.

## What's Been Implemented (Latest)
- **v55.21.0**: Auto messaging on weight completion — WhatsApp + Telegram auto-send with weight details + camera images (Front View + Side View). Settings > Messaging tab has ON/OFF toggle for "Auto Vehicle Weight Messaging". Camera auto-capture via canvas snapshot.
- **v55.20.0**: White theme for Vehicle Weight. 2 cameras (Front/Side) side-by-side.
- **v55.19.2**: Vehicle No AutoSuggest.
- **v55.19.1**: Cash/Diesel save during Second Weight fix.
- **v55.19.0**: Scale auto-connects, RST editable, Delete in pending list.
- **v55.18.0**: Cash/Diesel fields, Weight Slip PDF, RST auto-fill in Entries.

## Key Features
- Triple Backend (Python FastAPI + Electron/Express + Local Express)
- Double-entry accounting, Cash Book, Party Ledgers
- Auto Vehicle Weight: white theme, 2 cameras, auto-connected scale, editable RST, Vehicle No AutoSuggest, auto-messaging to WA/TG
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
- iteration_132.json: Auto VW Messaging + White theme + 2 cameras — ALL PASS (Backend 8/8, Frontend 12/12)
