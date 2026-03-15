# Mill Entry System - PRD

## Original Problem Statement
Desktop app (Electron) synced with web app for rice mill data management. Web app is source of truth. Focus is on fixing bugs and ensuring feature parity.

## Architecture
- **Web**: React frontend + FastAPI backend + MongoDB
- **Desktop**: Electron + Express.js + JSON file database
- **Shared**: Frontend code is built and copied to desktop-app/frontend-build/

## What's Been Implemented
- Balance Sheet fixes
- Opening Balance "Save Failed" fix
- Detail Report PDF layout fixes (daily_report_logic.js)
- Local Party Payment auto jama entry fix (settle endpoint)
- **v25.1.28**: Fixed `toLocaleString` crash on Cash Book & Ledgers page (null safety across SummaryCards, TransactionsTable, PartySummaryTab, TransactionFormDialog)
- **v25.1.29**: Fixed missing ledger jama entries for local party debits - mill_parts.js POST/PUT/DELETE and local_party.js manual purchase now create/cleanup corresponding ledger jama entries in cash_transactions, matching web backend behavior

## Current Status
- Desktop app version: 25.1.29
- All major bugs resolved
- Frontend synced to desktop app

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic

### P2
- Cross-platform logic sync improvements (Web <-> Desktop)
- Report generation enhancements

## Key Files
- `desktop-app/routes/mill_parts.js` - Mill parts with auto ledger jama (MODIFIED v25.1.29)
- `desktop-app/routes/local_party.js` - Local party with auto jama for manual + settle (MODIFIED v25.1.29)
- `desktop-app/routes/cashbook.js` - Cash book backend
- `desktop-app/routes/private_trading.js` - Private trading helpers
- `frontend/src/components/cashbook/SummaryCards.jsx` - Summary cards (null-safe v25.1.28)
- `frontend/src/components/cashbook/TransactionsTable.jsx` - Transactions table (null-safe v25.1.28)
- `frontend/src/components/cashbook/PartySummaryTab.jsx` - Party summary (null-safe v25.1.28)
- `frontend/src/components/cashbook/TransactionFormDialog.jsx` - Transaction form (null-safe v25.1.28)

## Credentials
- Username: admin
- Password: admin123
