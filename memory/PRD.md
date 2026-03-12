# NAVKAR AGRO - Mill Entry System PRD

## Original Problem Statement
Web application for rice mill financial and inventory management.

## Architecture
- **Frontend**: React (Vite) + Shadcn/UI + Tailwind
- **Backend**: FastAPI (Python)
- **Database**: MongoDB

## What's Been Implemented (2026-03-12 Session)

### Bug Fixes
- "Move to Paddy Purchase" entries excluded from Truck Payments
- Stock calculation fixed: Pvt Paddy uses QNTL - BAG/100 (not final_qntl)
- agent_extra excluded from stock everywhere (milling.py, exports.py, purchase_vouchers.py/stock-summary)
- CashBook payment auto-update: fixed "Party - Mandi" → party_name + mandi_name matching
- Delete revert: same matching fix applied

### Features Added
- Party Jama Ledger on paddy purchase creation
- Truck Jama Ledger on paddy purchase creation
- Advance Ledger nikasi for party on creation
- CashBook nikasi auto-updates private_paddy.paid_amount
- Rate-setting for Pvt Paddy creates/updates truck jama

### Key Technical Details
- Party label: "{party_name} - {mandi_name}" (split on " - " for DB matching)
- Pvt Paddy stock = QNTL - BAG/100 (agent_extra excluded)
- References: pvt_party_jama, pvt_truck_jama, pvt_paddy_advl, pvt_paddy_adv, pvt_paddy_tcash, pvt_paddy_tdiesel

### Key Files Modified
- backend/routes/private_trading.py - Party jama + advance ledger + truck jama
- backend/routes/cashbook.py - Auto-update with split matching + delete revert
- backend/routes/payments.py - Truck jama on rate-setting, agent_extra exclusion
- backend/routes/milling.py - Fixed pvt paddy stock formula
- backend/routes/exports.py - Fixed pvt paddy stock formula
- backend/routes/purchase_vouchers.py - Fixed stock-summary pvt paddy formula
- backend/routes/reports.py - Jama ledger on "Move to Paddy Purchase"

### Known Issues
- Lokesh Fuels: 2 manual entries with empty descriptions (Rs.500 + Rs.3000) - user data issue, not code bug

## Prioritized Backlog
- P1: Desktop App Sync (paused)
- P2: Refactor PDF/Excel logic, Break large components, Centralize stock calc

## Credentials
- Admin: admin / admin123
