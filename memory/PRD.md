# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive management tool for a rice mill named "Mill Entry System". Full-stack app with React frontend, Python/FastAPI backend (web preview), and two Node.js backends (desktop-app via Electron, local-server for standalone). User communicates in Hindi.

## Core Architecture
```
/app
├── backend/          # Python/FastAPI - Primary web backend (MongoDB)
├── desktop-app/      # Node.js/Electron - Desktop app (JSON file storage)
├── local-server/     # Node.js/Express - Local standalone server (JSON file storage)
└── frontend/         # React - Shared UI (builds copied to desktop-app)
```

## Implemented Features

### Core Modules
- Mill Entry CRUD with auto-calculated fields
- Cash Book (Cash Transactions, Party Ledger, Party Summary)
- Payments (Truck, Truck Owner Consolidated, Agent, Diesel Account, Local Party, **Gunny Bags**)
- DC & Payments (DC/Delivery Challan, MSP Payments)
- Agent & Mandi Wise Report with QNTL tracking
- Mandi Target Management (database-driven CRUD)
- Private Purchase (Pvt Trading) module
- Excel Import, Telegram integration

### Accounting Automation (on Mill Entry Create/Update/Delete)
- Auto Jama (Ledger) entry for truck purchase
- Auto Nikasi for diesel deduction / cash paid
- Auto Diesel Account entry
- **Auto Gunny Bag entries: BAG field → IN (bags received), g_issued → OUT (bags issued)**
- g_deposite has no relation to gunny bag module

### Gunny Bag Summary Logic
- **Bag Received (Mill)**: Auto entries from mill entries (BAG=IN, g_issued=OUT)
- **Old Bags (Market)**: Only manual market purchases (no auto entries mixed in)
- **Total (Excl Govt)**: Old Market IN - Old Market OUT
- **Govt Bags (Free)**: Separate tracking, not in total

### Recent Changes (Mar 2026)
- PDF/Excel export formatting fixed (removed truncation, Paragraph wrapping)
- Auto Gunny Bag entries (BAG→IN, g_issued→OUT, bag_type=old)
- "Auto" badge in Gunny Bags tab
- Gunny Bags tab moved from DC & Payments → Payments subtab
- All changes synced to desktop-app and local-server Node.js backends
- Frontend build copied to desktop-app

## Key API Endpoints
- `POST/PUT/DELETE /api/entries` - Mill entry CRUD (auto cash/diesel/gunny)
- `GET /api/cash-book/pdf|excel`, `GET /api/reports/party-ledger/pdf|excel`
- `GET /api/cash-book/party-summary/pdf|excel`
- `GET /api/gunny-bags`, `GET /api/gunny-bags/summary`
- `GET /api/reports/agent-mandi-wise`
- `GET/POST/PUT/DELETE /api/mandi-targets`

## Credentials
- Admin: `admin` / `admin123`

## Backlog
- None currently pending
