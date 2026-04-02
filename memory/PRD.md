# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Core Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (network-accessible)
- **Frontend**: React (shared across all backends)
- **Triple Backend Rule**: Any logic change MUST be replicated in all 3 backends

## Current Version: v76.0.0

## What's Been Implemented

### Core Features (Complete)
- Mill Entry CRUD with auto-calculations
- Dashboard with targets & analytics
- Milling (CMR) Tracker, DC Tracker, Cash Book, Vouchers, Payments
- Private Paddy Purchase, Reports, Staff, Mill Parts, Hemali, FY Summary
- Vehicle Weight (Weighbridge + IP Camera), Auto Weight Entries
- Excel Import/Export, WhatsApp/Telegram messaging
- Session heartbeat, Keyboard shortcuts, Theme toggle, Backup/Restore

### v76.0.0 - Camera Quality + Performance (Feb 2026)
- USB Camera: 640x480 → 1920x1080 (ideal), frameRate limited to 15-30fps
- Snapshot: toDataURL (sync/freeze) → toBlob (async/smooth)
- JPEG quality: 70% → 85% (quality + size balance)
- Canvas memory: auto-cleanup after capture (1x1 reset)
- MJPEG img tags: decoding="async" for off-thread decode
- RTSP stream: q:v 5 → q:v 3 (better quality, controlled data)

### v75.0.0 - App.js Refactoring (Feb 2026)
- App.js: 2504 → 1429 lines (43% reduction)
- Extracted: MillEntryForm, EntryTable, TabNavigation, FilterPanel, HeaderDialogs
- Utilities: print.js, constants.js, date.js

## Prioritized Backlog

### P1 (High)
- "Export Preview" feature (preview data before Excel/PDF export)

### P2 (Medium)
- Centralize payment/stock logic across triple-backend

### P3 (Low/Future)
- SQLite migration for desktop app (1 Lakh+ entries)

## Test Reports
- `/app/test_reports/iteration_157.json` - Refactoring Phase 1
- `/app/test_reports/iteration_158.json` - Refactoring Phase 2

## Credentials
- Username: admin
- Password: admin123
