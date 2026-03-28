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
- WhatsApp 360Messenger with PDF attachment: Daily Report, Party Ledger, Truck Payment, Truck Owner, Leased Truck
- Desktop WhatsApp PDF: Local PDF → tmpfiles.org upload → public URL → 360Messenger
- Desktop PDF localhost URL detection: resolvePdfUrl detects 127.0.0.1/localhost and auto-uploads to tmpfiles
- Compression middleware: Content-Type based filter prevents ERR_STREAM_WRITE_AFTER_END for PDF/Excel/binary
- Backup System: Backup Now (folder), Auto Daily, ZIP Download, ZIP Restore
- Extra Fields: Placement above/below + Label optional
- FreeSans font bundled in electron-builder files list for Hindi PDF support
- Daily Report Export: PDF + Excel (Detail + Summary modes)
- Mill Entries Export: PDF + Excel with Totals row
- PDF column widths: Python uses `* mm` (ReportLab), JS uses `* 2.835` (PDFKit mm→points)
- WhatsApp footer: "Thank you\n{company_name}" across all endpoints

## Completed in v51.2.0 (29 Mar 2026)
1. Compression filter fix: checks response Content-Type for PDF/Excel/binary (prevents ERR_STREAM_WRITE_AFTER_END)
2. WhatsApp localhost URL fix: resolvePdfUrl now detects 127.0.0.1/localhost URLs and uploads to tmpfiles
3. WhatsApp footer changed: "Kripya baaki rashi..." → "Thank you\n{company}" in all 3 backends
4. Version bump to v51.2.0

## Completed in v51.1.0 (28 Mar 2026)
1. WhatsApp PDF attachment via tmpfiles.org for Desktop/Local (replaced file.io)
2. Fixed ERR_STREAM_WRITE_AFTER_END crash (compression skip for PDF routes)
3. Fixed Daily Report Detail Mode PDF squished columns (mm→points conversion)
4. Fixed registerFonts comma syntax errors across 7 route files × 2 backends
5. fonts/ directory bundled in electron-builder files list

## Upcoming Tasks
- P1: Export Preview feature (Preview data before exporting to Excel/PDF)

## Backlog
- P2: Desktop/Local server code deduplication
- P2: Payment logic centralization into service layer
