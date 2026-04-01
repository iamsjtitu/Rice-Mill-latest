# Mill Entry System PRD

## Current Version: v71.0.0

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

## Recent Completed (Apr 2026)
- [v71] RST auto-increment bug fix - frontend was accessing wrong response key (`next_rst` → `rst_no`), added parseInt in JS backends, robust max calculation in Python backend
- [v71] Photo ESC handler added - zoomImg overlay now closes on ESC key press
- [v71] What's New dialog limited to last 5 changelog entries, fixed duplicate version in titles
- [v70.2] G.Issued now shows in View modal, WhatsApp/Telegram text, and Mill Entry RST auto-fill
- [v70.1] Receive(Pur)→Receive(Purchase), Source→Source/Mandi, Trans in WhatsApp
- [v70] G.Issued field added, Farmer→Source rename, PDF bordered table
- [v69.2] Badge count type mismatch fix
- [v69] Camera captureFrame await fix, WhatsApp image fix, FY Carry Forward

## Backlog
- P1: Export Preview feature
- P2: Centralize payment/stock logic across triple backends
- P2: App.js refactor (~2500 lines)
- P3: SQLite migration for desktop
