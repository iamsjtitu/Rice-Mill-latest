# Mill Entry System - Product Requirements Document

## Original Problem Statement
Comprehensive Mill Entry System for managing paddy-to-rice conversion (CMR) for government supply, private trading, complete financial tracking, staff management.

## Core Requirements & Status

### Phase 1-4: Paddy Entry, Milling, DC, Stock & Payment, Reporting - DONE
### Phase 5: Consolidated Ledgers - DONE
### Phase 6: Private Trading - DONE
### Cash Book Module - DONE
### Global FY Year Setting - DONE
### Code Refactoring - DONE (Python backend + Frontend)
### P&L Summary, Mill Parts Stock, Daily Report - DONE
### Daily Report Upgrade: Normal/Detail modes, better PDF - DONE

### Staff Attendance & Payment System - DONE (2026-03-08)
- Staff Master (Monthly/Weekly salary, CRUD)
- Attendance: P/A/H/CH (Present/Absent/Half-Day/Holiday-paid)
- Advance tracking with balance
- Salary Calculation: Monthly=salary/30×days, Weekly=per_day×days
- Payment Settlement: advance deduction → auto Cash Book Nikasi
- **PDF/Excel Exports**: Attendance report (date range, color-coded P/A/H/CH), Payment report
- **Daily Report Integration**: Staff Attendance section shows who came/absent/half-day/holiday

## Architecture
```
/app/backend/routes/ (13 modules): auth, entries, payments, exports, milling, cashbook, dc_payments, reports, private_trading, ledgers, mill_parts, daily_report, staff
/app/frontend/src/components/: Dashboard, Payments, Reports, MillPartsStock, StaffManagement, etc.
```

## Key API Endpoints (Staff)
- `/api/staff` (CRUD)
- `/api/staff/attendance` (GET/POST), `/api/staff/attendance/bulk` (POST)
- `/api/staff/advance` (GET/POST/DELETE), `/api/staff/advance-balance/{id}` (GET)
- `/api/staff/salary-calculate` (GET)
- `/api/staff/payments` (GET/POST/DELETE)
- `/api/staff/export/attendance?date_from&date_to&fmt` (GET)
- `/api/staff/export/payments?fmt` (GET)

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

### Staff Attendance Export Fix & Version Update - DONE (2026-03-08)
- PDF/Excel attendance export now fits on single A4 landscape page
- App version updated to 2.3 in About section

### Monthly Summary in Attendance Export - DONE (2026-03-08)
- PDF: New page with monthly summary table (Staff, Salary Type, Rate, per-month worked days, Total Days, Est. Salary + P/A/H/CH breakdown + Month-wise Est. Salary)
- Excel: New "Monthly Summary" sheet with same data including estimated salary
- Estimated salary calculated: worked_days × per_day_rate (Monthly=salary/30, Daily=salary_amount)
- Helps salary settlement with quick monthly overview

### Data Folder Auto-Load Removed - DONE (2026-03-08)
- Desktop app: Removed recent paths list from splash screen, lastPath no longer saved
- Local server: Added startup prompt for data folder selection (supports --data-dir CLI arg)
- User must manually select data folder every time app opens

### Node.js Feature Porting + Modular Refactoring - DONE (2026-03-08)
- Created 4 new route modules for both `local-server/routes/` and `desktop-app/routes/`:
  - `mill_parts.js` (9 routes) - Parts CRUD, Stock transactions, Summary, Excel/PDF exports
  - `staff.js` (16 routes) - Staff CRUD, Attendance (single/bulk), Advances, Salary calc, Payments, Attendance export with monthly summary + est. salary
  - `daily_report.js` (3 routes) - Daily Report data, PDF, Excel with all 9 sections
  - `reports_pnl.js` (6 routes) - Season P&L, CMR vs DC, Excel/PDF exports
- Fixed route mounting in `local-server/server.js` (was using `/api` prefix causing double-prefix)
- Registered all 4 new modules in both `local-server/server.js` and `desktop-app/main.js`
- All 34 routes verified via Node.js module loading test

### macOS Desktop Build Configuration - DONE (2026-03-08)
- Added macOS build config in `desktop-app/package.json` (DMG + PKG, Apple Silicon arm64)
- No code signing (identity: null) - local use only
- Build commands: `yarn build:mac-all` (both), `yarn build:mac-dmg`, `yarn build:mac-pkg`
- Created `MAC_BUILD_GUIDE.md` with step-by-step instructions
- Version updated to 2.3.0, routes/** included in build files

## Prioritized Backlog
- No pending tasks
