# Mill Entry System - PRD

## Current Version: v55.39.0

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture (Weight Machine via Serial Port + IP/Web Camera feed).

## Architecture
- **Triple Backend**: Python FastAPI (Web) + Electron Express (Desktop) + Local Express (LAN Server)
- **Frontend**: React with Tailwind CSS + Shadcn/UI
- **Database**: MongoDB (Web) / Local JSON (Desktop & Local)
- **Hardware**: Serial Port (Electron) for Weighbridge, IP Cameras via RTSP/MJPEG proxy

## What's Been Implemented (Latest)
- **v55.39.0**:
  - Dual-photo WhatsApp/Telegram: 1st Weight + 2nd Weight camera photos saved to disk, sent via auto-notify
  - Desktop-app auto-notify reads images from disk (loadImageB64) instead of req.body
  - Local-server: full image infrastructure added (saveImage, loadImageB64, imgDir)
  - Image Auto-Cleanup: configurable days setting in Camera tab, auto-deletes old images every 24h
  - Manual "Abhi Clean Karo" button for immediate cleanup
  - Performance fix: AbortController on API calls prevents hang on rapid tab switching
  - Camera MJPEG stream cleanup on component unmount
  - All three backends have identical image save/load/auto-notify/cleanup logic
- **v55.38.0**: IP Camera auto-start, Download Slip Party Copy only
- **v55.37.0**: RTSP Camera proxy (ffmpeg-static bundled), Delete Dialog fix, WhatsApp format fix
- **v55.36.0**: IP Camera setup, PDF coordinate fix, WhatsApp toggle OFF fix
- **v55.23.0**: Electron Serial Port for real weighbridge hardware
- **v55.22.0**: Edit dialog, A5 Print (2 copies), manual WA/Group

## Key Features
- Triple Backend (Python FastAPI + Electron/Express + Local Express)
- Double-entry accounting, Cash Book, Party Ledgers
- Auto Vehicle Weight: real serial port (Electron) / simulator (web), 2 cameras, auto-messaging
- Dual photo capture: Front + Side cameras on both 1st and 2nd weight
- Image Auto-Cleanup: configurable days setting, periodic + manual cleanup
- Edit, Print A5 (Party+Customer copy), Download (Party only), WA, Group, Delete actions
- RST auto-fill between Vehicle Weight > Mill Entries
- Weighbridge Configuration in Settings (COM port, baud rate, parity, stop bits)
- WhatsApp (360Messenger) & Telegram Bot integration for messaging
- RTSP IP Camera streaming via ffmpeg-static proxy

## Key DB Schema
- `vehicle_weights`: {id, rst_no, date, kms_year, vehicle_no, party_name, farmer_name, product, trans_type, j_pkts, p_pkts, tot_pkts, first_wt, first_wt_time, second_wt, second_wt_time, net_wt, gross_wt, tare_wt, remark, cash_paid, diesel_paid, status, first_wt_front_img, first_wt_side_img, second_wt_front_img, second_wt_side_img, created_at}
- `settings`: {key: "image_cleanup", days: 30} - Image auto-cleanup days
- `cash_transactions`: {id, date, account, txn_type, category, party_type, amount, linked_payment_id}
- `private_paddy`: {id, date, party_name, mandi_name, total_amount, paid_amount, balance}

## Key API Endpoints
- `/api/vehicle-weight` (GET/POST) - List/Create
- `/api/vehicle-weight/pending` (GET)
- `/api/vehicle-weight/next-rst` (GET)
- `/api/vehicle-weight/auto-notify-setting` (GET/PUT)
- `/api/vehicle-weight/auto-notify` (POST) - Sends saved photos from disk
- `/api/vehicle-weight/by-rst/:rst_no` (GET)
- `/api/vehicle-weight/send-manual` (POST)
- `/api/vehicle-weight/:id/second-weight` (PUT) - Saves 2nd weight photos
- `/api/vehicle-weight/:id/edit` (PUT)
- `/api/vehicle-weight/:id/slip-pdf` (GET)
- `/api/vehicle-weight/:id` (DELETE)
- `/api/camera-stream` (GET) - RTSP to MJPEG proxy
- `/api/settings/image-cleanup` (GET/PUT) - Image cleanup days setting
- `/api/settings/image-cleanup/run` (POST) - Manual cleanup trigger

## Prioritized Backlog
### P1 - Upcoming
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2 - Future
- JS backends code deduplication (shared module for desktop-app + local-server)
- Centralize payment/stock logic across triple backends
- Refactor App.js (~2500 lines)
