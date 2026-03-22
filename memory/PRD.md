# Mill Entry System - PRD

## Original Problem Statement
Navkar Agro Mill Entry System - A comprehensive accounting and management application for a rice mill. Includes entries, payments, vouchers, cash book, hemali, mill parts stock, staff management, milling tracker, DC tracker, private trading, leased trucks, reports, FY summary, and more.

## User Personas
- Mill Owner (Admin) - Full access to all features
- Operators - Data entry access

## Architecture
- **Frontend**: React (Vite) + Tailwind CSS + Shadcn UI
- **Backend (Web)**: FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Node.js/Express + JSON file DB
- **Language**: Hindi UI labels throughout

## Core Features (Complete)
1. Entry Management (Paddy Purchase, DC Tracker)
2. Milling & CMR Tracking
3. Voucher System (Purchase, Sale)
4. Cash Book & Ledger
5. Payment Management (Truck, Agent, Owner, Diesel)
6. Staff Management (Attendance, Salary)
7. Hemali Payment System
8. Mill Parts Stock Management
9. Private Trading (Paddy + Rice)
10. Reports (Daily, Summary, Export)
11. FY Summary & Balance Sheet
12. Telegram Integration (Report sharing)
13. Settings & Configuration
14. Authentication & Authorization

## Latest Features (v25.1.50) - March 22, 2026

### Round Off Feature (P0 - COMPLETE)
- Round Off input added to ALL payment dialogs across the entire software
- Creates a SEPARATE "Round Off" entry in Cash Book (category: "Round Off")
- Positive round_off = nikasi (extra paid), Negative = jama (less paid)
- All 9 payment sections covered
- Backend utility: `/app/backend/utils/round_off.py`
- Frontend component: `/app/frontend/src/components/common/RoundOffInput.jsx`
- Desktop synced: All routes updated

### Mill Parts Store Room Feature (P1 - COMPLETE)
- Store Room CRUD (Add/Edit/Delete)
- Store Room assignment to mill parts via Parts Master
- Delete store room -> unassigns all linked parts
- Store Room-wise Inventory Report (new tab)
- **Excel and PDF export** for Store Room report
- Backend: `/api/store-rooms` CRUD + `/api/mill-parts/store-room-report` + `/excel` + `/pdf`
- Desktop synced: All desktop routes updated

## Backlog
- P1: Refactor PDF/Excel generation logic (duplicate code)
- P1: Centralize stock calculation logic
- P2: Sardar-wise monthly breakdown report
- P2: Centralize payment logic (hemali.py + cashbook.py -> service layer)

## Testing Status
- Round Off: Backend curl tests PASS, Frontend screenshot PASS
- Store Rooms: Backend curl tests PASS, Frontend screenshot PASS
- Store Room Export: Excel 200 OK, PDF 200 OK
- Desktop: Code-level verification done
