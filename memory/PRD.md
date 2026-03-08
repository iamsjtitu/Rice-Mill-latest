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
### New Features (2026-03-08): P&L Summary, Mill Parts Stock, Daily Report - DONE
### Daily Report Upgrade: Normal/Detail modes, better PDF, Mill Parts section - DONE

### Staff Attendance & Payment System - DONE (2026-03-08)
- **Staff Master**: Add/Edit/Delete staff with Monthly or Weekly(per day) salary type
- **Attendance**: Daily marking with P(Present)/A(Absent)/H(Half Day)/CH(Holiday-Paid Leave)
- **Advance**: Track advance payments given to staff with balance auto-calculated
- **Salary Calculation**:
  - Monthly: salary/30 × days_worked (always 30-day basis)
  - Weekly: per_day_rate × days_worked
  - Days Worked = Present + Holiday + (HalfDay × 0.5)
- **Payment Settlement**: Advance deduction + Net Payment → auto Cash Book Nikasi entry
- **Delete**: Payment deletion also removes Cash Book entry

## Architecture
```
/app/backend/routes/ (13 modules): auth, entries, payments, exports, milling, cashbook, dc_payments, reports, private_trading, ledgers, mill_parts, daily_report, staff
/app/frontend/src/components/: Dashboard, Payments, Reports, MillPartsStock, StaffManagement, etc.
```

## Key Collections
staff, staff_attendance, staff_advance, staff_payments, mill_entries, milling_entries, cash_transactions, dc_entries, dc_deliveries, private_paddy, rice_sales, private_payments, mill_parts, mill_parts_stock, etc.

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Prioritized Backlog
- **P1:** Port features to Node.js backends + complete refactoring
- **P2:** macOS Desktop Build
