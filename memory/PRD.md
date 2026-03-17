# Mill Entry System - Product Requirements Document

## Original Problem Statement
Full-stack mill management software with desktop (Electron/Node.js) and web (Python/FastAPI) backends. The "Hemali Payment" feature manages payments for Hemali Sardars (Lead Laborers) with configurable items, payment workflow, advance management, and reporting integration.

## Core Features (All Completed)
1. **Hemali Payment** - Full CRUD with Unpaid → Paid → Undo workflow
2. **Edit Payment** - Edit unpaid payments (items, sardar, date, amount)
3. **Make Payment Dialog** - Partial/full payment amount input
4. **Party Ledger Integration** - Debit on create, payment on mark-paid
5. **Cash Book Integration** - Auto cashbook nikasi entry on mark-paid
6. **Balance Sheet Integration** - Hemali excluded from ledger double-counting
7. **Monthly Summary** - Month filter with MM-YYYY format
8. **Daily/Detail Reports** - Hemali section included
9. **Advance Management** - Auto-fetch, deduction, new advance tracking
10. **PDF Print Receipt** - English format, well-formatted
11. **Date Format** - DD-MM-YYYY standardized globally
12. **Startup Integrity Check** - Reconciles hemali with cashbook, cleans orphans
13. **Cashbook Delete → Auto Undo** - Hemali reverts to unpaid
14. **Desktop-Web Backend Sync** - 100% feature parity (17+ endpoints)
15. **Focus Fix** - IPC-based force-focus for Electron typing issue

## Architecture
- Web Backend: Python/FastAPI (backend/routes/hemali.py)
- Desktop Backend: Node.js/Express (desktop-app/routes/hemali.js)
- Frontend: React (frontend/src/components/HemaliPayment.jsx)
- Database: MongoDB (web) / JSON file (desktop)

## Current Version: 25.1.47

## Data Flow (Hemali Payment)
1. **Create** → hemali_payments (unpaid) + local_party_accounts (debit)
2. **Mark Paid** → cash_transactions (cash nikasi + ledger jama + ledger nikasi) + local_party_accounts (payment)
3. **Undo** → Remove cash_transactions + local_party_accounts payment (keep debit)
4. **Delete** → Remove everything (all cash_transactions + all local_party_accounts)

## Status: COMPLETE ✅
All features implemented, tested, and user verified.
