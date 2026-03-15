# Mill Entry System - PRD

## Original Problem Statement
Desktop app (Electron) synced with web app for rice mill data management. Web app is source of truth. Focus is on fixing bugs and ensuring feature parity.

## Architecture
- **Web**: React frontend + FastAPI backend + MongoDB
- **Desktop**: Electron + Express.js + JSON file database
- **Shared**: Frontend code is built and copied to desktop-app/frontend-build/

## What's Been Implemented

### v25.1.28 (2026-03-15)
- Fixed `toLocaleString` crash on Cash Book & Ledgers page
- Null safety across SummaryCards, TransactionsTable, PartySummaryTab, TransactionFormDialog

### v25.1.29 (2026-03-15)
- Fixed missing ledger jama entries for local party debits
- mill_parts.js and local_party.js manual purchase now create/cleanup ledger jama entries

### v25.1.30 (2026-03-15) - COMPREHENSIVE ACCOUNTING FIX
Complete audit and fix of ALL desktop backend route files to match web backend accounting logic:

**Sale Book (salebook.js):**
- Party Ledger JAMA (total sale - party owes us)
- Advance: Ledger NIKASI + Cash JAMA (advance received)
- Cash NIKASI (truck cash payment)
- Diesel: Ledger JAMA (pump) + diesel_accounts entry
- Truck: Ledger NIKASI for cash + diesel deductions
- truck_payments entry
- local_party_accounts (debit + advance payment)
- Full cleanup on DELETE (including bulk delete)
- Full recreation on PUT (update)

**Purchase Vouchers (purchase_vouchers.js):**
- Same pattern as sale book but for purchases
- Fixed BOTH /api/purchase-vouchers AND /api/purchase-book alias routes
- Full cleanup on DELETE (including bulk delete)

**Staff (staff.js):**
- Advance: Added Ledger JAMA (staff owes us) alongside existing Cash NIKASI
- Payment: Fixed reference format for proper cleanup
- DELETE: Cleanup both cash + ledger entries

**Milling (milling.js):**
- Byproduct Sales: Added Ledger JAMA (buyer owes us)
- DELETE: Added cleanup of ledger entry

**Voucher Payments (voucher_payments.js):**
- Sale payment: Cash JAMA + Ledger NIKASI + local_party_accounts
- Purchase payment: Cash NIKASI + Ledger NIKASI + local_party_accounts
- UNDO: Full cleanup of cash + ledger + local_party entries
- Proper voucher balance update

**DC Payments (dc_payments.js):**
- Truck Ledger NIKASI for cash deduction
- Truck Ledger NIKASI for diesel deduction
- Diesel accounts entry + Diesel Pump Ledger JAMA
- Full cleanup on DELETE

## Testing Summary (v25.1.30)
All API endpoints verified via curl:
- Sale Book: 7 entry types created, cleanup on delete ✅
- Purchase Book: 6 entry types created, cleanup on delete ✅
- Staff Advance: Cash NIKASI + Ledger JAMA, cleanup on delete ✅
- Byproduct Sales: Ledger JAMA, cleanup on delete ✅
- Voucher Payments: Cash + Ledger entries ✅
- Local Party Manual + Settle: Full jama/nikasi flow ✅
- Party Ledger display verified ✅

## Current Status
- Desktop app version: 25.1.30
- All accounting entry bugs resolved
- Frontend synced to desktop app

## Prioritized Backlog
### P1
- Refactor duplicated PDF/Excel generation logic
- Centralize stock calculation logic

### P2
- Cross-platform logic sync improvements (Web <-> Desktop)
- Report generation enhancements

## Credentials
- Username: admin
- Password: admin123
