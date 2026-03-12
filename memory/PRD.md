# NAVKAR AGRO - Mill Entry System PRD

## Original Problem Statement
Synchronize a web application with a standalone desktop app. The project's focus pivoted to fixing critical bugs and adding features to the web application's financial and inventory systems.

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

### Completed Features
- Stock calculation fixes (purchases reflect everywhere)
- PDF/Excel export overhaul (colorful, A4, Qntl units, ledger-based balances)
- Individual voucher printing (Sale & Purchase)
- Purchase form redesign (matches Sale form layout)
- Stock Summary exports (PDF/Excel)
- Report label rename ("Move to Paddy Purchase")
- Low Stock Alert removal (per user request)
- Stock items dropdown in Purchase form
- Purchase voucher save bug fix
- **Bug Fix (2026-03-12)**: "Move to Paddy Purchase" entries no longer appear in Truck Payments (Bhada) - filtered out `source: "agent_extra"` entries
- **Feature (2026-03-12)**: "Move to Paddy Purchase" now auto-creates jama ledger entry for the party (e.g. "Balram (Gokul)") so party appears in CashBook and Ledger
- **Feature (2026-03-12)**: CashBook nikasi payments for Pvt Paddy Purchase parties auto-update `private_paddy.paid_amount`, `balance`, and `status`
- **Feature (2026-03-12)**: Deleting a CashBook nikasi for Pvt Paddy Purchase party auto-reverts the `private_paddy.paid_amount`

### Key Technical Decisions
- Ledger is Single Source of Truth
- Purchases must update stock everywhere
- FastAPI route ordering: static routes before dynamic routes
- agent_extra entries in private_paddy excluded from truck payments
- CashBook nikasi/delete auto-syncs with private_paddy paid_amount

## Prioritized Backlog
- P1: Desktop App Sync (paused, pending web app stability confirmation)
- P2: Refactor duplicated PDF/Excel logic into common utility
- P2: Break down large frontend components (PurchaseBook, SaleBook)
- P2: Centralize stock calculation logic
- P3: Deduplicate Python/Node.js backend logic

## Key Files Modified (2026-03-12)
- `backend/routes/payments.py` - Excluded agent_extra from truck payments
- `backend/routes/reports.py` - Auto-create jama ledger on "Move to Paddy Purchase"
- `backend/routes/cashbook.py` - Auto-update private_paddy on nikasi/delete

## Credentials
- Admin: admin / admin123
