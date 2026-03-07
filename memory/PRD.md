# Navkar Agro - Mill Entry System PRD

## Original Problem Statement
Mill Entry application for grain tracking with auto-calculations, role-based authentication, exports, mandi target tracking, and payment management for trucks and agents. The application has 3 versions: web preview (React+FastAPI), Desktop app (Electron), and Local server (Node.js/Express).

## Architecture
- **Web Preview**: React.js frontend + FastAPI + MongoDB
- **Desktop App**: Electron + Express.js + JSON file database
- **Local Server**: Node.js/Express + JSON file database
- **Frontend**: React.js + Tailwind CSS + Recharts
- **Exports**: openpyxl/reportlab (Python), exceljs/pdfkit (Node.js)

## User Personas
1. **Admin** - Full CRUD access, target management, payment management, branding settings
2. **Staff** - Create entries, edit own entries within 5 mins only

## What's Been Implemented

### Phase 1-5 - Core Features, Auth, Dashboard, Payments ✅
- KG to QNTL auto conversion, Mill W, Final W calculations
- Auto-suggest, BAG → G.Deposite auto-fill, P.Pkt deduction
- Admin/Staff role-based auth, styled Excel/PDF exports
- Dashboard with Mandi Targets, Progress bars
- Truck Payments (Rate × QNTL - Cash - Diesel), Agent Payments

### Phase 6 - Bug Fixes & Keyboard Shortcuts ✅
- Alt+N/E/D/P/R/F, Esc shortcuts

### Phase 7-8 - Print Invoice & Consolidated View ✅
- Bilingual (Hindi+English) truck/agent payment receipts
- Truck Owner Consolidated View with print/export

### Phase 9-11 - Refactoring, Date Filter, RST/TP Fields ✅
- LoginPage.jsx, AutoSuggest.jsx extracted
- Date range filter, RST No. & TP No. fields

### Phase 12 - White Label / Branding Settings ✅
- Dynamic company name + tagline in header/footer/receipts/exports

### Phase 13-17 - Desktop App & Local Server ✅
- Electron .exe with Tally-style folder selection
- Local JSON database (no MongoDB needed)
- Auto-backup system (daily, max 7)
- ExcelJS + PDFKit exports
- 49+ API endpoints mirrored from Python backend

### Phase 18 - Bug Fixes (Mar 2026) ✅
- **Print Fix**: Replaced `window.open + document.write` with Blob URL approach (`safePrintHTML`) for reliability in both Electron and browser
- **Truck Payment Edit**: Fixed missing default values (rate_per_qntl, paid_amount, status) in `updateTruckPayment` for both desktop-app and local-server
- **Agent Payment Calculation**: Fixed `|| 5` / `|| 10` → `?? 5` / `?? 10` (nullish coalescing). JavaScript `||` treats 0 as falsy, so cutting_rate=0 was defaulting to 5. Now uses `??` which only defaults for null/undefined.
- **About Section**: Added to Settings tab - "Developed by Host9x Team, Version 1.1"

### Phase 19 - Dark/Light Theme Toggle (Mar 2026) ✅
- CSS-based theme switching using `[data-theme="light"]` selectors
- Theme toggle button (Sun/Moon icon) in header and login page
- Persists in localStorage (`mill_theme` key)
- Light mode: white/gray backgrounds, dark text, card shadows
- Smooth 0.3s transitions on theme switch
- All tabs, cards, tables, dialogs support both themes

## API Endpoints
### Authentication
- POST /api/auth/login, POST /api/auth/change-password, GET /api/auth/verify

### Mill Entries
- GET/POST /api/entries, PUT/DELETE /api/entries/{id}, POST /api/entries/bulk-delete, GET /api/totals

### Mandi Targets
- CRUD: /api/mandi-targets, GET /api/mandi-targets/summary

### Dashboard
- GET /api/dashboard/agent-totals, /api/dashboard/date-range-totals

### Truck & Agent Payments
- Full CRUD + rate/pay/mark-paid/undo-paid/history endpoints

### Exports
- Excel and PDF for entries, truck payments, agent payments

## Test Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Test Reports
- /app/test_reports/iteration_1.json through iteration_7.json (previous)
- /app/test_reports/iteration_8.json - Bug fixes (100% PASS - 14/14 backend, 100% frontend)

## Files Structure
```
/app/backend/server.py - FastAPI backend (MongoDB)
/app/frontend/src/App.js - Main React frontend
/app/frontend/src/components/ - LoginPage, AutoSuggest, UI components
/app/desktop-app/main.js - Electron + Express + JSON DB
/app/local-server/server.js - Standalone Express + JSON DB
```

## Prioritized Backlog

### P0 (Critical) - ALL DONE ✅
- All core features, payments, exports, printing, branding, desktop app

### P1 (High Priority)
- [ ] Code refactoring: Break App.js into components (Dashboard, Payments, Entries)
- [ ] Code refactoring: Modularize main.js and server.js into routers

### P2 (Medium Priority)
- [ ] Monthly/weekly comparison charts
- [ ] Improved print invoice formatting

### P3 (Low Priority)
- [ ] Audit trail for entry changes
- [ ] Mobile responsive improvements
