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
```

## Key Technical Rules
- **Triple Backend System**: Any logic change in Python MUST be replicated in both JS route folders
- **Round-off Accounting**: Ledger balance = amount + round_off
- **Party Label Consistency**: Always use `_makePartyLabel(party, mandi)` helper to avoid duplicates
- **Electron Build**: `yarn build` in frontend → sync to desktop-app/frontend-build/

## Current Version: v42.1.0

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

## Completed in v42.1.0 (Current Session)
- Fixed: Duplicate party name creation ("Kridha (Kesinga) - Kesinga" bug)
- Fixed: Payment Undo button missing from History dialog in PrivateTrading.jsx & PaddyPurchase.jsx
- Fixed: Health Check auto-fix now detects and merges duplicate party names
- Added: Orange Undo+History combined icon in main table for entries with payments
- Synced: Mark Paid / Undo Paid logic to desktop-app and local-server

## Pending Issues
None currently active.

## Upcoming Tasks (P1)
- Code cleanup across triple backends (remove duplication)
- Electron packaging for new desktop release (.exe)
- Export Preview feature

## Future Tasks (P2)
- Centralize stock calculation logic
- Refactor payment logic into centralized service layer
- Clean up orphan file PrivateTrading.jsx (not imported anywhere)

## Credentials
- Username: admin, Password: admin123
