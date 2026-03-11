# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive management tool for a rice mill named "Mill Entry System". Full-stack app with React frontend, Python/FastAPI backend (web preview), and two Node.js backends (desktop-app via Electron, local-server for standalone). User communicates exclusively in Hindi.

## Core Architecture
```
/app
├── backend/          # Python/FastAPI - Primary web backend (MongoDB)
├── desktop-app/      # Node.js/Electron - Desktop app (JSON file storage)
├── local-server/     # Node.js/Express - Local standalone server (JSON file storage)
└── frontend/         # React - Shared UI (builds copied to desktop-app)
```

## Priority Requirements
- **P0:** Full data & feature parity across all 3 backends
- **P0:** Correct ledger balancing (Tally-style accounting)
- **P1:** UI/UX consistency & refinements
- **P2:** Stability & performance

## Implemented Features

### Core Modules
- Mill Entry CRUD with auto-calculated fields (qntl, cutting, final_w, etc.)
- Cash Book (Cash Transactions, Party Ledger, Party Summary)
- DC & Payment Tracker (Truck Payments, Agent Payments, Gunny Bags)
- Agent & Mandi Wise Report with QNTL tracking
- Diesel Account Management
- Mandi Target Management (database-driven, CRUD via Dashboard)
- Private Purchase (Pvt Trading) module
- Excel Import for mill entries
- Telegram integration for notifications

### Accounting Automation (on Mill Entry Create/Update/Delete)
- Auto Jama (Ledger) entry for truck purchase
- Auto Nikasi entry for diesel deduction
- Auto Cash Book Nikasi for cash paid
- Auto Diesel Account entry
- **Auto Gunny Bag entries for g_issued (OUT) and g_deposite (IN)**

### Recent Fixes (Mar 2026)
- PDF/Excel export formatting: Removed text truncation, increased description column widths, added Paragraph wrapping in PDFs
- Auto Gunny Bag entries from mill entries (g_issued → OUT, g_deposite → IN with source=Agent-Mandi, ref=Truck No)
- All changes synced to desktop-app and local-server Node.js backends
- Frontend build copied to desktop-app

## Key API Endpoints
- `POST/PUT/DELETE /api/entries` - Mill entry CRUD (auto cash/diesel/gunny entries)
- `GET /api/cash-book/pdf|excel` - Cash Book exports
- `GET /api/reports/party-ledger/pdf|excel` - Party Ledger exports
- `GET /api/cash-book/party-summary/pdf|excel` - Party Summary exports
- `GET /api/gunny-bags` - Gunny bag entries (manual + auto)
- `GET /api/reports/agent-mandi-wise` - Agent/Mandi report
- `GET/POST/PUT/DELETE /api/mandi-targets` - Mandi target CRUD

## Credentials
- Admin: `admin` / `admin123`

## Backlog
- P2: Refactor multi-backend sync process (currently manual porting)
