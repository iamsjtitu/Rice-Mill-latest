# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Architecture
- **Frontend:** React (CRA) with Shadcn/UI, Tailwind CSS
- **Web Backend:** Python FastAPI + MongoDB
- **Desktop App:** Electron + Express + Local JSON
- **Local Server:** Express + Local JSON (LAN access)
- **CI/CD:** GitHub Actions auto-builds .exe on push

## Current Version: v55.3.0

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
- WhatsApp integration (360Messenger) - individual + group sending
- **Default Group auto-select** from Settings across all Send to Group dialogs
- Telegram integration for daily reports
- PDF/Excel export for all reports
- IPC-based downloads for Electron (no window.open)
- Auto-updater via GitHub releases

## Recent Changes (v55.3.0 - Mar 2026)
- **NEW:** Default WhatsApp Group selector in Settings (auto-selects in all dialogs)
- **NEW:** WhatsApp "Send to Group" button on all report/ledger pages
- **NEW:** GET /api/whatsapp/groups + POST /api/whatsapp/send-group endpoints
- **FIX:** _send_wa_to_group() now uses correct POST /v2/sendGroup endpoint

## Prioritized Backlog
### P1
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2
- GSTR-1 Export (monthly HSN-wise summary for GST portal)
- Code deduplication across desktop-app/routes and local-server/routes
- Payment logic centralization into service layer
- Stock calculation logic centralization
