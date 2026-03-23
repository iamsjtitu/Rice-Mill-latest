# Mill Entry System - PRD

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend (Web)**: FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Node.js/Express + JSON file DB

## Latest (v25.1.56)

### Bug Fixes
- Stock In transaction mein Store Room select karne par Part master ki store_room bhi update hoti hai
- Transactions table mein "Store Room" column add kiya gaya
- Telegram confirmation dialog: date, mode, KMS year, recipients dikhata hai
- Cash Transactions: Round Off entries hidden by default, toggle se show/hide
- Daily Report: "Share via Telegram" button in Detail mode

### Previous (v25.1.54)
- Daily Report PDF/Excel export: Store Room column for Mill Parts

### Previous (v25.1.49-53)
- Round Off in ALL payment sections (separate Cash Book entry)
- Store Room CRUD + Room-wise Report + Excel/PDF export
- Store Room in Stock forms, Summary, Part-wise Summary
- What's New auto-popup + Footer (9x.design, contact)

## Backlog
- P1: Refactor PDF/Excel generation logic (duplication across files)
- P1: Centralize stock calculation logic
- P2: Sardar-wise monthly breakdown report
- P2: Centralize payment logic into service layer
