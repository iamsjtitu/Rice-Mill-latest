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

## Current Version: v55.44.0

## What's Implemented
- Full CRUD for Mill Entries, Vehicle Weight, Private Paddy, Cash Book
- Server-Side Pagination
- Auto Vehicle Weight tracking (WhatsApp/Telegram integration)
- Bulk PDF/Excel exports for all modules
- Custom Branding in exports (custom_fields above/below company name) — ALL 3 BACKENDS
- Default "Today" filters for CashBook, Mill Entries, Vehicle Weight
- "Auto Weight Entries" subtab with 7-day view
- Red notification badge for pending vehicle weights
- Photo zoom capabilities
- Linked RST logic (hide edit/delete, show checkmark)
- Global "Pkts" to "Bags" rename
- GitHub Actions workflow for .exe build
- API Request Debouncing + AbortController (prevents app freeze on rapid tab switching)
- WhatsApp image sending via tmpfiles.org upload (Desktop/Local backends)
- Optimized camera streaming (reduced ffmpeg resolution/quality/framerate)

## Recent Completed
- [2026-03-31] Fixed high RAM usage from camera streaming (ffmpeg):
  - Reduced ffmpeg resolution to 640px width (scale=640:-1)
  - Reduced framerate from 10fps to 3fps
  - Reduced quality from q:v=5 to q:v=12
  - Applied to both desktop-app and local-server camera_proxy.js
  - Expected RAM reduction: ~60-70% per ffmpeg process

- [2026-03-31] Fixed WhatsApp images not sending in auto-notify:
  - Added uploadImageForWa() helper that uploads images to tmpfiles.org
  - WhatsApp auto-notify now sends text + images (via public URL)
  - Updated sendWaMessage() to support mediaUrl parameter
  - Applied to both desktop-app and local-server vehicle_weight.js
  - Python backend already had correct image sending (uses public server URL)

- [2026-03-31] Fixed app freeze/hang on rapid tab switching:
  - Added AbortController + 300ms debounce to App.js and CashBook.jsx
  - Testing: 7/7 tests passed (iteration_147)

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
- POST /api/vehicle-weight/auto-notify
- GET/PUT /api/branding
- GET /api/entries
- GET /api/totals
- GET /api/cash-book

## DB Schema (Key)
- `branding`: {company_name, tagline, custom_fields}
- `vehicle_weights`: {id, date, rst_no, vehicle_no, party_name, farmer_name, first_wt, second_wt, net_wt, first_wt_front_img, first_wt_side_img, second_wt_front_img, second_wt_side_img}

## 3rd Party Integrations
- 360Messenger API (WhatsApp) — requires User API Key
- Telegram Bot API — requires User Bot Token
- tmpfiles.org — free image hosting for WhatsApp media URLs (no API key)

## Test Reports
- iteration_145.json: Custom branding in VW exports (8/8 PASS)
- iteration_146.json: Rapid tab switching fix (5/5 PASS)
- iteration_147.json: RAM fix + WhatsApp image fix (7/7 PASS)
