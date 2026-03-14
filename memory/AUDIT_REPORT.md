# Desktop vs Web - Comprehensive Feature Audit Report
## Date: 2026-03-14

## Route Parity: 98% (272 web vs 275 desktop)

### Missing in Desktop (8 routes - all non-critical):
| Route | Type | Impact |
|-------|------|--------|
| `GET /` | Root endpoint | None - just welcome message |
| `GET /export/dashboard-pdf` | Dashboard PDF export | Low - can be added later |
| `GET /migrate/fix-missing-ledger-nikasi` | One-time migration | Not needed in desktop |
| `GET /private-payments/fix-old-entries` | One-time migration | Not needed in desktop |
| `POST /cash-book/fix-empty-party-types` | One-time migration | Not needed (cleanup script handles this) |
| `POST /cash-book/migrate-ledger-entries` | One-time migration | Not needed in desktop |
| `POST /entries/fix-cash-ledger` | One-time migration | Not needed in desktop |
| `POST /private-paddy/migrate-cashbook` | One-time migration | Not needed in desktop |

### Extra in Desktop (4 routes):
| Route | Notes |
|-------|-------|
| `GET /api/purchase-vouchers` | Separate from purchase-book (legacy naming) |
| `POST /api/purchase-vouchers` | Separate from purchase-book |
| `PUT /api/purchase-vouchers/:id` | Separate from purchase-book |
| `DELETE /api/purchase-vouchers/:id` | Separate from purchase-book |

## Business Logic Comparison

### Entry CRUD (addEntry/updateEntry/deleteEntry)
- **Status**: SYNCED
- Auto-ledger creation for truck purchase (jama) ✅
- Cash advance nikasi ledger entry ✅
- Diesel account + diesel jama ledger ✅
- Update: delete-all-linked + recreate ✅

### Cash Book (POST/PUT/DELETE)
- **Status**: FIXED & SYNCED
- Case-insensitive party_type auto-detection ✅ (was case-sensitive)
- Retroactive party_type fix for old entries ✅ (was missing)
- Auto-ledger entry (nikasi) on cash/bank transactions ✅
- DELETE: Truck payment revert ✅ (was missing)
- DELETE: Agent payment revert ✅ (was missing)
- DELETE: Auto-ledger cleanup ✅

### Balance Sheet (GET + PDF + Excel)
- **Status**: FIXED & SYNCED
- Agent accounts: total from entries + paid from ledger ✅ (was using wrong field names)
- Truck accounts: total from entries + paid from ledger ✅
- DC accounts ✅
- Sundry debtors/creditors ✅
- Capital, Stock-in-Hand, Cash & Bank ✅
- P&L difference (surplus/deficit) ✅
- PDF export agent logic FIXED ✅ (was still using old broken logic)
- Excel export agent logic FIXED ✅

### Agent Payments (GET + Pay + Mark-paid)
- **Status**: FIXED & SYNCED
- agent_name from entries ($first aggregation) ✅ (was from mandi_targets which is empty)
- Paid amount from ledger transactions ✅
- Payment history ✅

### Cash Book Categories / Agent Suggestions
- **Status**: NEW ENDPOINT ADDED
- `/api/cash-book/agent-names` returns mandi_names, truck_numbers, agent_names ✅
- Frontend includes these in dropdown suggestions ✅

### FY Summary
- **Status**: SYNCED
- Paddy stock, rice stock, byproducts ✅
- Cash & bank, diesel, local party ✅
- Staff advances, private trading, mill parts ✅
- Carry-forward ✅

### Stock Summary
- **Status**: SYNCED
- Paddy, Rice (Usna/Raw), FRK, Byproducts ✅
- Purchase/Sale voucher items included ✅

### Reports (Daily, Party Ledger, Outstanding, CMR vs DC, Season P&L, Agent-Mandi-wise)
- **Status**: SYNCED
- Party Ledger: Agent type added to desktop ✅ (was missing)
- Safety checks for null collections ✅

### Payments (Truck, Agent, Private, MSP, DC)
- **Status**: SYNCED
- All CRUD + pay/mark-paid/undo-paid present ✅

### Startup Cleanup Script
- **Status**: ENHANCED
- Orphaned auto-ledger removal ✅
- Wrong txn_type auto-ledger fix ✅ (NEW)
- Missing party_type retroactive fix ✅ (NEW)

### Error Reporting (Desktop only)
- **Status**: NEW
- Frontend error capture via preload.js ✅
- IPC handlers for error logging ✅
- Help menu: View/Clear Error Log ✅
- ErrorBoundary sends errors to desktop log ✅

## Bugs Fixed During Audit
1. Balance sheet PDF endpoint had OLD broken agent logic (total_paid/total_amount)
2. Balance sheet Excel endpoint had same broken agent logic
3. Desktop reports.js missing Agent party type in Party Ledger
4. Desktop reports.js null safety for entries collection

## Test Results
- iteration_88: 12/12 passed (100%)
- iteration_89: 11/11 backend + all frontend passed (100%)
