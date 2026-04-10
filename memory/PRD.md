# Rice Mill Management System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities. Must maintain perfect parity between web (Python/MongoDB) and desktop (Node.js/Local JSON) versions.

## Current Version: v88.78.0

## Architecture
- **Frontend**: React (Vite) with Shadcn UI
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (LAN access)
- **Triple Parity**: All logic changes in Python must be mirrored in desktop-app and local-server JS routes

## Completed Features (This Session)
- v88.78.0: Global PDF Watermark (Settings > Watermark tab with text/image, opacity slider, auto-applies to ALL PDFs)
- v88.77.0: Agent & Mandi PDF row overlap fix + Wt Discrepancy white theme
- v88.76.0: TP Weight auto-validation + Weight Discrepancy Report

## Key Implementation Details
### PDF Watermark System
- **Python**: Monkey-patches `SimpleDocTemplate.build` at startup via `watermark_helper.py`. Zero changes to 48 existing PDF routes.
- **JS (Desktop/Local)**: Modified `addPdfHeader` in `pdf_helpers.js` to draw watermark on first page + register `pageAdded` event for subsequent pages. Each route wrapper passes `branding._watermark` from `database.data.app_settings`.
- **API**: `GET/PUT /api/settings/watermark` + `POST /api/settings/watermark/upload` (image)
- **Settings**: Stored in `app_settings` collection with `setting_id: "watermark"`

## Key Files Modified (This Session)
- `/app/backend/utils/watermark_helper.py` (NEW - watermark draw + monkey-patch)
- `/app/backend/routes/auth.py` (Watermark API endpoints)
- `/app/backend/server.py` (Startup hook for watermark)
- `/app/desktop-app/routes/pdf_helpers.js` (drawWatermark function + addPdfHeader integration)
- `/app/desktop-app/routes/*.js` (All wrappers updated with branding._watermark)
- `/app/local-server/routes/*.js` (Mirrored from desktop-app)
- `/app/frontend/src/components/Settings.jsx` (WatermarkTab component)
- `/app/frontend/src/components/WhatsNew.jsx` (Changelog)

## Upcoming Tasks
- P1: Export Preview feature
- P2: Python backend service layer refactoring
- P2: Centralize stock calculation logic
- P3: Triple backend code deduplication

## Testing
- Credentials: admin / admin123
- Test report: /app/test_reports/iteration_180.json (100% pass)
