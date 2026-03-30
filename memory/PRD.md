# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI backend (MongoDB), and Electron/Express desktop app (local JSON storage). Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Current Version: v54.7.0

## Architecture
```
/app
├── backend/          # Python FastAPI + MongoDB
│   └── routes/
│       ├── cashbook.py    # _generate_cash_book_pdf_bytes() shared function
│       ├── salebook.py    # Sale Book CRUD + PDF/Excel exports
│       ├── ledgers.py     # _generate_party_ledger_pdf_bytes() shared function
│       └── whatsapp.py    # Smart PDF detection: cash-book vs party-ledger
├── desktop-app/      # Electron + Express + Local JSON
│   ├── main.js       # IPC download-and-save via electron.net.request
│   ├── preload.js    # saveFile IPC exposed to renderer
│   └── routes/
│       ├── cashbook.js    # Fixed: fmtAmt:pFmt import for PDF
│       ├── salebook.js    # Fixed: PDFKit PDF generation (was HTML)
│       └── pdf_helpers.js # Shared: addPdfHeader, addPdfTable, safePdfPipe, fmtAmt
├── local-server/     # Express + Local JSON (LAN access)
│   └── routes/       # MUST mirror desktop-app routes
├── frontend/
│   └── src/
│       ├── utils/
│       │   └── download.js  # downloadFile (IPC for Electron, blob for browser)
│       └── components/
│           └── CashBook.jsx # WhatsApp now sends cash-book/pdf URL
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
- Auto-updater for desktop app via GitHub Actions (auto-release on push)
- Settings page organized into sub-tabs (Branding, GST, Stock, Messaging, Data)
- Centralized download utility (downloadFile/downloadPost) for all exports
- Electron IPC download via electron.net.request (direct server fetch)

## Completed in v54.7.0 (Feb 2026)
- **BUGFIX**: Cash Book PDF 500 error — `pFmt` was never imported in JS routes. Added `fmtAmt: pFmt` import.
- **BUGFIX**: Sale Book PDF blank page — Route returned HTML instead of PDF. Rewrote to use PDFKit.
- **BUGFIX**: WhatsApp Cash Book PDF mismatch — WhatsApp was sending Party Ledger PDF (wrong design/calculations). Now sends identical Cash Book PDF via shared `_generate_cash_book_pdf_bytes()`.
- **IMPROVEMENT**: GitHub Actions auto-release on push to main (no manual release creation needed).
- All fixes applied to desktop-app AND local-server for triple-backend parity.

## Prioritized Backlog
### P1
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2
- GSTR-1 Export (monthly HSN-wise summary Excel for GST portal upload)
- Code deduplication across Desktop and Local server JS backends
- Payment logic centralization into service layer
- Centralize stock calculation logic
