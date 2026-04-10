# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated database sync between local computers.

## Current Version: v88.55.0

## What's Been Implemented
- Full mill entry CRUD with RST numbering
- Double-entry cash book & ledger system
- Private paddy trading with party ledgers
- Milling (CMR) operations
- DC payments, vouchers, purchase vouchers
- GST ledger & FY summary
- Staff management & hemali payments
- Auto vehicle weight with RTSP camera integration
- Weighbridge serial port integration
- Telegram & WhatsApp notifications
- User roles & permissions (with can_edit_rst)
- Audit logging
- Excel/PDF exports with proper date sorting
- Desktop app auto-updater via GitHub releases
- Shadow Copy sync (replaced Google Drive API)
- Mill entry cash/diesel edit syncs with vehicle_weights
- Auto-backup on logout with custom backup folder selection
- JSON backup file upload & restore
- **Season vs FY separation**: Financial components use FY-only filtering, operational components use season filtering
- **Mobile Responsiveness**: Hamburger menu, compact cards, scrollable tables
- **Dark Theme Fixes**: Text visibility/contrast across all components
- **Settings Sync**: camera_config and mandi_cutting_map synced to backend DB
- **Sync Status Remote Access (Apr 2026)**: Local Server mein `/api/sync-status` endpoint added — Cloudflare Tunnel se bhi DATA SYNC panel dikhega
- **Mill Entry RST Field Lock (Apr 2026)**: RST fetch hone par Date, Truck No., FY Year, Season, TP No., Agent Name, Mandi Name sab lock (readonly) ho jaate hain
- **AutoSuggest disabled prop (Apr 2026)**: AutoSuggest component ab `disabled` prop support karta hai for field locking
- **TP No. Duplicate Server-side Check (Apr 2026)**: Backend (Python + Desktop JS + Local JS) mein TP duplicate validation — First Weight, Second Weight, aur Edit teeno endpoints mein. Paginated data miss hone ka issue khatam.
- **Electron IPC**: App closes on logout via window.electronAPI.closeApp
- **P.Pkt Cut in Mill W Fix (Apr 2026)**: P.Pkt Cut ab Mill W calculation mein subtract hota hai (pehle sirf Final W mein hota tha). Formula: `Mill W = KG - GBW Cut - P.Pkt Cut`. Fix applied across all 5 calculation locations: Frontend (App.js), Python backend (models.py), Desktop main.js, Desktop sqlite-database.js, Local server.js, and both import_excel.js files.
- **TP Number Duplicate Check (Apr 2026)**: Auto Vehicle Weight mein duplicate TP number entry blocked. Same TP already used in RST → red warning shown and submit prevented.
- **VW Date Lock Setting (Apr 2026)**: Settings mein toggle added to lock Auto Vehicle Weight date to current date only (enable/disable).
- **Staff PDF Export Fix (Apr 2026)**: `_addPdfHdr` → `addPdfHeader` rename fix in desktop-app and local-server staff.js routes.
- **SQLite Pragma Fix (Apr 2026)**: `better-sqlite3` pragma `{ simple: true }` compatibility fix for different versions.
- **Batch Recalculate Endpoint (Apr 2026)**: `POST /api/entries/recalculate-all` endpoint for admin to recalculate all existing entries with updated formula.

## Key Design Decision: Season vs FY
- **User Permissions Bug Fix (Apr 2026)**: Fixed setUser prop not passed to UsersTab, localStorage→sessionStorage fix, can_edit_rst added to ROLE_PERMISSIONS across all 3 backends
- **Season-wise (Kharif/Rabi):** Mill Entries, Private Paddy, Milling (CMR), DC Deliveries, Dashboard
- **FY-wise (April-March):** Cash Book, Ledgers, Payments, Bank, Diesel Account, Staff, Hemali, Vouchers, FY Summary, GST Ledger, SaleBook, PurchaseVouchers

## Prioritized Backlog

### P1 (High)
- None currently

### P2 (Medium)
- [ ] Python backend service layer refactoring
- [ ] Centralize stock calculation logic

### P3 (Low)
- [ ] Code deduplication across triple backends

## Key Credentials
- Login: admin / admin123

## Architecture
- Triple Backend: Python (web), Desktop JS (Electron), Local JS (LAN server)
- All logic changes must be replicated across all 3 backends
- Shadow Copy sync replaces Google Drive API (removed due to data corruption)
- KV Store in SQLite for persisting desktop/local settings
