# Mill Entry System - PRD

## Current Version: v55.40.0

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture (Weight Machine via Serial Port + IP/Web Camera feed).

## Architecture
- **Triple Backend**: Python FastAPI (Web) + Electron Express (Desktop) + Local Express (LAN Server)
- **Frontend**: React with Tailwind CSS + Shadcn/UI
- **Database**: MongoDB (Web) / Local JSON (Desktop & Local)
- **Hardware**: Serial Port (Electron) for Weighbridge, IP Cameras via RTSP/MJPEG proxy

## What's Been Implemented (Latest)
- **v55.40.0**:
  - Photo View Dialog: Eye icon in completed entries → shows 1st Weight (Front/Side) + 2nd Weight (Front/Side) photos
  - Separate VW Messaging Group: WhatsApp Group ID + Telegram Chat IDs config specifically for Auto Vehicle Weight
  - WhatsApp photos: media_url support in auto-notify (web backend sends photo URLs)
  - Image serving endpoint: GET /api/vehicle-weight/image/{filename}
  - Photos endpoint: GET /api/vehicle-weight/{entry_id}/photos (base64)
  - Fixed sendWaToGroup to use correct /v2/sendGroup API endpoint
  - All three backends fully synced
- **v55.39.0**: Dual-photo auto-notify, Image auto-cleanup, Performance fix (AbortController)
- **v55.38.0**: IP Camera auto-start, Download Slip Party Copy only
- **v55.37.0**: RTSP Camera proxy (ffmpeg-static), Delete Dialog fix
- **v55.36.0**: IP Camera setup, PDF coordinate fix

## Key DB Schema
- `vehicle_weights`: {id, rst_no, date, kms_year, vehicle_no, party_name, farmer_name, product, trans_type, first_wt, second_wt, net_wt, gross_wt, tare_wt, first_wt_front_img, first_wt_side_img, second_wt_front_img, second_wt_side_img, ...}
- `settings.auto_vw_messaging`: {key, enabled, wa_group_id, wa_group_name, tg_chat_ids}
- `settings.image_cleanup`: {key, days}

## Key API Endpoints
- `/api/vehicle-weight` (GET/POST/DELETE)
- `/api/vehicle-weight/{id}/second-weight` (PUT)
- `/api/vehicle-weight/{entry_id}/photos` (GET) - Base64 photos
- `/api/vehicle-weight/image/{filename}` (GET) - Raw image file
- `/api/vehicle-weight/auto-notify-setting` (GET/PUT) - Includes wa_group_id, tg_chat_ids
- `/api/vehicle-weight/auto-notify` (POST) - Uses VW-specific groups
- `/api/settings/image-cleanup` (GET/PUT/POST run)

## Prioritized Backlog
### P1 - Upcoming
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2 - Future
- JS backends code deduplication (shared module for desktop-app + local-server)
- Centralize payment/stock logic across triple backends
- Refactor App.js (~2500 lines)
