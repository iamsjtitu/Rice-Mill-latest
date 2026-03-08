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
3. **Daily Report** - DONE + UPGRADED (2026-03-08):
   - Normal/Detail mode toggle
   - Professional PDF export using reportlab Platypus
   - Mill Parts Stock section with Parts Purchased + Parts Used tables
   - Detail mode: expanded columns (Mandi, RST, Moisture, Party, Category, Vehicle, Rate)
   - Bug fix: collection name `db.entries` → `db.mill_entries` for paddy data

## Architecture
```
/app
├── backend/routes/       # 12 route modules
├── frontend/src/         # React with extracted components
├── local-server/         # Node.js (needs refactoring + new features)
├── desktop-app/          # Electron (needs refactoring + new features)
```

## Prioritized Backlog
- **P1:** Port new features to Node.js backends + complete refactoring
- **P2:** macOS Desktop Build
