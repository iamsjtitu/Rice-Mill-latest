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
- FY Settings (KMS Year, Season)
- Auth (Admin/Staff roles)
- Branding

## What's Been Implemented (All Complete)
- All features listed above are implemented and functional
- Python/FastAPI backend: Fully functional (source of truth)
- Local-server (Node.js): All features ported and working
- Desktop-app (Electron): All features ported and working
- Frontend: React SPA with all modules

## Bug Fixes Applied

### Session 1 (2026-03-08)
1. **desktop-app/routes/staff.js**: Fixed 11 API path mismatches (hyphens to slashes)
2. **desktop-app/main.js**: Fixed fy-settings endpoint (POST->PUT, field names kms_year->active_fy)
3. **local-server/routes/auth.js**: Added missing /api/fy-settings (GET + PUT) endpoint
4. **local-server/routes/auth.js**: Removed duplicate ExcelJS/PDFDocument imports
5. **local-server/routes/exports.js**: Fixed duplicate ExcelJS/PDFDocument declarations
6. Frontend rebuilt and copied to both local-server/public and desktop-app/frontend-build

### Session 2 (2026-03-08)
7. **PDF Black Box Fix**: Replaced all ₹ (Rupee symbol) with Rs. in PDF text across all Node.js backends. PDFKit's Helvetica font doesn't support ₹, causing black boxes. Files fixed:
   - local-server/routes/cashbook.js (PDF headers)
   - local-server/routes/cmr_exports.js (PDF headers)
   - local-server/routes/ledgers.js (descriptions + PDF text)
   - desktop-app/main.js (all corresponding areas)
8. **Cash Book PDF Column Widths**: Increased Description (100->150) and Category (70->90) column widths to prevent text wrapping/overflow
9. **Cash Book Text Truncation**: Increased substring limits for category (15->25) and description (20->35)
10. **PDF Helper Functions**: Created shared pdf_helpers.js with addPdfHeader/addPdfTable since cashbook.js and cmr_exports.js were calling undefined functions (causing 500 errors)

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Prioritized Backlog
- No pending tasks
