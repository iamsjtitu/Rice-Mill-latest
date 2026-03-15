# Mill Entry System - PRD

## Original Problem Statement
Desktop app (Electron) synced with web app for rice mill data management. Web app is source of truth.

## Architecture
- **Web**: React frontend + FastAPI backend + MongoDB
- **Desktop**: Electron + Express.js + JSON file database
- **Shared**: Frontend code built and copied to desktop-app/frontend-build/

## Versions

### v25.1.31 (2026-03-15) - MIGRATION SCRIPT
- Auto-migration on startup for old entries missing jama/nikasi
- Migrates: Sale Vouchers, Purchase Vouchers, Staff Advances, Byproduct Sales, Mill Parts, Local Party Manual
- Idempotent: uses reference-based dedup + `_migrations.accounting_entries_v2` flag
- Runs once on first load, then skips

### v25.1.30 (2026-03-15) - COMPREHENSIVE ACCOUNTING FIX
- 7 route files fixed: salebook, purchase_vouchers, staff, milling, voucher_payments, dc_payments, local_party
- Every transaction type now auto-creates proper jama/nikasi entries

### v25.1.29 (2026-03-15) - LOCAL PARTY JAMA
- mill_parts.js + local_party.js manual purchase → ledger jama entries

### v25.1.28 (2026-03-15) - TOLOCALESTRING FIX
- Null safety across all cashbook frontend components

## Testing Summary
All API endpoints verified via curl. Migration script verified with simulation (idempotent, correct entries).

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic
### P2
- Cross-platform logic sync improvements
- Report generation enhancements

## Credentials
- Username: admin, Password: admin123
