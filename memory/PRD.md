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
- **Bug Fix**: "Move to Paddy Purchase" entries no longer appear in Truck Payments (Bhada) - filtered out `source: "agent_extra"` entries from private_paddy in truck payment queries (2026-03-12)

### Key Technical Decisions
- Ledger is Single Source of Truth
- Purchases must update stock everywhere
- FastAPI route ordering: static routes before dynamic routes
- agent_extra entries in private_paddy excluded from truck payments

## Prioritized Backlog
- P1: Desktop App Sync (paused, pending web app stability confirmation)
- P2: Refactor duplicated PDF/Excel logic into common utility
- P2: Break down large frontend components (PurchaseBook, SaleBook)
- P2: Centralize stock calculation logic
- P3: Deduplicate Python/Node.js backend logic

## Key Files
- `backend/routes/payments.py` - Truck payments (modified to exclude agent_extra)
- `backend/routes/purchase_vouchers.py` - Purchase vouchers
- `backend/routes/sale_vouchers.py` - Sale vouchers
- `backend/routes/rice_mill.py` - Stock calculations
- `frontend/src/components/Payments.jsx` - Payments UI
- `frontend/src/components/Reports.jsx` - Reports UI

## Credentials
- Admin: admin / admin123
