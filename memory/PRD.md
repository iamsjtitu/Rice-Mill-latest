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

## Current Version: v55.45.0

## What's Implemented
- Full CRUD for Mill Entries, Vehicle Weight, Private Paddy, Cash Book
- Server-Side Pagination
- Auto Vehicle Weight tracking (WhatsApp/Telegram integration)
- Bulk PDF/Excel exports for all modules
- Custom Branding in exports (custom_fields) — ALL 3 BACKENDS
- Default "Today" filters for CashBook, Mill Entries, Vehicle Weight
- "Auto Weight Entries" subtab with 7-day view
- Red notification badge for pending vehicle weights
- Photo zoom capabilities
- Linked RST logic (hide edit/delete, show checkmark)
- Global "Pkts" to "Bags" rename
- GitHub Actions workflow for .exe build
- API Request Debouncing + AbortController (prevents app freeze)
- WhatsApp image sending via tmpfiles.org upload (Desktop/Local backends)
- Optimized camera streaming (reduced ffmpeg resolution/quality/framerate)
- **Paddy Purchase Register** - New subtab with independent filters, PDF/Excel export, WhatsApp/Telegram send
- Subtab styling consistent with main tabs (Button component)
- Clear filters resets to today's date (not empty)

## Recent Completed
- [2026-03-31] New "Paddy Purchase Register" subtab:
  - Independent filters: From/To Date, RST, TP, Truck, Agent, Mandi
  - Data table with all entry columns and TOTAL row
  - PDF/Excel download buttons
  - WhatsApp and Telegram send with PDF
  - Backend export endpoints updated with date_from, date_to, rst_no, tp_no filters
  - New /whatsapp/send-pdf endpoint for sending any PDF via WhatsApp
  - Testing: 13/13 passed (iteration_148)

- [2026-03-31] Subtab font/styling fix:
  - Subtabs now use Button component matching main tab styling
  - Consistent font size across all subtabs

- [2026-03-31] Clear Filters bug fix:
  - clearFilters() now resets dates to todayStr instead of empty strings

- [2026-03-31] RAM fix + WhatsApp image fix + Tab switching hang fix

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
- GET /api/entries (supports all filters + pagination)
- GET /api/totals (supports all filters)
- GET /api/export/excel (supports date_from, date_to, rst_no, tp_no, truck_no, agent, mandi, kms_year, season)
- GET /api/export/pdf (supports same filters)
- POST /api/whatsapp/send-pdf (sends any internal PDF via WhatsApp)
- POST /api/telegram/send-custom (sends any internal PDF via Telegram)
- POST/GET/PUT/DELETE /api/vehicle-weight
- GET/PUT /api/branding
- GET /api/cash-book

## 3rd Party Integrations
- 360Messenger API (WhatsApp) — requires User API Key
- Telegram Bot API — requires User Bot Token
- tmpfiles.org — free image/PDF hosting for WhatsApp media URLs (no API key)

## Test Reports
- iteration_145.json: Custom branding in VW exports (8/8 PASS)
- iteration_146.json: Rapid tab switching fix (5/5 PASS)
- iteration_147.json: RAM fix + WhatsApp image fix (7/7 PASS)
- iteration_148.json: Paddy Purchase Register + subtab styling (13/13 PASS)
