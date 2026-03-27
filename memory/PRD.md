# Mill Entry System - Product Requirements Document

## Original Problem Statement
Rice mill management system - React + FastAPI + Electron/Express desktop app with double-entry accounting.

## Current Version: v45.1.0

## Key Technical Rules
- **Triple Backend**: Python + Desktop JS + Local Server JS — all must stay in sync
- **cashbook_pvt_linked**: Field MUST be stored in DB via update_one AFTER insert (Python fix)
- **auto_ledger**: Every cash/bank entry creates `auto_ledger:{id[:8]}` paired ledger entry
- **Undo Paid cascade**: Must delete: private_payments + linked cash + mark_paid + advance + manual cashbook + auto_ledger pairs
- **artifactName**: NSIS uses hyphens (`Mill-Entry-System-Setup-${version}.${ext}`) — no spaces
- **payment_status**: Computed dynamically in GET endpoints

## Completed in v45.1.0
- Fixed: cashbook_pvt_linked NOT persisted in MongoDB (insert_one before field set)
- Fixed: Payment History now shows manual cash book payments
- Fixed: Undo Paid deletes ALL related entries (cash + ledger + auto_ledger pairs)
- Fixed: const ref duplicate SyntaxError in cashbook.js (desktop route load fail)
- Fixed: Auto-updater filename mismatch (hyphens vs dots)
- Fixed: Duplicate undo arrow buttons
- Fixed: payment_status dynamic computation

## Pending Issues
None.

## Upcoming Tasks (P1)
- Export Preview feature

## Future Tasks (P2)
- Centralize stock calculation logic
- Refactor payment service layer
- Code deduplication across triple backends

## Credentials
- Username: admin, Password: admin123
