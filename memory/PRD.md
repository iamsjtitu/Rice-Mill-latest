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
- Local Party Payment auto jama entry fix
- **v25.1.28**: Fixed `toLocaleString` crash on Cash Book & Ledgers page (null safety across SummaryCards, TransactionsTable, PartySummaryTab, TransactionFormDialog)

## Current Status
- Desktop app version: 25.1.28
- All major bugs resolved
- Frontend synced to desktop app

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic

### P2
- Cross-platform logic sync improvements (Web ↔ Desktop)
- Report generation enhancements

## Key Files
- `desktop-app/routes/cashbook.js` - Cash book backend
- `desktop-app/routes/local_party.js` - Local party logic with auto jama
- `desktop-app/routes/private_trading.js` - Private trading helpers
- `frontend/src/components/CashBook.jsx` - Main cashbook component
- `frontend/src/components/cashbook/SummaryCards.jsx` - Summary cards (fixed)
- `frontend/src/components/cashbook/TransactionsTable.jsx` - Transactions table (fixed)
- `frontend/src/components/cashbook/PartySummaryTab.jsx` - Party summary (fixed)
- `frontend/src/components/cashbook/TransactionFormDialog.jsx` - Transaction form (fixed)

## Credentials
- Username: admin
- Password: admin123
