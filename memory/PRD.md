# Navkar Agro - Mill Entry System PRD

## Original Problem Statement
User ne quintals edit kiye par wo automatic ab kg mai nahi le raha and automatic calculations b nahi kar paa raha hai. KG to Quintals auto calculate hona chahiye. Subsequently, user requested complete rebuild with role-based auth, advanced calculations, and styled exports.

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React.js with Tailwind CSS
- **Database**: MongoDB (mill_entries, users collections)
- **Exports**: openpyxl (Excel), reportlab (PDF)

## User Personas
1. **Admin** - Full CRUD access, user management
2. **Staff** - Create entries, edit own entries within 5 mins only
3. **Accountant** - Reports dekhta hai, export karta hai

## Core Requirements (Static)

### Authentication
- Admin/Staff roles with JWT-based login
- Staff: 5-minute edit window on own entries only
- Password change feature for all users

### Weight Calculations
- KG to QNTL: KG / 100
- GBW Cut: If G.Deposite filled = BAG × 0.50kg, else BAG × 1kg
- Mill W = KG - GBW Cut
- Moisture Cut: >17% moisture = (moisture - 17)% cut from Mill W QNTL
- Cutting %: Percentage cut from Mill W QNTL
- P.Pkt: 0.50kg per plastic bag
- Final W = Mill W - Moisture Cut - Cutting - P.Pkt - Disc/Dust/Poll

### Data Management
- KMS Year (e.g., "2025-2026") and Season (Kharif/Rabi)
- Default filter: Current KMS Year
- Filters: Truck No, Agent Name, Mandi Name, KMS Year, Season
- Select All & Bulk Delete functionality

### Exports
- Styled Excel (.xlsx) with colorful formatting
- Styled PDF (A4 Landscape) with gradient header, color-coded columns
- Both exports include: G.Deposite, Cash, Diesel Paid, GBW Cut, Moisture

## What's Been Implemented

### Phase 1 - Core Features ✅ (Jan 2026)
- [x] KG to QNTL auto conversion
- [x] Mill W auto calculation (KG - GBW Cut)
- [x] Final W auto calculation
- [x] CRUD operations
- [x] Totals summary

### Phase 2 - Enhanced Features ✅ (Jan 2026)
- [x] Truck No. auto-suggest
- [x] Agent Name auto-suggest
- [x] Mandi Name auto-suggest
- [x] BAG → G.Deposite auto-fill
- [x] P.Pkt (Plastic Bag) 0.50kg/bag deduction
- [x] Cutting % based calculation
- [x] Moisture Cut calculation (>17% logic)
- [x] Filters with default KMS Year

### Phase 3 - Auth & Export ✅ (Mar 2026)
- [x] Admin/Staff role-based authentication
- [x] Staff 5-minute edit window restriction
- [x] Password change feature
- [x] Select All & Bulk Delete
- [x] Styled Excel export with colors (openpyxl)
- [x] Styled PDF export (frontend print + backend reportlab)
- [x] All columns in exports: G.Dep, Cash, Diesel, GBW Cut, Moisture

## API Endpoints
- POST /api/auth/login - User login
- POST /api/auth/change-password - Change password
- GET /api/auth/verify - Verify user session
- GET /api/entries - List entries (with filters)
- POST /api/entries - Create entry
- PUT /api/entries/{id} - Update entry
- DELETE /api/entries/{id} - Delete entry
- POST /api/entries/bulk-delete - Bulk delete entries
- GET /api/totals - Get totals (with filters)
- GET /api/suggestions/trucks - Truck auto-suggest
- GET /api/suggestions/agents - Agent auto-suggest
- GET /api/suggestions/mandis - Mandi auto-suggest
- GET /api/suggestions/kms_years - KMS year list
- GET /api/export/excel - Styled Excel export
- GET /api/export/pdf - Styled PDF export (reportlab)

## Prioritized Backlog

### P0 (Critical) - DONE ✅
- [x] Auto calculations fix
- [x] CRUD operations
- [x] Role-based authentication
- [x] Styled exports with all columns

### P1 (High Priority)
- [ ] Migrate from MongoDB collections to persistent storage best practices
- [ ] Code refactoring: Break monolithic App.js and server.py into modules

### P2 (Medium Priority)
- [ ] Dashboard with charts
- [ ] Agent-wise performance reports
- [ ] Date range filter for reporting
- [ ] Bulk import from Excel

### P3 (Low Priority)
- [ ] Audit trail for entry changes
- [ ] Mobile responsive improvements
- [ ] Agent-Mandi category management UI

## Test Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Files Structure
- /app/backend/server.py - All backend logic, API endpoints, exports
- /app/frontend/src/App.js - Full React frontend
- /app/frontend/src/App.css - Custom styles
- /app/test_reports/ - Test results

## Notes
- "Made with Emergent" badge is platform-level (cannot remove)
- Database: MongoDB (MONGO_URL from .env)
