# Mill Entry System - PRD

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend (Web)**: FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Node.js/Express + JSON file DB

## Latest (v25.1.58)

### Local Party Round Off + Store Room Fixes
- Local Party Settlement dialog mein Round Off option add kiya (RoundOffInput component reuse)
- Backend (web + desktop) round_off handle karta hai - separate Cash Book entry banti hai
- Store Room bug fix: Stock In par Part master ki store_room auto-update
- Transactions table mein Store Room column add kiya

### Previous (v25.1.56)
- Telegram confirmation dialog with date, mode, recipients
- Cash Transactions: Round Off toggle (show/hide)
- Daily Report: Telegram Share button in Detail mode

### Previous (v25.1.54)
- Daily Report PDF/Excel export: Store Room column for Mill Parts

### Previous (v25.1.49-53)
- Round Off in ALL 9 payment sections (separate Cash Book entry)
- Store Room CRUD + Room-wise Report + Excel/PDF export
- Store Room in Stock forms, Summary, Part-wise Summary
- What's New auto-popup + Footer (9x.design, contact)

## Backlog
- P1: Refactor PDF/Excel generation logic (duplication across files)
- P1: Centralize stock calculation logic
- P2: Sardar-wise monthly breakdown report
- P2: Centralize payment logic into service layer
