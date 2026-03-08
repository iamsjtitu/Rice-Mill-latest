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

## Bug Fixes Applied

### Session 1 - Route Fixes (2026-03-08)
1. desktop-app/routes/staff.js: Fixed 11 API path mismatches (hyphens to slashes)
2. desktop-app/main.js: Fixed fy-settings endpoint (POST->PUT, kms_year->active_fy)
3. local-server/routes/auth.js: Added missing /api/fy-settings (GET + PUT)
4. local-server/routes/auth.js: Removed duplicate ExcelJS/PDFDocument imports
5. local-server/routes/exports.js: Fixed duplicate ExcelJS/PDFDocument declarations

### Session 2 - PDF Black Box Fix (2026-03-08)
6. All ₹ (Rupee symbol) replaced with Rs. in ALL PDF text in both desktop-app and local-server
   - cashbook.js, cmr_exports.js, ledgers.js, desktop-app/main.js
7. Cash Book PDF column widths increased: Category 70->90, Description 100->150
8. Created shared pdf_helpers.js (addPdfHeader, addPdfTable) for cashbook and cmr_exports

### Session 3 - PDF Improvements & Auto-Open (2026-03-08)
9. addPdfTable improved in ALL 3 locations (desktop-app/main.js, local-server exports.js, pdf_helpers.js):
   - Row height increased 13px -> 15px for better readability
   - Header height increased 16px -> 18px
   - Added lineBreak: false and ellipsis: true to prevent text overflow to next row
10. PDF/Excel Auto-Open: desktop-app will-download handler now uses shell.openPath() to auto-open files after download (removed dialog popup)
11. Keyboard Shortcuts: 7 new shortcuts added (DC=Alt+T, Reports=Alt+O, Trading=Alt+G, Mill Parts=Alt+K, Staff=Alt+S, Settings=Alt+I, Help=?)
12. FY Auto-generate: Extended range to currentYear+1 so future FY years always available

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Prioritized Backlog
- No pending tasks. User needs to rebuild Windows desktop app to test all fixes.
