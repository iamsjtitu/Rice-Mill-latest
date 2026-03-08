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

## Bug Fixes Applied (2026-03-08)
1. **desktop-app/routes/staff.js**: Fixed 11 API path mismatches (hyphens → slashes to match frontend expectations)
   - `/api/staff-attendance` → `/api/staff/attendance`
   - `/api/staff-attendance/bulk` → `/api/staff/attendance/bulk`
   - `/api/staff-advances` → `/api/staff/advance`
   - `/api/staff-advances/:id` → `/api/staff/advance/:id`
   - `/api/staff-salary/calculate` → `/api/staff/salary-calculate`
   - `/api/staff-payments` → `/api/staff/payments`
   - `/api/staff-payments/:id` → `/api/staff/payments/:id`
   - `/api/staff-payments/export` → `/api/staff/export/payments`
2. **desktop-app/main.js**: Fixed fy-settings endpoint (POST→PUT, field names `kms_year`→`active_fy`)
3. **local-server/routes/auth.js**: Added missing `/api/fy-settings` (GET + PUT) endpoint
4. **local-server/routes/auth.js**: Removed duplicate ExcelJS/PDFDocument imports
5. **local-server/routes/exports.js**: Fixed duplicate ExcelJS/PDFDocument declarations
6. **Frontend rebuilt** and copied to both local-server/public and desktop-app/frontend-build

## Testing Done
- All 32+ API endpoints tested on local-server
- All 11 PDF/Excel export endpoints verified (HTTP 200, valid file sizes)
- Frontend login and dashboard verified via screenshot
- All Node.js route modules load without errors

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Prioritized Backlog
- No pending tasks
