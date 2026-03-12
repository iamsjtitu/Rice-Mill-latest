# NAVKAR AGRO - Mill Entry System PRD

## Architecture
- **Frontend**: React (Vite) + Shadcn/UI + Tailwind
- **Backend**: FastAPI (Python)
- **Database**: MongoDB

## What's Been Implemented (2026-03-12 Session)

### Daily Report Updates
- **KG → QNTL**: Pvt Paddy section now shows QNTL (not KG), with mandi, truck_no, rate
- **Sale Vouchers section added**: Shows voucher_no, party, truck, items, total, advance, balance
- **Purchase Vouchers section added**: Same format as Sale Vouchers
- **MSP Details fixed**: Now shows DC No, Qntl, Rate/Q, Amount, Mode (was showing empty Agent/Mandi)
- **PDF updated**: All new sections included in PDF export (both Normal and Detail modes)

### Stock & Ledger Fixes
- Pvt Paddy stock = QNTL - BAG/100 (agent_extra excluded)
- Party jama ledger auto-created on paddy purchase
- CashBook payment auto-updates private_paddy.paid_amount (split matching "Party - Mandi")
- Truck jama auto-created on paddy purchase

### Key Files Modified
- backend/routes/daily_report.py - New sections, KG→QNTL, MSP fix, PDF updates
- backend/routes/private_trading.py - Party jama + advance ledger + truck jama
- backend/routes/cashbook.py - Auto-update with split matching
- backend/routes/payments.py - Truck jama, agent_extra exclusion
- backend/routes/milling.py - Pvt paddy stock formula fix
- backend/routes/purchase_vouchers.py - Stock summary pvt paddy fix
- backend/routes/exports.py - Pvt paddy stock formula fix
- frontend/src/components/Reports.jsx - New sections, QNTL, MSP details fix

## Prioritized Backlog
- P1: Desktop App Sync (paused)
- P2: Refactor PDF/Excel logic, Break large components, Centralize stock calc

## Credentials
- Admin: admin / admin123
