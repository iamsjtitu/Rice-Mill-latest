# NAVKAR AGRO - Mill Entry System PRD

## Original Problem Statement
Web application for rice mill financial and inventory management. Focus on data consistency, stock accuracy, reporting, and UI/UX improvements.

## Core Requirements
1. **Data Consistency**: Ledger (cashbook) as single source of truth
2. **Stock Accuracy**: Purchases correctly update stock everywhere
3. **Reporting**: Accurate, A4-printable PDF/Excel reports
4. **UI/UX**: Invoice printing, bulk actions, improved forms

## Architecture
- **Frontend**: React (Vite) + Shadcn/UI + Tailwind
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Desktop**: Electron + Node.js (paused)

## What's Been Implemented (2026-03-12 Session)

### Bug Fixes
- "Move to Paddy Purchase" entries excluded from Truck Payments (Bhada)
- Stock calculation fixed: Pvt Paddy uses QNTL - BAG/100 (not final_qntl)
- agent_extra entries excluded from stock calculation (already counted in CMR)

### Features Added
- **Party Jama Ledger**: Paddy purchase auto-creates jama entry for party (e.g., "Raju - Nayapali") with total_amount
- **Truck Jama Ledger**: Paddy purchase auto-creates jama entry for truck with transport rate
- **Advance Ledger**: Advance paid creates ledger nikasi for party (shows in party ledger)
- **CashBook Auto-Sync**: Nikasi payments auto-update private_paddy.paid_amount/balance/status
- **Delete Revert**: Deleting CashBook nikasi reverts private_paddy.paid_amount
- **Rate-Setting Jama**: Setting truck rate for Pvt Paddy creates/updates truck jama entry

### Key Technical Decisions
- Ledger = Single Source of Truth
- agent_extra excluded from both truck payments and stock calculations
- Party label format: "{party_name} - {mandi_name}"
- Pvt Paddy stock formula: QNTL - BAG/100 (same as CMR: QNTL - BAG/100 - P.PKT_CUT/100)
- References: pvt_party_jama, pvt_truck_jama, pvt_paddy_advl, pvt_paddy_tcash, pvt_paddy_tdiesel

## Known Issues
- **Lokesh Fuels**: Has 2 auto_ledger entries with empty descriptions (Rs.500 and Rs.3000) that seem to be user-created manual entries. Not a code bug - user should delete if they're duplicates.

## Prioritized Backlog
- P1: Desktop App Sync (paused)
- P2: Refactor duplicated PDF/Excel logic
- P2: Break down large frontend components
- P2: Centralize stock calculation logic

## Key Files Modified (2026-03-12)
- `backend/routes/private_trading.py` - Party jama + advance ledger + truck jama creation
- `backend/routes/payments.py` - Truck jama on rate-setting, agent_extra exclusion
- `backend/routes/cashbook.py` - Auto-update private_paddy on nikasi/delete
- `backend/routes/reports.py` - Jama ledger on "Move to Paddy Purchase"
- `backend/routes/milling.py` - Fixed pvt paddy stock formula, excluded agent_extra
- `backend/routes/exports.py` - Fixed pvt paddy stock formula in exports

## Credentials
- Admin: admin / admin123
