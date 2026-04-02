# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Core Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (network-accessible)
- **Frontend**: React (shared across all backends)
- **Triple Backend Rule**: Any logic change MUST be replicated in all 3 backends

## Current Version: v74.0.0

## What's Been Implemented

### Core Features (Complete)
- Mill Entry CRUD with auto-calculations (KG→QNTL, GBW cut, P.Pkt cut, Cutting, Moisture cut, Final W)
- Dashboard with targets & analytics
- Milling (CMR) Tracker
- DC Tracker with payments
- Cash Book with double-entry accounting & party ledgers
- Vouchers system
- Payment management with round-off
- Private Paddy Purchase (PaddyPurchase.jsx)
- Paddy Purchase Register
- Reports with Excel/PDF export
- Staff Management
- Mill Parts Stock tracking
- Hemali Payment module
- FY Summary with Balance Sheet
- Vehicle Weight (Weighbridge + IP Camera integration)
- Auto Weight Entries
- Excel Import
- WhatsApp/Telegram messaging integration
- Session heartbeat indicator (Google Drive sync protection)
- Keyboard shortcuts (Ctrl+N, Ctrl+S, Ctrl+F, etc.)
- Theme toggle (dark/light)
- Branding customization
- Backup/Restore system
- Auto-updater for desktop app

### Recent Changes (Feb 2026)
- Extracted `MillEntryForm.jsx` and `EntryTable.jsx` from App.js (refactoring)
- App.js reduced from 2504 to 1909 lines
- Previously extracted: `print.js`, `constants.js`, `date.js` utilities
- RST auto-increment fix
- Photo ESC button fix
- Dialog accessibility warnings fixed
- Remark field added to Auto Weight Entries
- Active Session Heartbeat indicator
- 100% route parity between desktop-app and local-server
- Global date formatting (DD-MM-YYYY) centralized

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High)
- "Export Preview" feature (preview data before Excel/PDF export)

### P2 (Medium)
- Centralize payment/stock logic across triple-backend system
- Further App.js refactoring (extract more sections if needed)

### P3 (Low/Future)
- SQLite migration for desktop app (when data exceeds 1 Lakh+ entries)

## Key Technical Notes
- User communicates in Hindi/Hinglish
- User is sensitive to UI layout changes - ensure visual parity during refactoring
- GitHub Actions workflow (.github/workflows/build-desktop.yml) handles .exe builds
- All 3 backends must stay in sync for any logic changes

## Test Reports
- `/app/test_reports/iteration_156.json` - Previous session tests
- `/app/test_reports/iteration_157.json` - Refactoring verification (100% pass)

## Credentials
- Username: admin
- Password: admin123
