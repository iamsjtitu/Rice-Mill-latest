# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI backend (MongoDB), and Electron/Express desktop app (local JSON storage). Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Core Requirements
- Triple backend parity: Python (web), Desktop JS (Electron), Local Server JS
- Double-entry accounting for all financial transactions
- Stock management with milling operations
- PDF generation and WhatsApp sharing
- GST Tax Invoice support integrated into Sale Vouchers

## Current Version: v51.6.0

## Architecture
```
/app
├── backend/          # Python FastAPI + MongoDB
├── desktop-app/      # Electron + Express + Local JSON
├── local-server/     # Express + Local JSON (LAN access)
├── frontend/         # React (shared across all backends)
```

## What's Been Implemented
- Full CRUD for Sale/Purchase Vouchers, Paddy Purchase, Cash Book, Bank Book
- Stock Summary with milling operations
- Party ledgers with double-entry accounting
- PDF export + WhatsApp sharing via 360Messenger + tmpfiles.org
- GST Company Settings (Settings tab)
- Per-item GST in Sale Vouchers (HSN, GST%, CGST/SGST/IGST)
- Buyer GSTIN and Address fields in Sale Vouchers
- Tax Invoice PDF with Company GSTIN header and tax breakup
- WhatsApp direct PDF send for Sale Vouchers
- GST Summary dialog (HSN-wise tax breakup for GST return filing)
- Daily Reports with WhatsApp PDF attachments
- Opening Balances management
- FY Summary and Dashboard
- Auto-updater for desktop app via GitHub Actions

## Completed in v51.6.0 (29 Mar 2026)
- WhatsApp direct PDF send button on each sale voucher row
- GST Summary dialog with HSN-wise CGST/SGST/IGST breakup table
- PDF auto-upload to tmpfiles.org for WhatsApp attachment

## Completed in v51.5.0 (29 Mar 2026)
- Merged GST Invoice fields into Sale Voucher (per-item HSN + GST%)
- Added Buyer GSTIN and Buyer Address fields
- Updated Sale Voucher PDF to Tax Invoice format
- Deleted standalone GST Invoice module
- Updated all 3 backends with computeSaleGst helper

## Prioritized Backlog
### P1
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2
- Code deduplication across Desktop and Local server backends
- Payment logic centralization into service layer
- Centralize stock calculation logic
