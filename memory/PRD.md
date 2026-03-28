# Mill Entry System - PRD

## Current Version: v51.2.0

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON (FreeSans fonts bundled)
- Local Server: Express + Local JSON (FreeSans fonts bundled)
- Triple Backend Parity: 100% verified

## Credentials
- Username: admin, Password: admin123

## Key Features
- WhatsApp 360Messenger with PDF attachment
- Desktop WhatsApp PDF: localhost URL detection → tmpfiles.org upload → public URL
- Compression middleware: Content-Type based filter prevents ERR_STREAM_WRITE_AFTER_END
- WhatsApp footer: "Thank you / {company_name}"
- Daily Report Export: PDF + Excel (Detail + Summary modes)
- PDF column widths: Python `* mm`, JS `* 2.835`

## Completed in v51.2.0 (29 Mar 2026)
1. Compression filter: Content-Type check for PDF/Excel/binary
2. WhatsApp localhost URL detection in resolvePdfUrl
3. WhatsApp footer: "Thank you / {company}" in all 3 backends
4. Feature Demo page: GST Invoice Generator, Photo Attachment, Hindi Voice Input
5. Version bump to v51.2.0

## Feature Demo (Preview Only - Not in Desktop Yet)
1. **GST Invoice Generator** - Full stock items, HSN codes, CGST/SGST/IGST, Preview modal
2. **Photo Attachment** - Upload receipt/slip photo with Paddy Entry
3. **Hindi Voice Input** - Mic button on every input field, Web Speech API

## Upcoming Tasks (User Approval Pending)
- Implement approved demo features into production (all 3 backends)
- P1: Export Preview feature

## Backlog
- P2: Desktop/Local server code deduplication
- P2: Payment logic centralization into service layer
