# Mill Entry System - PRD

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend (Web)**: FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Node.js/Express + JSON file DB

## Latest (v25.1.54)

### Daily Report Export - Store Room Column
- Daily Report PDF export: Mill Parts section includes Store Room column for both "Parts Purchased" and "Parts Used" tables
- Daily Report Excel export: Same Store Room column added
- Desktop app: Store Room added to data layer, PDF, and Excel exports
- Version bumped to v25.1.54 with changelog entry

### Previous (v25.1.53)
- Store Room in Stock forms (In/Used), Stock Summary, Part-wise Summary
- ALL Mill Parts Excel/PDF exports updated with Store Room

### Previous (v25.1.49-52)
- Round Off in ALL payment sections (separate Cash Book entry)
- Store Room CRUD + Room-wise Report + Excel/PDF export
- What's New auto-popup + Footer (9x.design, contact)

## Backlog
- P1: Refactor PDF/Excel generation logic (duplication across files)
- P1: Centralize stock calculation logic
- P2: Sardar-wise monthly breakdown report
- P2: Centralize payment logic into service layer
