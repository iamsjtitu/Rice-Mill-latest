# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated database sync between local computers.

## Current Version: v88.45.0

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
- **Electron IPC**: App closes on logout via window.electronAPI.closeApp
- **User Permissions Bug Fix (Apr 2026)**: Fixed setUser prop not passed to UsersTab, localStorage→sessionStorage fix, can_edit_rst added to ROLE_PERMISSIONS across all 3 backends

## Key Design Decision: Season vs FY
- **Season-wise (Kharif/Rabi):** Mill Entries, Private Paddy, Milling (CMR), DC Deliveries, Dashboard
- **FY-wise (April-March):** Cash Book, Ledgers, Payments, Bank, Diesel Account, Staff, Hemali, Vouchers, FY Summary, GST Ledger, SaleBook, PurchaseVouchers

## Prioritized Backlog

### P1 (High)
- [ ] Daily Summary Report (Auto) - End-of-day summary of entries, payments, and cash position

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
