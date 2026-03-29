# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI backend (MongoDB), and Electron/Express desktop app (local JSON storage). Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Core Requirements
- Triple backend parity: Python (web), Desktop JS (Electron), Local Server JS
- Double-entry accounting for all financial transactions
- Stock management with milling operations
- PDF generation and WhatsApp sharing
- GST Tax Invoice support integrated into Sale Vouchers

## Current Version: v53.0.0

## Architecture
```
/app
├── backend/          # Python FastAPI + MongoDB
├── desktop-app/      # Electron + Express + Local JSON
├── local-server/     # Express + Local JSON (LAN access)
├── frontend/         # React (shared across all backends)
│   └── src/
│       ├── App.js            # Main routing (~2340 lines)
│       └── components/
│           ├── Settings.jsx  # Settings with sub-tabs
│           └── ...
```

## What's Been Implemented
- Full CRUD for Sale/Purchase Vouchers, Paddy Purchase, Cash Book, Bank Book
- Stock Summary with milling operations
- Party ledgers with double-entry accounting
- PDF export + WhatsApp sharing via 360Messenger + tmpfiles.org
- GST Company Settings, Per-item GST in Sale Vouchers
- Tax Invoice PDF with Company GSTIN header and tax breakup
- WhatsApp direct PDF send for Sale Vouchers
- GST Summary dialog (HSN-wise tax breakup)
- Daily Reports with WhatsApp PDF attachments
- Opening Balances management, FY Summary and Dashboard
- Auto-updater for desktop app via GitHub Actions
- safePdfPipe for Desktop/Local PDF generation (no stream crashes)
- Settings page organized into sub-tabs (Branding, GST, Stock, Messaging, Data)

## Completed in v53.0.0 (29 Mar 2026)
- Settings page refactored into sub-tabs (extracted from App.js into Settings.jsx)
  - App.js reduced from 3477 to ~2340 lines
  - Sub-tabs: Branding, GST, Stock, Messaging, Data
- **CRITICAL FIX**: Fixed 156 corrupted Content-Disposition headers across Desktop/Local backends
  - Previous safePdfPipe script had removed `res.setHeader('Content-Disposition',...)` prefix
  - Fixed 74 double backtick issues, 82 trailing single quote corruptions
  - Made 446 safeSync callbacks async for await safePdfPipe support
  - Updated safeSync wrapper to handle async Promise rejections
  - This fixes: PDF downloads returning .json, cash book not loading, route load failures

## Prioritized Backlog
### P1
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2
- GSTR-1 Export (monthly HSN-wise summary Excel for GST portal upload)
- Code deduplication across Desktop and Local server backends
- Payment logic centralization into service layer
- Centralize stock calculation logic
