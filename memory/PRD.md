# Mill Entry System - PRD

## Current Version: v55.40.0

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture (Weight Machine via Serial Port + IP/Web Camera feed).

## Architecture
- **Triple Backend**: Python FastAPI (Web) + Electron Express (Desktop) + Local Express (LAN Server)
- **Frontend**: React with Tailwind CSS + Shadcn/UI
- **Database**: MongoDB (Web) / Local JSON (Desktop & Local)
- **Hardware**: Serial Port (Electron) for Weighbridge, IP Cameras via RTSP/MJPEG proxy

## What's Been Implemented (v55.40.0)
- Photo View Dialog: Eye icon → all entry details (RST, Date, Vehicle, Party, Mandi, Product, Pkts, Trans, 1st/2nd Wt, Net Wt, Cash, Diesel) + 1st/2nd Weight photos (Front/Side)
- Mandi column added to completed entries table
- Separate VW WhatsApp Group + Telegram Chat IDs config in Settings > Messaging
- WhatsApp photo sending via media_url (image serving endpoint)
- MongoDB indexes for scale (50k+ entries): vehicle_weights, cash_transactions, mill_entries, private_paddy
- Desktop JSON compact save (no pretty-print = 40% smaller file, faster writes)
- Auto-notify uses VW-specific group first, falls back to defaults
- sendWaToGroup fixed to use correct /v2/sendGroup API
- Image auto-cleanup with configurable days + manual trigger
- Dual-photo (1st+2nd weight) auto-notify across all 3 backends
- Performance fix: AbortController + camera MJPEG cleanup on unmount

## Key API Endpoints
- `/api/vehicle-weight` (GET/POST/DELETE)
- `/api/vehicle-weight/{id}/second-weight` (PUT)
- `/api/vehicle-weight/{entry_id}/photos` (GET) - All details + base64 photos
- `/api/vehicle-weight/image/{filename}` (GET) - Raw JPEG for media_url
- `/api/vehicle-weight/auto-notify-setting` (GET/PUT) - wa_group_id, tg_chat_ids
- `/api/vehicle-weight/auto-notify` (POST) - VW group + photos
- `/api/settings/image-cleanup` (GET/PUT/POST run)

## Prioritized Backlog
### P1 - Upcoming
- Export Preview feature
- Cashbook query pagination (to_list limits for 50k+ scale)
- Frontend table pagination (server-side paging)

### P2 - Future
- JS backends code deduplication (shared module)
- Centralize payment/stock logic
- Refactor App.js (~2500 lines)
