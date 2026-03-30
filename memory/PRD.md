# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Architecture
- **Frontend:** React (CRA) with Shadcn/UI, Tailwind CSS
- **Web Backend:** Python FastAPI + MongoDB
- **Desktop App:** Electron + Express + Local JSON
- **Local Server:** Express + Local JSON (LAN access)
- **CI/CD:** GitHub Actions auto-builds .exe on push

## Current Version: v55.4.0

## What's Been Implemented
- Full paddy purchase management with party ledgers
- Double-entry cash book with multi-account support
- Sale book with GST vouchers
- Milling/CMR tracking
- DC (Delivery Challan) tracker with truck payments
- Leased truck management
- Staff attendance & payment
- Hemali payment tracking
- Mill parts stock management
- FY Summary dashboard with Balance Sheet
- WhatsApp integration (360Messenger):
  - Individual message send
  - **Send to Group** button on all pages (CashBook, Ledgers, SaleBook, PaddyPurchase, LeasedTruck, Payments, Reports)
  - **Default Group** selector in Settings (auto-selects in all dialogs)
  - **Scheduled auto-send** daily report to group at user-set time
- Telegram integration for daily reports
- PDF/Excel export for all reports
- IPC-based downloads for Electron
- Auto-updater via GitHub releases

## Recent Changes (v55.4.0 - Mar 2026)
- **NEW:** Default WhatsApp Group dropdown in Settings
- **NEW:** Auto Daily Report → Group scheduler (time-based, like Telegram scheduler)
- **NEW:** SendToGroupDialog auto-selects default group on open
- **REMOVED:** Old "Daily Report Group ID" manual input field
- **NEW:** WhatsApp "Send to Group" button on 7 pages
- **FIX:** _send_wa_to_group() uses correct POST /v2/sendGroup endpoint

## Prioritized Backlog
### P1
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2
- GSTR-1 Export (monthly HSN-wise summary for GST portal)
- Code deduplication across desktop-app/routes and local-server/routes
- Payment logic centralization into service layer
- Stock calculation logic centralization
