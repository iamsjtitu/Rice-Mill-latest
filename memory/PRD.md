# Mill Entry System - PRD

## Original Problem Statement
Comprehensive rice mill management tool (NAVKAR AGRO). React frontend + Python/FastAPI backend + Node.js backends (local-server, desktop-app/Electron).

## Architecture
- Frontend: React (port 3000)
- Primary Backend: Python/FastAPI (port 8001)
- Local Server: Node.js/Express (port 8080)
- Desktop App: Electron + Node.js/Express

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Implemented Features

### Core
- Full CRUD for mill entries, payments, cash book, ledgers, DC tracking, milling, private trading, staff, mill parts
- Route parity across all 3 backends (Python, desktop-app, local-server)
- PDF/Excel exports for all modules
- Financial year and season filters

### Cash Paid Auto Cash Book (2026-02)
- Entry with cash_paid > 0 auto-creates Cash Book Nikasi transaction
- Description: "Cash Paid: Truck X - Agent Y - Rs.Z"
- Entry update/delete propagates to linked cash book entry

### Diesel Account System (2026-02)
- New "Diesel Account" sub-tab in Payments page
- Pump Management: Add/delete pumps, set default pump
- Entry with diesel_paid > 0 auto-creates diesel account debit for default pump
- Pump-wise summary cards with balance (total diesel - total paid)
- Partial/full payment settlement with auto Cash Book Nikasi entry
- Delete entry cleans up linked diesel + cash entries
- Collections: diesel_pumps, diesel_accounts

### G.Issued Deduction (2026-02)
- G.Issued summed from entries, deducted from Total (Excl Govt) in gunny bags summary
- Visible "-G.Issued" in Total card

### Entry Form Field Reorder (2026-02)
- P.Pkt and P.Pkt Cut now appear BEFORE Mill W. QNTL

### Gunny Bag Edit (2026-02)
- PUT /api/gunny-bags/:id for editing entries
- Edit button in table with pre-filled dialog

### Error Log in Settings (2026-02)
- Error Log section in Settings page for desktop crash diagnostics

### Desktop App Stability Fix (2026-02)
- Global crash protection (uncaughtException, unhandledRejection)
- 170+ route handlers wrapped with safeAsync/safeSync
- Atomic DB save, database recovery, server watchdog

## Prioritized Backlog
- Long-term: Refactor desktop-app main.js into modular route files
