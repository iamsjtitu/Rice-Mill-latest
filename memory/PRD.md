# Mill Entry System PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture.

## Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop App**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Frontend**: React (shared across all 3 backends)

### Triple Backend Parity
Any logic change in Python MUST be replicated in both JS backends (desktop-app + local-server).

## Current Version: v55.42.0

## What's Implemented
- Full CRUD for Mill Entries, Vehicle Weight, Private Paddy, Cash Book
- Server-Side Pagination
- Auto Vehicle Weight tracking (WhatsApp/Telegram integration)
- Bulk PDF/Excel exports for all modules
- Custom Branding in exports (custom_fields above/below company name) — **ALL 3 BACKENDS**
- Default "Today" filters for CashBook, Mill Entries, Vehicle Weight
- "Auto Weight Entries" subtab with 7-day view
- Red notification badge for pending vehicle weights
- Photo zoom capabilities
- Linked RST logic (hide edit/delete, show checkmark)
- Global "Pkts" → "Bags" rename
- GitHub Actions workflow for .exe build

## Recent Completed (This Session)
- [2026-03-30] Fixed custom branding fields (custom_fields) missing from Vehicle Weight exports:
  - Python slip-pdf: Updated to use branding_helper.py with FreeSans font for Hindi text
  - Python export/pdf and export/excel: Already fixed by previous agent
  - Desktop-app JS: Updated slip-pdf, export/excel, export/pdf with custom_fields + FreeSans support
  - Local-server JS: Same updates as desktop-app
  - Testing: 8/8 backend tests passed (iteration_145)

## Backlog (Prioritized)
### P1
- Export Preview feature (preview data before exporting to Excel/PDF)

### P2
- JS backends code deduplication
- Refactor App.js (~2500 lines)
- Centralize payment/stock logic across triple-backend system

### P3
- SQLite migration for desktop app (100k+ entries performance)

## Key API Endpoints
- POST/GET/PUT/DELETE /api/vehicle-weight
- GET /api/vehicle-weight/{id}/slip-pdf
- GET /api/vehicle-weight/export/pdf
- GET /api/vehicle-weight/export/excel
- GET /api/vehicle-weight/pending-count
- GET/PUT /api/branding

## DB Schema (Key)
- `branding`: {company_name, tagline, custom_fields: [{label, value, placement: "above"/"below", position}]}
- `vehicle_weights`: {id, date, rst_no, vehicle_no, party_name, farmer_name, mandi_name, product, bags/tot_pkts, first_wt, second_wt, net_wt, cash_given, diesel}

## 3rd Party Integrations
- 360Messenger API (WhatsApp) — requires User API Key
- Telegram Bot API — requires User Bot Token

## Test Reports
- iteration_145.json: Custom branding in VW exports (8/8 PASS)
