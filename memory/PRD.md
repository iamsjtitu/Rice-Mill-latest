# Mill Entry System - PRD

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend (Web)**: FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Node.js/Express + JSON file DB

## Latest (v28.0.0)

### Bug Fix: Round Off Not Counted in Cash Balance
- Round Off entries excluded from Cash in Hand / Bank balance summary
- Applied to all three backends (web, desktop, local-server)

### Fix: Round Off visible in Party Ledgers
- Added "All" option to Account filter in Party Ledgers
- Auto-switches Account to "All" when "Round Off" party type is selected
- Default filter changed from "Ledger" to "All"

### UI: Auto Update redesigned
- Modern glassmorphism with gradient accents and shimmer animations
- Better version comparison layout
- Pulse ring notification indicator

### Bug Fix: UI Freeze After Delete (Radix pointer-events)
- Global patch on window.confirm restores pointer-events

### Previous (v27.0.0)
- Diesel Account Sync from CashBook
- Critical Round Off Balance fix in ALL payment types
- Round Off in ALL 9 payment sections
- Store Room CRUD + exports
- Telegram Share + confirmation dialog

## Round Off Design
- **Amount field**: Actual cash paid (affects Cash in Hand)
- **Round Off field**: Discount/adjustment (does NOT affect Cash in Hand)
- **Ledger entry**: amount + round_off (party's full balance settled)

## Backlog
- P0: New desktop build required for all recent fixes
- P1: Refactor PDF/Excel generation logic (duplication)
- P1: Centralize stock calculation logic
- P2: Sardar-wise monthly breakdown report
- P2: Centralize payment logic into service layer
