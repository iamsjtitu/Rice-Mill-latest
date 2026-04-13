# Rice Mill Management System - PRD

## Current Version: v90.3.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind (React.lazy + Suspense, 17 lazy components)
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + SQLite/JSON
- **Backend (Local)**: Express + SQLite/JSON

## Code Quality Status (v90.3.0)

### Wildcard Imports: ZERO remaining (all 11 route files explicit)
### Empty Catch Blocks: ALL fixed with console.error
### Array Index Keys: ALL critical instances fixed (Payments 5, PurchaseVouchers 2, Ledgers 5, MessagingTab 4, BrandingTab 7, DailyReport 4, SaleBook 3)
### useMemo: Applied to all expensive render computations
### Security: XSS fixed, test creds in env vars, dynamic imports static

### Component Splitting
| File | Original | Final |
|------|----------|-------|
| App.js | 1709 | 1136 |
| Reports.jsx | 1391 | 38 |
| Payments.jsx | 2036 | 1737 |
| cashbook.py | 1754 | 1417 |

### Service Layer: cashbook_service.py (392 lines)
- detect_party_type, backfill_party_type, create_auto_ledger_entry
- process_diesel_auto_entry, process_pvt_paddy_auto_payment
- compute_account_totals, compute_bank_details, compute_opening_balances
- revert_pvt_paddy_payment, revert_rice_sale_payment, revert_linked_payments, revert_hemali_payment

## Prioritized Backlog
### P1: Quality Test Report Register, Monthly Return Auto-generation
### P3: Triple backend code deduplication, get_party_summary extraction

## Permanent Rules
1. Version in utils/constants-version.js + 3x package.json + WhatsNew.jsx
2. Parity: python3 /app/scripts/check-parity.py + bash /app/scripts/sync-js-routes.sh
3. Hindi/Hinglish communication only
4. New tab components → React.lazy() in App.js
5. No wildcard imports, always explicit from models
6. New cashbook logic → services/cashbook_service.py
