# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI backend (MongoDB), and Electron/Express desktop app (local JSON storage). Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Current Version: v54.6.0

## Architecture
```
/app
├── backend/          # Python FastAPI + MongoDB
│   └── routes/
│       ├── cashbook.py    # Cash Book CRUD + PDF/Excel exports
│       ├── salebook.py    # Sale Book CRUD + PDF/Excel exports
│       ├── ledgers.py     # _generate_party_ledger_pdf_bytes() shared function
│       └── whatsapp.py    # Calls shared function directly (no HTTP self-call)
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
- Centralized download utility (downloadFile/downloadPost) for all exports
- Electron IPC download via electron.net.request (direct server fetch)
- WhatsApp Party Ledger PDF generated internally (no HTTP self-call)

## Completed in v54.6.0 (Feb 2026)
- **BUGFIX**: Cash Book PDF 500 error fixed — `pFmt` was used but never imported in cashbook.js (desktop-app + local-server). Added `fmtAmt: pFmt` to destructured import from pdf_helpers.js.
- **BUGFIX**: Sale Book PDF blank page fixed — route was returning HTML (`res.type('html').send(html)`) instead of PDF binary. Rewrote to use PDFKit with addPdfHeader, addPdfTable, addTotalsRow, safePdfPipe.
- Both fixes applied to desktop-app/routes AND local-server/routes for triple-backend parity.
- Electron IPC download mechanism fully working via main.js `download-and-save`.
- Fixed 15+ undefined function 500 errors across desktop-app and local-server export routes.

## Prioritized Backlog
### P1
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2
- GSTR-1 Export (monthly HSN-wise summary Excel for GST portal upload)
- Code deduplication across Desktop and Local server JS backends
- Payment logic centralization into service layer
- Centralize stock calculation logic
