# Navkar Agro - Mill Entry System PRD

## Original Problem Statement
Mill Entry application for grain tracking with auto-calculations, role-based authentication, exports, and mandi target tracking.

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React.js + Tailwind CSS + Recharts
- **Database**: MongoDB (mill_entries, users, mandi_targets collections)
- **Exports**: openpyxl (Excel), reportlab (PDF)

## User Personas
1. **Admin** - Full CRUD access, target management, user management
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

### Phase 3 - Auth & Export ✅ (Mar 2026)
- Admin/Staff role-based authentication
- Staff 5-minute edit window restriction
- Password change feature
- Select All & Bulk Delete
- Styled Excel export (openpyxl)
- Styled PDF export (reportlab + frontend print)

### Phase 4 - Dashboard & Targets ✅ (Mar 2026)
- **Dashboard Tab** with Agent-wise bar chart (Recharts)
- **Mandi Target Management**:
  - Admin sets targets per mandi (target QNTL + cutting %)
  - Expected Total = Target + Cutting % excess
  - Progress bars showing achieved vs expected
  - Pending amount calculation
  - Color-coded progress (red/blue/amber/green)
- Date range totals API

## Mandi Target Feature
**Example**: Badkutru target 5000 QNTL + 5% cutting
- Expected Total: 5000 + 250 = **5250 QNTL**
- Achieved: 278.11 QNTL (from entries)
- Pending: 4971.89 QNTL
- Progress: 5.3%

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

### Mandi Targets (Admin only for CUD)
- GET /api/mandi-targets
- POST /api/mandi-targets
- PUT /api/mandi-targets/{id}
- DELETE /api/mandi-targets/{id}
- GET /api/mandi-targets/summary

### Dashboard
- GET /api/dashboard/agent-totals
- GET /api/dashboard/date-range-totals

### Suggestions
- GET /api/suggestions/trucks
- GET /api/suggestions/agents
- GET /api/suggestions/mandis
- GET /api/suggestions/kms_years

### Exports
- GET /api/export/excel
- GET /api/export/pdf

## Prioritized Backlog

### P0 (Critical) - DONE ✅
- Auto calculations
- Role-based authentication
- Styled exports
- Dashboard with charts
- Mandi Target tracking

### P1 (High Priority)
- [ ] Code refactoring: Break App.js into components
- [ ] Code refactoring: Break server.py into modules

### P2 (Medium Priority)
- [ ] Agent-wise performance reports
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
- /app/test_reports/iteration_3.json (Dashboard & Targets - 22 tests PASS)

## Files Structure
```
/app/backend/
  server.py - All APIs, models, calculations, exports
  tests/ - pytest test files

/app/frontend/src/
  App.js - Full React frontend with Dashboard
  App.css - Custom styles
  components/ui/ - Shadcn components
```

## Notes
- Database: MongoDB (MONGO_URL from .env)
- "Made with Emergent" badge is platform-level feature
