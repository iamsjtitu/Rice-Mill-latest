# Mill Entry System - Product Requirements Document

## Original Problem Statement
The user requested a comprehensive Mill Entry System for managing paddy-to-rice conversion (Custom Milled Rice - CMR) for government supply. The system needs to track:
- Paddy entries, milling sessions, DC management, payments, stock registers
- Consolidated financial ledgers for all parties

## User Personas
- **Admin (mill owner):** Full access - entries, payments, settings, targets, exports
- **Staff:** Can create entries (limited edit window), view data, export

## Core Requirements & Implementation Status

### Phase 1: Paddy Entry + Milling Tracker (DONE)
- Paddy custody register with auto-calculations
- Milling sessions: paddy → rice + by-products
- FRK purchase tracking
- By-product sales tracking
- Excel/PDF exports for all

### Phase 2: DC Management (DONE)
- DC (Delivery Challan) numbers with allotted quantity
- Track deliveries against each DC
- DC summary with pending deliveries

### Phase 3: Stock & Payment Tracking (DONE)
- MSP payments from government
- Gunny Bag inventory (paddy bags + government bags)
- Truck payments (bhada) with rate, deductions, mark-paid
- Agent payments based on mandi targets

### Phase 4: Reporting (DONE)
- CMR vs DC comparison report
- Season P&L analysis
- Excel/PDF exports

### Phase 5: Consolidated Ledgers (DONE - 2026-03-07)
- **Outstanding Report:** DC pending deliveries, MSP payment pending, truck summary, agent summary, FRK party summary
- **Party Ledger:** All transactions for any party (Agent, Truck, FRK Seller, Buyer) with debit/credit
- Party type and party name filters
- Excel/PDF exports for both reports
- Integrated as "Ledgers" tab in main navigation
- Keyboard shortcut: Alt+L
- Ported to both Node.js backends (local-server, desktop-app)

### Cash Book Module (DONE)
- Cash and bank transaction tracking
- Custom user-defined categories
- Summary with running balance
- **Filters: Account, Type (Jama/Nikasi), Category, Date range** (added 2026-03-07)
- **Auto-linked with Private Trading payments** (added 2026-03-08)
- Excel/PDF exports

### Phase 6: Private Trading (DONE - 2026-03-08)
- **Private Paddy Purchase:** Same entry form as regular paddy entry (without TP No) + rate/qntl
  - Auto-calculations: qntl, gbw_cut, mill_w, p_pkt_cut, moisture_cut, cutting, final_w, total_amount
  - Partial payment tracking with payment history
  - Party Ledger integration (party_type: pvt_paddy)
- **Rice Sale:** Party, quantity, rate, rice type (Usna/Raw/Boiled), bags, truck
  - Payment received tracking with partial payments
  - Party Ledger integration (party_type: rice_buyer)
- **Private Payments:** Payment recording against paddy purchase and rice sale entries
  - Auto-updates balance on referenced entry
  - Payment reversal on delete

## Architecture
```
/app
├── backend/server.py          # Python/FastAPI (web preview)
├── local-server/server.js     # Node.js/Express (standalone)
├── desktop-app/main.js        # Electron + Express (desktop)
└── frontend/src/
    ├── App.js                 # Main router/layout
    ├── components/
    │   ├── Ledgers.jsx        # Phase 5: Outstanding + Party Ledger
    │   ├── MillingTracker.js  # Phase 1: Milling
    │   ├── CashBook.jsx       # Cash Book
    │   ├── DCTracker.jsx      # DC, MSP, Gunny Bags
    │   └── Reports.jsx        # CMR vs DC, Season P&L
    └── ...
```

## Key API Endpoints
- `/api/private-paddy` (CRUD) - Private paddy purchases
- `/api/rice-sales` (CRUD) - Rice sales
- `/api/private-payments` (CRUD) - Payments for paddy/rice entries
- `/api/reports/outstanding` - Outstanding report
- `/api/reports/party-ledger` - Party ledger with filters
- `/api/reports/outstanding/excel|pdf` - Exports
- `/api/reports/party-ledger/excel|pdf` - Exports
- `/api/dcs`, `/api/dc-deliveries` - DC CRUD
- `/api/msp-payments` - MSP CRUD
- `/api/gunny-bags` - Gunny Bag CRUD
- `/api/cash-transactions`, `/api/cash-categories` - Cash Book
- `/api/entries` - Paddy entries CRUD
- `/api/mandi-targets` - Target management
- `/api/truck-payments`, `/api/agent-payments` - Payments

## Credentials
- Admin: `admin` / `admin123`
- Staff: `staff` / `staff123`

## Prioritized Backlog
- **P2:** macOS desktop build
- **P2:** Code refactoring (split monolithic files into modules)
