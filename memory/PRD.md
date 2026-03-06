# Navkar Agro - Mill Entry System PRD

## Original Problem Statement
Mill Entry application for grain tracking with auto-calculations, role-based authentication, exports, mandi target tracking, and payment management for trucks and agents.

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React.js + Tailwind CSS + Recharts
- **Database**: MongoDB (mill_entries, users, mandi_targets, truck_payments, agent_payments)
- **Exports**: openpyxl (Excel), reportlab (PDF)

## User Personas
1. **Admin** - Full CRUD access, target management, payment management
2. **Staff** - Create entries, edit own entries within 5 mins only

## What's Been Implemented

### Phase 1 - Core Features ✅
- KG to QNTL auto conversion (1 QNTL = 100 KG)
- Mill W auto calculation (KG - GBW Cut)
- Final W auto calculation
- CRUD operations with totals summary

### Phase 2 - Enhanced Features ✅
- Auto-suggest for Truck/Agent/Mandi
- BAG → G.Deposite auto-fill
- P.Pkt deduction (0.50kg/bag)
- Cutting % and Moisture Cut calculations
- KMS Year + Season filtering

### Phase 3 - Auth & Export ✅
- Admin/Staff role-based authentication
- Staff 5-minute edit window restriction
- Password change feature
- Select All & Bulk Delete
- Styled Excel export (openpyxl)
- Styled PDF export (reportlab + frontend print)

### Phase 4 - Dashboard & Targets ✅
- Dashboard Tab with Agent-wise bar chart (Recharts)
- Mandi Target Management with Base Rate + Cutting Rate
- Progress bars showing achieved vs expected
- Color-coded progress (red/blue/amber/green)

### Phase 5 - Payment Tracking ✅
- **Truck Payments (Bhada):**
  - Per trip tracking
  - Rate × Final QNTL - Cash - Diesel = Net Amount
  - Admin sets rate per trip (default ₹32/QNTL)
  - Partial payment support
  - Mark as Paid to clear account

- **Agent/Mandi Payments:**
  - Based on Mandi Target (NOT achieved)
  - Calculation: (Target QNTL × Base Rate) + (Cutting QNTL × Cutting Rate)
  - Each mandi has different rates set by admin
  - Partial payment support

### Phase 6 - Bug Fixes & Keyboard Shortcuts ✅ (Mar 2026)
- **Bug Fix 1:** Agent Payment Mark Paid/Undo Paid - Fixed API parameter passing
- **Bug Fix 2:** Autocomplete keyboard navigation - Arrow keys + Enter selection
- **Bug Fix 3:** Total Amount display verification
- **Keyboard Shortcuts Added:**
  - Alt+N: New Entry
  - Alt+E: Entries Tab
  - Alt+D: Dashboard Tab
  - Alt+P: Payments Tab
  - Alt+R: Refresh Data
  - Alt+F: Open Filters
  - Esc: Close Dialogs
  - Keyboard shortcuts help dialog in header

### Phase 7 - UI Cleanup & Print Invoice ✅ (Mar 2026)
- **Agent-wise Chart Removed:** Removed bar chart from Dashboard as per user request
- **Print Invoice Feature:** Added printable receipt for Truck Payments
  - Professional Hindi+English bilingual format
  - Shows: Trip details, Weight, Rate, Gross/Deductions/Net amounts
  - Status badge (Paid/Partial/Pending)
  - Signature sections for Driver and Admin
  - Print button in browser opens ready-to-print receipt

### Phase 8 - Agent Print & Truck Owner Consolidated ✅ (Mar 2026)
- **Agent Payment Print Invoice:** Similar bilingual receipt for agent/mandi payments
  - Shows: Target details, Achieved, Base+Cutting rates, Total/Paid/Balance
  - Purple themed receipt with signature sections
  
- **Truck Owner Consolidated View:** NEW TAB in Payments
  - Groups all trips by truck number
  - Shows: Total trips, Total QNTL, Gross, Deductions, Net Payable, Paid, Balance
  - **Use Case:** Single truck owner with multiple trips gets one consolidated receipt
  - Print consolidated receipt with all trips detailed
  - Summary row at bottom with totals
  - **Excel Export:** Styled spreadsheet with all truck owners
  - **PDF Export:** Professional PDF report with grand totals

### Phase 9 - Code Refactoring (Initial) ✅ (Mar 2026)
- **Frontend Component Extraction:**
  - `LoginPage.jsx` - Authentication component (87 lines)
  - `AutoSuggest.jsx` - Reusable autocomplete with keyboard support (132 lines)
  - Added section headers in App.js for better organization
  - App.js reduced from ~3525 to ~3337 lines

- **Directory Structure:**
  ```
  /app/frontend/src/
  ├── components/
  │   ├── common/
  │   │   └── AutoSuggest.jsx    # Keyboard-enabled autocomplete
  │   ├── LoginPage.jsx          # Login/auth component
  │   └── ui/                    # Shadcn components
  └── App.js                     # Main app with Dashboard, Payments, Entries
  ```

### Phase 10 - Date Filter ✅ (Mar 2026)
- **Date Range Filter Added:**
  - "Date From" and "Date To" inputs in filter panel
  - Filter entries by specific date or date range
  - Works with existing filters (KMS Year, Season, Truck, Agent, Mandi)
  - Totals also update based on date filter

### Phase 11 - RST No. & TP No. Fields ✅ (Mar 2026)
- **New Entry Fields Added:**
  - RST No. - RST Number field in entry form (after Truck No.)
  - TP No. - TP Number field in entry form (after RST No.)
  
- **Filter Support:**
  - RST No. filter - search entries by RST number
  - TP No. filter - search entries by TP number
  
- **Table Display:**
  - RST No. and TP No. columns added in entries table
  - Shows "-" if field is empty

### Phase 12 - White Label / Branding Settings ✅ (Mar 2026)
- **Admin Settings Panel:** New "Settings" tab for Admin only
- **Dynamic Branding:**
  - Company Name (header, login, print receipts, exports)
  - Tagline (subtitle everywhere)
  - Live Preview before saving
- **White Label Ready:** App can be sold to different clients by changing branding
- **Note:** "Made with Emergent" badge is platform-level (only in preview, not in production/local deploy)

### Phase 13 - Windows Desktop App (Tally-style) - UPDATED Dec 2025
- **Electron Desktop Application:**
  - Tally jaisa Data Folder Selection screen (Splash Window)
  - Recent folders list with click-to-open
  - Create new data folder / Open existing folder options
  - Dark themed professional UI
  
- **Local JSON Database (JsonDatabase class):**
  - Data stored in user-selected folder as `millentry-data.json`
  - All CRUD operations: entries, mandi targets, payments
  - Auto-calculation of fields (matching backend exactly)
  - No MongoDB required - fully offline
  
- **Express API Server (mirrors FastAPI):**
  - All 45+ API endpoints implemented in JavaScript
  - Auth: login, verify, change-password
  - Entries: CRUD, bulk-delete, totals
  - Suggestions: trucks, agents, mandis, kms_years (correct format)
  - Dashboard: agent-totals, date-range-totals, monthly-trend
  - Mandi Targets: CRUD, summary
  - Truck Payments: list, rate, pay, mark-paid, undo-paid, history
  - Agent Payments: list, pay, mark-paid, undo-paid, history
  - Export: Excel (CSV format), PDF (print redirect)
  - Branding settings
  
- **Fixed Port Architecture:**
  - Desktop API runs on port 9876 (with fallback to random)
  - Frontend built with `REACT_APP_BACKEND_URL=http://127.0.0.1:9876`
  - Frontend also supports `window.ELECTRON_API_URL` for dynamic detection
  
- **Build Configuration:**
  - NSIS installer for Windows (standard install)
  - Portable .exe (no install needed)
  - electron-builder config with proper file inclusion
  
- **Files:**
  - `/app/desktop-app/main.js` - Complete Electron + Express + JSON DB
  - `/app/desktop-app/preload.js` - Secure context bridge
  - `/app/desktop-app/package.json` - Dependencies + build config
  - `/app/desktop-app/SETUP_GUIDE.md` - Hindi/English setup guide

## Mandi Target Feature
**Example**: Badkutru target 5000 QNTL + 5% cutting
- Expected Total: 5000 + 250 = **5250 QNTL**
- Base Rate: ₹10/QNTL, Cutting Rate: ₹5/QNTL
- Agent Payment: (5000×10) + (250×5) = **₹51,250**

## API Endpoints

### Authentication
- POST /api/auth/login
- POST /api/auth/change-password
- GET /api/auth/verify

### Mill Entries
- GET/POST /api/entries
- PUT/DELETE /api/entries/{id}
- POST /api/entries/bulk-delete
- GET /api/totals

### Mandi Targets
- GET /api/mandi-targets
- POST /api/mandi-targets
- PUT /api/mandi-targets/{id}
- DELETE /api/mandi-targets/{id}
- GET /api/mandi-targets/summary

### Dashboard
- GET /api/dashboard/agent-totals
- GET /api/dashboard/date-range-totals

### Truck Payments
- GET /api/truck-payments
- PUT /api/truck-payments/{entry_id}/rate
- POST /api/truck-payments/{entry_id}/pay
- POST /api/truck-payments/{entry_id}/mark-paid
- POST /api/truck-payments/{entry_id}/undo-paid
- GET /api/truck-payments/{entry_id}/history
- GET /api/export/truck-payments-excel
- GET /api/export/truck-payments-pdf

### Agent Payments
- GET /api/agent-payments
- POST /api/agent-payments/{mandi_name}/pay
- POST /api/agent-payments/{mandi_name}/mark-paid
- POST /api/agent-payments/{mandi_name}/undo-paid
- GET /api/agent-payments/{mandi_name}/history
- GET /api/export/agent-payments-excel
- GET /api/export/agent-payments-pdf

### Exports
- GET /api/export/excel
- GET /api/export/pdf
- GET /api/export/summary-report

## Prioritized Backlog

### P0 (Critical) - ALL DONE ✅
- Auto calculations
- Role-based authentication
- Styled exports (PDF with Rs. instead of ₹ symbol)
- Dashboard with charts
- Mandi Target tracking
- Truck & Agent Payment tracking
- Undo Paid feature
- Payment History
- Summary Report PDF
- Keyboard shortcuts
- Autocomplete keyboard navigation

### P1 (High Priority)
- [ ] Code refactoring: Break App.js into components
- [ ] Code refactoring: Break server.py into modules

### P2 (Medium Priority)
- [ ] Monthly/weekly comparison charts
- [ ] Print invoice format

### P3 (Low Priority)
- [ ] Audit trail for entry changes
- [ ] Mobile responsive improvements

## Test Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Test Reports
- /app/test_reports/iteration_1.json
- /app/test_reports/iteration_2.json
- /app/test_reports/iteration_3.json
- /app/test_reports/iteration_4.json
- /app/test_reports/iteration_5.json (Bug fixes - 100% PASS)
- /app/test_reports/iteration_6.json (Desktop app + API verification - 100% PASS)

## Files Structure
```
/app/backend/
  server.py - All APIs, models, calculations, exports (MongoDB)
  tests/ - pytest test files

/app/frontend/src/
  App.js - Full React frontend with Dashboard & Payments
  App.css - Custom styles
  components/ui/ - Shadcn components

/app/local-server/
  server.js - Standalone local Express server (JSON DB, all APIs, static serving)
  setup.bat - Windows first-time setup
  start.bat - Windows start script
  start.sh - Linux/Mac start script
  SETUP.md - Hindi instructions
  data/ - JSON database files
  public/ - React build

/app/desktop-app/
  main.js - Electron desktop app + Express API + JSON DB
  preload.js - Electron context bridge
  package.json - Build config (electron-builder)
  SETUP_GUIDE.md - Build instructions
```

## Database Collections
- **mill_entries**: Entry records
- **users**: User accounts
- **mandi_targets**: Target with rates
- **truck_payments**: Truck payment records
- **agent_payments**: Agent/mandi payment records

## Notes
- Database: MongoDB (MONGO_URL from .env)
- "Made with Emergent" badge is platform-level feature (cannot be removed)
