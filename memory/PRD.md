# Rice Mill Management System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Triple backend architecture with MongoDB (web) and SQLite/JSON (desktop/local). Requires double-entry accounting, advanced reporting, offline-first desktop, and cross-device sync.

## Current Version: v89.1.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + SQLite/JSON
- **Backend (Local)**: Express + SQLite/JSON

## What's Been Implemented

### Core Features
- Mill Entry CRUD with full weight/cut/payment tracking
- Cash Book (Jama/Nikasi) with double-entry accounting
- Private Paddy Purchase with party ledgers
- Sale & Purchase Vouchers (with Bill No, Destination, Bill Book, Oil %)
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
- Mandi Wise Custody Register (QNTL, professional Excel)
- Paddy Custody Register (Final W)

### Government Registers (NEW v89.1.0)
- **Form A** - Paddy Stock Register (OSCSC paddy, linked from Mill Entries, daily running balance)
- **Form B** - CMR Register (Custom Milled Rice produced & delivered, linked from Milling + Sale Book)
- **Form E** - Miller's Own Paddy (Private paddy purchases, linked from Private Trading)
- **Form F** - Miller's Own Rice Sale (linked from Sale Book)
- **FRK Blending Register** - Fortified Rice Kernel batch tracking (CRUD with opening/closing balance)
- **Gunny Bag Stock Register** - Bag type wise stock management (New/Old/Plastic, CRUD)
- All registers have government-format Excel export
- Odisha OSCSC KMS 2025-26 compliance ready

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
- Bags mandatory validation on Mill Entry

## Prioritized Backlog

### P2 (Medium)
- Python backend service layer refactoring
- Triple backend code deduplication

### P3 (Low)
- Payment logic centralized service layer

### Future - Government Registers Phase 2
- Transit Pass Tracking
- CMR Delivery Tracker with OTR (Outturn Ratio)
- Monthly Return Auto-generation (Collector ko 15th tak)

### Future - Government Registers Phase 3
- Security Deposit Management (Bank Guarantee)
- Quality Test Report Register

## Key Technical Notes
- Triple Backend: Any change to Python MUST be replicated in desktop-app and local-server JS routes
- Desktop paths: Use `os.homedir()` not `Program Files` for dynamic files
- Auth: Session-cookie based, no JWT
- Watermark: Python uses reportlab monkey-patch, JS uses drawWatermark in addPdfHeader + createPdfDoc helper
- Collection mapping: MongoDB `mill_entries` = JS `entries`, `milling_entries` = milling process data
- Govt registers: `gunny_bag_register` (Python/MongoDB) = `govt_gunny_bag_register` (JS, to avoid conflict with existing `gunny_bags` collection)

## Deployment Notes
- **Desktop App (.exe)**: GitHub Actions auto-builds on push to main
- **Web Server (mill.9x.design)**: User deploys Python FastAPI backend manually
- **IMPORTANT**: After every code change, user must deploy to BOTH desktop (new .exe build) AND web server (git pull + restart)

## Permanent Rules
1. **Version Bump + WhatsNew**: Har fix/feature ke baad version bump (3 package.json) + WhatsNew.jsx update MANDATORY
2. **Parity Check**: Har fix/feature ke baad `python3 /app/scripts/check-parity.py` run karna MANDATORY
3. **Route Sync**: JS routes change karne ke baad `bash /app/scripts/sync-js-routes.sh` run karna MANDATORY
4. **Collection Name Mapping**: MongoDB `mill_entries` = JS `entries` (NOT `milling_entries`)
5. **Hindi/Hinglish**: User se SIRF Hindi/Hinglish mein baat karo
6. **Frontend API Pattern**: Use Electron-aware relative path pattern, never hardcode `process.env.REACT_APP_BACKEND_URL`
