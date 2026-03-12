# NAVKAR AGRO - Mill Entry System PRD

## Architecture
- Frontend: React (Vite) + Shadcn/UI + Tailwind
- Backend: FastAPI (Python), Database: MongoDB

## Session Changes (2026-03-12)

### Bug Fixes
- Paddy Purchase: Raju paid synced (Rs.3,11,066 full payment)
- CashBook auto-update: "Party - Mandi" split matching for private_paddy
- Staff party_type: Now auto-detects as "Staff" from staff collection
- Staff ledger: Auto-creates ledger jama when staff advance given
- Local Party summary: Shows selected party totals (not ALL parties)
- Daily Report: KG→QNTL, MSP details fixed (DC No/Qntl/Rate instead of empty Agent/Mandi)
- Stock: Pvt Paddy = QNTL - BAG/100, agent_extra excluded everywhere
- Truck jama auto-created for paddy purchases
- **[NEW] Daily Report PDF detail mode: Switched to landscape A4 with proper mm-to-point width conversion for 20-column paddy entries table**
- **[NEW] Local Party report: Cashbook payments now correctly merged without double-counting (uses ref matching, linked_id, and ref_id dedup)**
- **[NEW] Daily Report Excel: Fixed KeyError total_kg → total_qntl, updated headers from KG to Qntl**

### Features Added
- Sale Vouchers + Purchase Vouchers sections in Daily Report (API + Frontend + PDF)
- Party jama + advance ledger for paddy purchases
- Staff advance creates both cash nikasi + ledger jama
- **[NEW] Local Party report shows CashBook source type badge for cashbook payments**

### Key Files Modified
- backend/routes/daily_report.py - Landscape PDF for detail mode, Excel total_kg fix
- backend/routes/cashbook.py - Party detection logic
- backend/routes/staff.py - Ledger creation
- backend/routes/private_trading.py - Party/truck ledger
- backend/routes/payments.py - Filtered truck payments
- backend/routes/milling.py - Paddy stock calculation
- backend/routes/purchase_vouchers.py - Stock integration
- backend/routes/exports.py - Stock fixes
- backend/routes/reports.py - Agent-mandi report
- backend/routes/local_party.py - Cashbook payment linking with dedup
- frontend/src/components/Reports.jsx - Daily report rendering
- frontend/src/components/payments/LocalPartyAccount.jsx - CashBook badge

## Credentials: admin / admin123

## Pending Issues
- Issue 3 (P2): Lokesh Fuels ledger has some empty descriptions (data issue, not code bug)

## Upcoming Tasks
- Desktop App sync (paused - waiting for web app stability confirmation)
- Refactor duplicated PDF/Excel logic across routers
- Break down large frontend components (PurchaseBook, SaleBook)
- Centralize stock calculation logic into single service
