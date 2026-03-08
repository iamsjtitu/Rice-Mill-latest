# Mill Entry System - Product Requirements Document

## Original Problem Statement
Comprehensive Mill Entry System for managing paddy-to-rice conversion (Custom Milled Rice - CMR) for government supply, private trading, and complete financial tracking.

## Core Requirements & Status

### Phase 1-4: Paddy Entry, Milling, DC, Stock & Payment, Reporting - DONE
### Phase 5: Consolidated Ledgers - DONE
### Phase 6: Private Trading (Paddy Purchase + Rice Sale) - DONE
### Cash Book Module - DONE (with filters, auto-linking)
### Global FY Year Setting - DONE
### Code Refactoring - DONE (Python backend + Frontend extracted)

### New Features - DONE (2026-03-08)
1. **P&L Summary Card on Dashboard** - DONE
2. **Mill Parts Stock Module** - DONE (CRUD + Summary + Export)
3. **Daily Report** - DONE, then UPGRADED (2026-03-08):
   - Normal/Detail mode toggle
   - Professional PDF export using reportlab Platypus (tables, colored headers, sections)
   - Mill Parts Stock section with Parts Purchased + Parts Used tables
   - Detail mode: expanded columns (Mandi, RST, Moisture, Party, Category, Vehicle, Rate, etc.)
   - Normal mode: simplified summary columns

## Architecture
```
/app
├── backend/routes/       # 12 route modules (auth, entries, payments, exports, milling, cashbook, dc_payments, reports, private_trading, ledgers, mill_parts, daily_report)
├── frontend/src/         # React with extracted components (Dashboard, Payments, Reports, MillPartsStock, etc.)
├── local-server/         # Node.js (needs refactoring + new features)
├── desktop-app/          # Electron (needs refactoring + new features)
```

## Prioritized Backlog
- **P1:** Port new features to Node.js backends + complete refactoring
- **P2:** macOS Desktop Build
