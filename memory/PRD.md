# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Architecture
- **Frontend:** React (CRA) with Shadcn/UI, Tailwind CSS
- **Web Backend:** Python FastAPI + MongoDB
- **Desktop App:** Electron + Express + Local JSON
- **Local Server:** Express + Local JSON (LAN access)
- **CI/CD:** GitHub Actions auto-builds .exe on push

## Current Version: v55.2.0

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
- Telegram integration for daily reports
- PDF/Excel export for all reports
- IPC-based downloads for Electron (no window.open)
- Auto-updater via GitHub releases

## Recent Changes (v55.2.0 - Mar 2026)
- **NEW:** WhatsApp "Send to Group" button on all report/ledger pages
- **NEW:** GET /api/whatsapp/groups - Fetch group list from 360Messenger
- **NEW:** POST /api/whatsapp/send-group - Send to specific WhatsApp group
- **FIX:** _send_wa_to_group() now uses correct POST /v2/sendGroup endpoint

## Prioritized Backlog
### P1
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2
- GSTR-1 Export (monthly HSN-wise summary for GST portal)
- Code deduplication across desktop-app/routes and local-server/routes
- Payment logic centralization into service layer
- Stock calculation logic centralization
