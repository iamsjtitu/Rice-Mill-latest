# Mill Entry System - PRD

## Original Problem Statement
A comprehensive Mill Entry System (NAVKAR AGRO) for rice mill operations - tracking paddy purchases, milling, rice sales, payments, diesel, truck logistics, and complete accounting (Cash Book / Ledger / Party Summary).

## Core Architecture
- **Frontend**: React (Port 3000) - Dark theme mill management dashboard
- **Backend**: Python FastAPI (Port 8001) - `/app/backend/`
- **Desktop**: Node.js Electron app - `/app/desktop-app/`
- **Database**: MongoDB (test_database)

## Key Features Implemented
- Mill Entry CRUD with auto-calculations
- DC Tracker (Government deliveries)
- Private Trading (Paddy Purchase + Rice Sale)
- Cash Book (Cash/Bank/Ledger with double-entry)
- Party Ledger with auto jama/nikasi
- Staff Management
- FRK Purchase & Stock
- By-Product Stock & Sales
- Dashboard with stock widgets (Paddy/Rice)
- Milling Tracker with CMR calculations
- PDF/Excel exports across all modules
- Telegram notifications
- FY Summary & Opening Balance

## Critical Business Logic
- **Jama/Nikasi Accounting**: Every payment creates a corresponding ledger nikasi entry
- **Auto Ledger**: Manual cash/bank entries auto-create linked ledger entries (auto_ledger reference)
- **Party Type Auto-Detect**: Case-insensitive cross-collection lookup with "Cash Party" fallback
- **Retroactive Party Type Fix**: New entries with detected type update old entries for same category
- **Rice Stock**: Produced (milling) - Govt delivered (DC) - Pvt sold = Available
- **Paddy Stock**: Received (mill entries + pvt purchases) - Used (milling) = Available

## Recent Changes (March 2026)
1. Rice Type dropdown: Only "Usna" and "Raw" (removed Boiled/Other)
2. Type-specific stock display: Shows Usna stock or Raw stock based on selection
3. Party Type auto-detect: Case-insensitive, fallback "Cash Party", retroactive update
4. fix-empty-party-types endpoint for historical data repair
5. All 6 payment flows fixed for proper nikasi entries
6. Manual cash transactions auto-create linked ledger entries

## API Endpoints (Key)
- `/api/rice-stock` - Returns type-specific stock (parboiled_available_qntl, raw_available_qntl)
- `/api/paddy-stock` - Paddy stock levels
- `/api/cash-book` - CRUD for cash transactions
- `/api/cash-book/fix-empty-party-types` - Fix historical empty party types
- `/api/cash-book/party-summary` - Tally-style party summary

## Credentials
- Admin: admin / admin123

## Backlog
- P2: Consolidate Python/Node.js backend duplicate business logic
