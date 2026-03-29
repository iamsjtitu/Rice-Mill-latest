# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI backend (MongoDB), and Electron/Express desktop app (local JSON storage). Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Core Requirements
- Triple backend parity: Python (web), Desktop JS (Electron), Local Server JS
- Double-entry accounting for all financial transactions
- Stock management with milling operations
- PDF generation and WhatsApp sharing
- GST Tax Invoice support integrated into Sale Vouchers

## Current Version: v53.7.0

## Architecture
```
/app
├── backend/          # Python FastAPI + MongoDB
├── desktop-app/      # Electron + Express + Local JSON
│   ├── main.js       # Download handlers (setWindowOpenHandler + will-download)
│   ├── preload.js    # Context bridge for renderer
│   └── routes/
├── local-server/     # Express + Local JSON (LAN access)
├── frontend/         # React (shared across all backends)
│   └── src/
│       ├── utils/
│       │   └── download.js  # Universal download: window.open (Electron) / blob (Browser)
│       ├── App.js
│       └── components/
│           ├── Settings.jsx
│           ├── CashBook.jsx
│           ├── Ledgers.jsx
│           └── WhatsNew.jsx
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

## Completed in v53.7.0 (29 Mar 2026)
- **CRITICAL FIX**: Electron PDF/Excel download now works via window.open → setWindowOpenHandler → downloadURL → native save dialog
- **FIX**: WhatsApp tmpfiles.org PDF URL changed from HTTP to HTTPS in Python backend (was sending http:// links which may fail)
- **FIX**: Electron main.js `will-download` handler simplified to let Electron show native save dialog
- download.js rewritten: Electron uses window.open(), Browser uses blob+anchor approach

## Completed in v53.6.0 (29 Mar 2026)
- WhatsApp Party Ledger PDF parity fix (uses same endpoint as download)

## Completed in v53.0.0 (29 Mar 2026)
- Settings page refactored into sub-tabs (extracted from App.js into Settings.jsx)
- CRITICAL FIX: Fixed 156 corrupted Content-Disposition headers across Desktop/Local backends
- Fixed 74 double backtick issues, 82 trailing single quote corruptions
- Made 446 safeSync callbacks async

## Prioritized Backlog
### P1
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2
- GSTR-1 Export (monthly HSN-wise summary Excel for GST portal upload)
- Code deduplication across Desktop and Local server backends
- Payment logic centralization into service layer
- Centralize stock calculation logic

## Known Issues
- Many frontend components have inline blob downloads (not using downloadFile utility) that may still fail in Electron — gradual migration needed
- Accessibility: Missing aria-describedby on some Dialog components (pre-existing)
