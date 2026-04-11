# Rice Mill Management System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Triple backend architecture with MongoDB (web) and SQLite/JSON (desktop/local). Requires double-entry accounting, advanced reporting, offline-first desktop, and cross-device sync.

## Current Version: v88.95.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + SQLite
- **Backend (Local)**: Express + SQLite

## What's Been Implemented

### Core Features
- Mill Entry CRUD with full weight/cut/payment tracking
- Cash Book (Jama/Nikasi) with double-entry accounting
- Private Paddy Purchase with party ledgers
- Sale & Purchase Vouchers
- DC Tracker (Delivery Challans)
- Milling Tracker (CMR)
- Staff Management with salary/advance
- Hemali Payment system
- Rice Sales tracking
- Truck Lease management
- Diesel Accounts
- Mill Parts Stock

### Reports
- CMR vs DC comparison
- Season P&L
- Daily Report
- Agent & Mandi reports
- Weight Discrepancy report
- **Mandi Wise Custody Register** (NEW - date-wise paddy procurement from different mandis)

### Features
- Quick Search with entry detail dialog
- PDF/Excel export with global tiled watermark
- FY Summary Dashboard
- Balance Sheet
- Branding/Settings customization
- Auto-update for desktop
- WhatsApp/Telegram messaging
- Camera integration
- GST Ledger / Audit Log
- Multi-user with role-based access

### Recent Changes (Apr 2026)
- **v88.95.0**: Fixed browser CORS issue - MandiCustodyRegister & MillEntryForm were using build-time API URL instead of runtime Electron-aware pattern
- **v88.94.0**: Fixed Mandi Custody Register Desktop - was querying wrong collection `milling_entries` instead of `entries`
- **v88.93.0**: Triple Backend Parity System - `check-parity.py` (route comparison) + `sync-js-routes.sh` (Desktop→Local sync)
- **v88.92.0**: Negative weight validation - 2nd Weight > 1st Weight hone par entry reject (Triple backend + Frontend)
- **v88.91.0**: Added Paddy Chalna Excel+PDF export routes to Desktop/Local JS backends (were missing - Triple parity fix)
- **v88.90.0**: Fixed Desktop/Local Server Mandi Custody Register - was querying `mill_entries` instead of `milling_entries` (Triple parity fix)
- Quick Search: Click opens specific entry detail dialog
- WeightDiscrepancy: Fixed missing `Input` import and `mandiList.map` error
- PDF Watermark: Tiled repeating pattern across full page + global coverage in all JS backends
- Settings.jsx refactored: 3091 → 70 lines + 11 tab files
- **Mandi Wise Custody Register**: Date-wise mandi procurement with dynamic columns, TOTAL, PROG.TOTAL, PDF/Excel export. Triple backend parity.

## Prioritized Backlog

### P1 (High)
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2 (Medium)
- Python backend service layer refactoring
- Triple backend code deduplication

### P3 (Low)
- Payment logic centralized service layer

## Key Technical Notes
- Triple Backend: Any change to Python MUST be replicated in desktop-app and local-server JS routes
- Desktop paths: Use `os.homedir()` not `Program Files` for dynamic files
- Auth: Session-cookie based, no JWT
- Watermark: Python uses reportlab monkey-patch, JS uses drawWatermark in addPdfHeader + createPdfDoc helper

## Deployment Notes
- **Desktop App (.exe)**: GitHub Actions auto-builds on push to main. User creates release on GitHub.
- **Web Server (mill.9x.design)**: User deploys Python FastAPI backend manually. After "Save to GitHub", user pulls latest code on server and restarts.
- **IMPORTANT**: After every code change, user must deploy to BOTH desktop (new .exe build) AND web server (git pull + restart) for full coverage.
1. **Version Bump + WhatsNew**: Har fix/feature ke baad version bump (3 package.json) + WhatsNew.jsx update MANDATORY
2. **Parity Check**: Har fix/feature ke baad `python3 /app/scripts/check-parity.py` run karna MANDATORY. Agar issues aaye toh fix karo pehle
3. **Route Sync**: JS routes change karne ke baad `bash /app/scripts/sync-js-routes.sh` run karna MANDATORY
4. **Collection Name Mapping**: MongoDB `mill_entries` = JS `entries` (NOT `milling_entries`). `milling_entries` = milling process data
5. **Hindi/Hinglish**: User se SIRF Hindi/Hinglish mein baat karo
