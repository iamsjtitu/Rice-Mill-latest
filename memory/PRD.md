# Mill Entry System - PRD

## Original Problem Statement
Comprehensive management tool for a rice mill named "Mill Entry System". Full-stack application with React frontend, Python/FastAPI backend (web preview), and two Node.js backends (desktop/local). User communicates in Hindi.

## Core Requirements
- **P0**: Full Data & Feature Parity between web preview and desktop app
- **P0**: Financial Year Balance Carry-Forward (Tally-style) for ALL modules
- **P1**: New Features & UX improvements
- **P2**: Stability & Performance

## Architecture
- Frontend: React (port 3000)
- Backend: FastAPI Python (port 8001)
- Desktop: Node.js Electron backend
- Local: Node.js local server
- Database: MongoDB

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## What's Implemented (as of Feb 10, 2026)
### FY Opening Balance Carry-Forward (ALL Modules) ✅
- **Cash Book**: Opening cash + bank from previous FY (was already done)
- **Mill Parts Stock**: `opening_stock` per part from previous FY
- **Diesel Accounts**: `opening_balance` per pump from previous FY
- **Local Party Accounts**: `opening_balance` per party from previous FY
- **Staff Advances**: `opening_balance` per staff from previous FY
- Implemented in Python backend + both Node.js backends (desktop-app & local-server)
- Frontend updated with OB columns in all summary tables

### Bug Fixes ✅
- **Monthly Report**: Fixed API call `/staff/advances` → `/staff/advance` (singular)
- **Part-wise Summary Search**: Removed conflicting text search bar from partwise tab

### Previously Completed Features
- PDF/Excel Report Parity (centered, DD-MM-YYYY format)
- Staff Advance Ledger with debit/credit history
- "All Parties" and "All Staff" options
- Multi-Staff Salary Settlement ("Settle All")
- Performance Optimization (caching, compression)
- Print-Friendly Views
- Various bug fixes (dropdowns, API mismatches)

## Current Version: 3.6.2

## Pending Issues
- **P2**: Intermittent Typing/Focus Issue in Desktop App (fix deployed, user verification pending)
- **P2**: Desktop App folder selection takes time to open (new issue, not started)

## Upcoming Tasks
- None specified by user currently

## Test Reports
- `/app/test_reports/iteration_33.json` - All 11 backend tests + 7 frontend features PASS
