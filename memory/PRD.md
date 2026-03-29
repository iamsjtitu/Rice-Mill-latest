# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI backend (MongoDB), and Electron/Express desktop app (local JSON storage). Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Current Version: v53.7.0

## Architecture
```
/app
├── backend/          # Python FastAPI + MongoDB
│   └── routes/
│       ├── ledgers.py     # _generate_party_ledger_pdf_bytes() shared function
│       └── whatsapp.py    # Calls shared function directly (no HTTP self-call)
├── desktop-app/      # Electron + Express + Local JSON
│   ├── main.js       # setWindowOpenHandler + will-download + IPC save-file
│   ├── preload.js    # saveFile IPC exposed to renderer
│   └── routes/
├── local-server/     # Express + Local JSON (LAN access)
├── frontend/
│   └── src/
│       ├── utils/
│       │   └── download.js  # downloadFile (GET: window.open/Electron, blob/Browser)
│       │                     # downloadPost (POST: IPC save/Electron, blob/Browser)
│       └── components/       # ALL exports now use downloadFile/downloadPost
```

## What's Been Implemented
- Full CRUD for Sale/Purchase Vouchers, Paddy Purchase, Cash Book, Bank Book
- Stock Summary with milling operations
- Party ledgers with double-entry accounting
- PDF export + WhatsApp sharing via 360Messenger + tmpfiles.org
- GST Company Settings, Per-item GST in Sale Vouchers
- Tax Invoice PDF with Company GSTIN header and tax breakup
- Daily Reports with WhatsApp PDF attachments
- Opening Balances management, FY Summary and Dashboard
- Auto-updater for desktop app via GitHub Actions
- Settings page organized into sub-tabs (Branding, GST, Stock, Messaging, Data)

## Completed in v53.7.0 (29 Mar 2026)
- **CRITICAL**: ALL inline blob downloads migrated to centralized downloadFile() utility
  - Reports.jsx (CMR vs DC, Season PNL, Agent Mandi)
  - DCTracker.jsx (DC Register, MSP Payments, Gunny Bags, Gunny Purchase Report)
  - MillingTracker.jsx (Milling Report, FRK, Byproduct Sales, Paddy Custody Register)
  - SaleBook.jsx (PDF + Excel export)
  - StaffManagement.jsx (Advance Ledger - uses downloadPost for POST)
  - Payments.jsx (Diesel Account Excel + PDF)
  - LocalPartyAccount.jsx (PDF + Excel)
- **CRITICAL**: Electron download now works via window.open → setWindowOpenHandler → downloadURL → native save dialog
- **CRITICAL**: Added IPC save-file handler (preload.js + main.js) for POST-based exports in Electron
- **FIX**: WhatsApp Party Ledger PDF now generated internally via shared _generate_party_ledger_pdf_bytes() (no HTTP self-call that failed due to DNS issues)
- **FIX**: tmpfiles.org URL changed from http:// to https:// in Python backend

## Prioritized Backlog
### P1
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2
- GSTR-1 Export (monthly HSN-wise summary Excel for GST portal upload)
- Code deduplication across Desktop and Local server JS backends
- Payment logic centralization into service layer
- Centralize stock calculation logic
