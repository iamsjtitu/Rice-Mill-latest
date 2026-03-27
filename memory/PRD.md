# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Architecture
```
/app
├── backend/              # Python FastAPI web backend (MongoDB)
├── desktop-app/          # Electron Express local backend (JSON storage)
│   ├── routes/           # Routes MUST mirror Python logic
│   └── frontend-build/   # Packaged React build
├── local-server/         # Express local network backend
│   └── routes/           # Routes MUST mirror Python logic
├── frontend/             # React Frontend (shared)
├── .github/workflows/    # CI/CD for building .exe releases
```

## Key Technical Rules
- **Triple Backend System**: Any logic change in Python MUST be replicated in both JS route folders
- **Round-off Accounting**: Ledger balance = amount + round_off
- **Party Label Consistency**: Always use `_makePartyLabel(party, mandi)` helper to avoid duplicates
- **Electron Build**: `yarn build` in frontend → sync to desktop-app/frontend-build/
- **GitHub Release Filenames**: MUST use hyphens not spaces (GitHub converts spaces to dots, breaking auto-updater)
- **payment_status**: Computed dynamically in GET endpoints — if paid_amount >= total_amount → 'paid'

## Current Version: v43.0.0

## Completed Features (All Sessions)
- Mill Entries CRUD with Excel Import/Export
- Milling (CMR) management
- DC (Delivery Challan) system
- Voucher system (Pvt Paddy Purchase + Rice Sales)
- Cash Book & Ledgers (double-entry accounting)
- Payment system with round-off support
- Dashboard & Targets
- Reports (Party Ledger, Balance Sheet)
- Staff management
- FY Summary
- Settings & Password management
- Enter/Tab sequential form navigation + Ctrl+S save
- Payment Undo cascade deletion (Cashbook + Ledgers)
- Auto-linking Cash Book entries to Paddy Purchase
- Health Check / Auto-Fix endpoint
- Duplicate party name prevention (`_makePartyLabel` helper)
- Mark Paid / Undo Paid with full cashbook + ledger entries
- Desktop/Local Server route parity

## Completed in v43.0.0
- Fixed: Undo Paid now correctly deletes ALL cash book entries (payment dialog, mark-paid, advance)
- Root cause: payments were deleted BEFORE their IDs were used to find linked cash entries → 0 matches
- Fixed: payment_status computed dynamically in GET endpoints
- Fixed: Payment History includes advance + mark-paid entries from cash_transactions
- Fixed: Auto-updater filename mismatch (artifactName with hyphens)
- Synced: All fixes to Python, Desktop-app, Local-server backends

## Completed in v42.2.0
- Fixed: Duplicate party name creation ("Kridha (Kesinga) - Kesinga" bug)
- Fixed: Payment Undo button missing from History dialog
- Fixed: Health Check auto-fix detects/merges duplicate party names
- Fixed: GitHub Actions workflow for .exe build
- Added: Orange Undo+History combined icon in main table
- Synced: Mark Paid / Undo Paid logic to desktop-app and local-server

## Pending Issues
None currently active.

## Upcoming Tasks (P1)
- Export Preview feature (Preview data before exporting to Excel/PDF)

## Future Tasks (P2)
- Centralize stock calculation logic
- Refactor payment logic into centralized service layer
- Code cleanup across triple backends (reduce duplication)

## Credentials
- Username: admin, Password: admin123
