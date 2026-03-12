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

### Features Added
- Sale Vouchers + Purchase Vouchers sections in Daily Report (API + Frontend + PDF)
- Party jama + advance ledger for paddy purchases
- Staff advance creates both cash nikasi + ledger jama

### Key Files Modified
- backend/routes/daily_report.py, cashbook.py, staff.py, private_trading.py, payments.py, milling.py, purchase_vouchers.py, exports.py, reports.py
- frontend/src/components/Reports.jsx, payments/LocalPartyAccount.jsx

## Credentials: admin / admin123
