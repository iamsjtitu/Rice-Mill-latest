# Mill Entry System - PRD

## Current Version: v51.3.0

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON (FreeSans fonts bundled)
- Local Server: Express + Local JSON (FreeSans fonts bundled)
- Triple Backend Parity: 100% verified

## Credentials
- Username: admin, Password: admin123

## Key Features
- WhatsApp 360Messenger with PDF attachment (all report types)
- Desktop WhatsApp: localhost URL detection → tmpfiles.org upload → public URL
- NO compression middleware in desktop/local (removed to prevent ERR_STREAM_WRITE_AFTER_END)
- WhatsApp footer: "Thank you / {company_name}"
- Daily Report: empty sections auto-hidden (Payments shows only if > 0)
- GST Invoice Generator demo (Feature Demo tab)
- PDF column widths: Python `* mm`, JS `* 2.835`

## Completed in v51.3.0 (29 Mar 2026)
1. compression() middleware REMOVED entirely from desktop + local server (root cause of ERR_STREAM_WRITE_AFTER_END)
2. Daily Report gap fixed: removed duplicate empty summary box in Cash Flow, Payments section conditional
3. WhatsApp localhost URL detection in resolvePdfUrl (127.0.0.1/localhost → tmpfiles upload)
4. WhatsApp footer: "Thank you / {company}" in all 3 backends
5. GST Invoice Generator demo page (Feature Demo tab)
6. Photo/Voice demos removed per user request

## Completed in v51.2.0 (28 Mar 2026)
1. Initial compression filter fix (Content-Type check) - superseded by v51.3.0 full removal
2. WhatsApp footer first attempt

## Upcoming Tasks (User Approval Pending)
- Implement GST Invoice Generator into production (all 3 backends + PDF generation)
- P1: Export Preview feature

## Backlog
- P2: Desktop/Local server code deduplication
- P2: Payment logic centralization
