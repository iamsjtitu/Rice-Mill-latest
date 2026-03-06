# Navkar Agro - Mill Entry System PRD

## Original Problem Statement
User ne quintals edit kiye par wo automatic ab kg mai nahi le raha and automatic calculations b nahi kar paa raha hai. KG to Quintals auto calculate hona chahiye.

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React.js with Tailwind CSS
- **Database**: MongoDB (mill_entries, agent_mandis collections)

## User Personas
1. **Mill Operator** - Daily entries karta hai
2. **Accountant** - Reports dekhta hai, export karta hai
3. **Manager** - Totals aur filters use karta hai

## Core Requirements (Static)
1. KG to Quintals auto conversion (1 QNTL = 100 KG)
2. Weight calculations (Mill W, Final W)
3. CRUD operations for entries
4. Export functionality (PDF, Excel)
5. Filter by Truck/Agent/Mandi

## What's Been Implemented (Jan 2026)

### Phase 1 - Core Features ✅
- [x] KG to QNTL auto conversion
- [x] Mill W auto calculation (KG - GBW Cut)
- [x] Final W auto calculation
- [x] CRUD operations
- [x] Totals summary

### Phase 2 - Enhanced Features ✅
- [x] Truck No. auto-suggest
- [x] Agent Name auto-suggest
- [x] Mandi Name auto-suggest
- [x] BAG → G.Deposite auto-fill
- [x] P.Pkt (Plastic Bag) 0.50kg/bag deduction
- [x] Cutting % based calculation (5%, 5.26%, etc.)
- [x] Excel export (CSV)
- [x] PDF export (print)
- [x] Filters (Truck, Agent, Mandi)
- [x] Filtered totals

## API Endpoints
- GET /api/entries - List entries (with filters)
- POST /api/entries - Create entry
- PUT /api/entries/{id} - Update entry
- DELETE /api/entries/{id} - Delete entry
- GET /api/totals - Get totals (with filters)
- GET /api/suggestions/trucks - Truck auto-suggest
- GET /api/suggestions/agents - Agent auto-suggest
- GET /api/suggestions/mandis - Mandi auto-suggest
- GET /api/export/excel - Export to CSV

## Prioritized Backlog

### P0 (Critical) - DONE
- [x] Auto calculations fix
- [x] CRUD operations

### P1 (High Priority)
- [ ] Agent-Mandi category management UI
- [ ] Date range filter
- [ ] Print invoice format

### P2 (Medium Priority)
- [ ] Dashboard with charts
- [ ] Agent-wise performance
- [ ] Monthly/Weekly comparison
- [ ] Bulk import from Excel

### P3 (Low Priority)
- [ ] Multi-user authentication
- [ ] Audit trail
- [ ] Mobile responsive improvements

## Next Tasks
1. Agent-Mandi category management UI
2. Date range filter for reporting
3. Dashboard with charts
