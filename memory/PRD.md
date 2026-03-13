# NAVKAR AGRO - Mill Entry System PRD

## Architecture
- Frontend: React (CRA) + Shadcn/UI + Tailwind
- Backend: FastAPI (Python), Database: MongoDB
- Desktop: Electron + Express + JSON DB (v25.0.2)
- Credentials: admin / admin123, staff / staff123

## Desktop App v25.0.2 - Complete Sync Audit

### Critical Fixes (v25.0.0 - v25.0.2)
1. **Login 404 Fix**: 3 root causes - missing `safeHandler` export, missing `shared/` directory, `private_trading.js` syntax error
2. **Resilient Route Loading**: Each route module loads independently (individual try/catch)
3. **Cashbook Filter Fix**: Added missing `txn_type`, `category`, `party_type` filters to GET `/api/cash-book`
4. **35+ Missing Endpoints Added**:
   - Purchase Book: Full CRUD (`/api/purchase-book`) + item-suggestions, stock-items, individual PDF, delete-bulk
   - Cash Book: Party Summary (JSON/Excel/PDF), Opening Balances (CRUD), GST Settings
   - Sale Book: stock-items, delete-bulk, individual PDF
   - Stock Summary: JSON/Excel/PDF
   - Private Paddy: mark-paid, undo-paid, history
   - Rice Sales: mark-paid, undo-paid, history
   - Voucher Payments: history, undo
   - Gunny Bags: Purchase Report (JSON/Excel/PDF)
5. **Frontend rebuilt** with empty REACT_APP_BACKEND_URL (relative API calls)
6. **Debug endpoint**: `/api/debug/routes` shows loaded/failed routes

### Endpoint Audit Result
- Web backend: 270 endpoints
- Desktop backend: 270+ endpoints (was 243, now fully synced)
- Missing endpoints: 0 (was 36)

## Workflow (from now on)
- User reports desktop issue → fix in desktop code → auto rebuild frontend → version bump → auto release

## Backlog
- P2: Remove login debug panel after confirmed stable
- P2: Refactor duplicated PDF/Excel logic
- P2: Centralize stock calculation
- P2: App.js breakdown (2700+ lines)
