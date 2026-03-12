# NAVKAR AGRO - Mill Entry System PRD

## Original Problem Statement
Synchronize a web application with a standalone desktop app. Focus pivoted to fixing critical bugs and adding features to the web application's financial and inventory systems.

## Core Requirements
1. **Data Consistency**: All financial transactions accurately reflected across all modules, Ledger (cashbook) as single source of truth
2. **Stock Accuracy**: Purchases via Purchase Vouchers correctly update stock everywhere
3. **Reporting**: Accurate, well-formatted, A4-printable PDF/Excel reports
4. **UI/UX**: Individual invoice printing, bulk actions, improved form layouts

## Architecture
- **Frontend**: React (Vite) + Shadcn/UI + Tailwind
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Desktop**: Electron + Node.js (paused)

## What's Been Implemented

### Completed Features (Current Session - 2026-03-12)
- **Bug Fix**: "Move to Paddy Purchase" entries filtered out from Truck Payments (Bhada) - `source: "agent_extra"` excluded
- **Feature**: "Move to Paddy Purchase" auto-creates jama ledger entry for party (CashBook integration)
- **Feature**: CashBook nikasi payments for Pvt Paddy Purchase parties auto-update `private_paddy.paid_amount`
- **Feature**: Deleting CashBook nikasi auto-reverts `private_paddy.paid_amount`
- **Feature**: Paddy Purchase entries now auto-create **truck jama (credit) ledger entry** at creation time (using existing truck rate or default 32/qntl)
- **Feature**: Rate-setting for Pvt Paddy trucks now creates/updates jama ledger entry (same as Sale/Purchase vouchers)
- **Verified**: Moisture % auto-calculation IS working - user enters Moisture %, Moisture Cut auto-calculates when moisture > 17%

### Previous Session Completed Features
- Stock calculation fixes, PDF/Excel export overhaul, Individual voucher printing
- Purchase form redesign, Stock Summary exports, Stock items dropdown
- Purchase voucher save bug fix, Report label rename

### Key Technical Decisions
- Ledger is Single Source of Truth
- Purchases must update stock everywhere
- agent_extra entries excluded from truck payments
- Pvt Paddy truck jama reference: `pvt_truck_jama:{entry_id[:8]}`
- CashBook nikasi auto-syncs with private_paddy paid_amount

## Prioritized Backlog
- P1: Desktop App Sync (paused, pending web app stability confirmation)
- P2: Refactor duplicated PDF/Excel logic
- P2: Break down large frontend components
- P2: Centralize stock calculation logic

## Key Files Modified (2026-03-12)
- `backend/routes/payments.py` - Excluded agent_extra from truck payments; added pvt truck jama in rate-setting; added pvt refs to deduction_refs
- `backend/routes/reports.py` - Auto-create jama ledger on "Move to Paddy Purchase"
- `backend/routes/cashbook.py` - Auto-update private_paddy on nikasi/delete
- `backend/routes/private_trading.py` - Auto-create truck jama entry on pvt paddy creation

## Credentials
- Admin: admin / admin123
