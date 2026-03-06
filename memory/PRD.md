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

### Phase 3 - Auth & Export ✅ (Mar 2026)
- Admin/Staff role-based authentication
- Staff 5-minute edit window restriction
- Password change feature
- Select All & Bulk Delete
- Styled Excel export (openpyxl)
- Styled PDF export (reportlab + frontend print)

### Phase 4 - Dashboard & Targets ✅ (Mar 2026)
- Dashboard Tab with Agent-wise bar chart (Recharts)
- Mandi Target Management with Base Rate + Cutting Rate
- Progress bars showing achieved vs expected
- Color-coded progress (red/blue/amber/green)

### Phase 5 - Payment Tracking ✅ (Mar 2026)
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
  - Example: Badkutru 5000×₹10 + 250×₹5 = ₹51,250
  - Partial payment support

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
- GET /api/export/truck-payments-excel (with truck_no filter)
- GET /api/export/truck-payments-pdf (with truck_no filter)

### Agent Payments
- GET /api/agent-payments
- POST /api/agent-payments/{mandi_name}/pay
- POST /api/agent-payments/{mandi_name}/mark-paid

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
- Truck & Agent Payment tracking

### P1 (High Priority)
- [ ] Code refactoring: Break App.js into components
- [ ] Code refactoring: Break server.py into modules

### P2 (Medium Priority)
- [ ] Monthly/weekly comparison charts
- [ ] Print invoice format
- [ ] Payment history view

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
- /app/test_reports/iteration_4.json (Payments - 21/22 tests PASS)

## Files Structure
```
/app/backend/
  server.py - All APIs, models, calculations, exports
  tests/ - pytest test files

/app/frontend/src/
  App.js - Full React frontend with Dashboard & Payments
  App.css - Custom styles
  components/ui/ - Shadcn components
```

## Database Collections
- **mill_entries**: Entry records
- **users**: User accounts
- **mandi_targets**: Target with rates
- **truck_payments**: Truck payment records
- **agent_payments**: Agent/mandi payment records

## Notes
- Database: MongoDB (MONGO_URL from .env)
- "Made with Emergent" badge is platform-level feature
