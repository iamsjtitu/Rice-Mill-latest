# Mill Entry System - PRD

## Original Problem Statement
A comprehensive management tool for a rice mill named "Mill Entry System" (NAVKAR AGRO). The application consists of a React frontend, a primary Python/FastAPI backend, and two secondary Node.js backends (local-server and desktop-app for Electron).

## Architecture
- **Frontend:** React (runs on port 3000)
- **Primary Backend:** Python/FastAPI (port 8001)
- **Local Server:** Node.js/Express (port 8080) - for local deployment
- **Desktop App:** Electron + Node.js/Express - Windows desktop build

## Core Features
- Mill Entry Management (Paddy entries, RST tracking)
- Dashboard & Targets
- Payments (MSP, Private)
- Milling (CMR)
- Cash Book (Jama/Nikasi)
- DC & Payments
- Ledgers
- Private Trading (Paddy Purchase, Rice Sales, By-Products, FRK)
- Reports (Season P&L, CMR vs DC, Daily Report)
- Mill Parts Stock Management
- Staff Management (Attendance, Advance, Salary, Payments)
- PDF/Excel Export for all reports
- FY Settings (KMS Year auto-generated, Season)
- Auth (Admin/Staff roles)
- Branding
- Keyboard Shortcuts (17 shortcuts for all tabs and actions)

## What's Been Implemented (All Complete)
- All features listed above are implemented and functional
- Python/FastAPI backend: Fully functional (source of truth)
- Local-server (Node.js): All features ported and working
- Desktop-app (Electron): All features ported and working
- Frontend: React SPA with all modules

## Bug Fixes Applied

### Session 1 (2026-03-08)
1. desktop-app/routes/staff.js: Fixed 11 API path mismatches (hyphens to slashes)
2. desktop-app/main.js: Fixed fy-settings endpoint (POST->PUT, field names kms_year->active_fy)
3. local-server/routes/auth.js: Added missing /api/fy-settings (GET + PUT) endpoint
4. local-server/routes/auth.js: Removed duplicate ExcelJS/PDFDocument imports
5. local-server/routes/exports.js: Fixed duplicate ExcelJS/PDFDocument declarations

### Session 2 (2026-03-08)
6. PDF Black Box Fix: Replaced all rupee symbol with Rs. in PDF text across all Node.js backends
7. Cash Book PDF Column Widths: Increased Description and Category column widths
8. PDF Helper Functions: Created shared pdf_helpers.js for cashbook and cmr_exports

### Session 3 (2026-03-08)
9. Keyboard Shortcuts: Added 7 new shortcuts (DC Tracker, Reports, Private Trading, Mill Parts, Staff, Settings, Show Shortcuts) + updated dialog to show all 17 shortcuts
10. FY Auto-generate: Extended KMS year range to include next year (currentYear+1) so future FY years are always available

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Prioritized Backlog
- No pending tasks
