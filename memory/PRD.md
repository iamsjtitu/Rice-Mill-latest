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
- By-Product Stock & Sales (with auto party ledger)
- Dashboard with stock widgets (Paddy/Rice)
- Milling Tracker with CMR calculations
- PDF/Excel exports across all modules
- Telegram notifications
- FY Summary & Opening Balance
- **NEW: Sale Book** (Tally-style multi-item vouchers with GST)
- **NEW: GST Settings** (CGST/SGST/IGST configurable)
- **NEW: CashBook Party Type Manual Dropdown**

## Recent Changes (March 2026 - Session 2)
1. **Sale Book (New Tab)**: Tally-style sale voucher system
   - Stock overview cards for all items (Rice Usna/Raw, Bran, Kunda, Broken, Kanki, Husk, FRK)
   - Multi-item sale vouchers with Date, Party Name, Truck No, RST No
   - GST support: No GST / CGST+SGST / IGST with configurable percentages
   - Cash & Diesel payment tracking with balance calculation
   - Auto-creates party_ledger entries (jama for total, nikasi for cash received)
   - Auto voucher numbering
2. **GST Settings**: Configurable CGST/SGST/IGST percentages in Settings page
3. **CashBook Party Type Dropdown**: Manual override for auto-detected party_type (10 options)
4. **By-Product Ledger Integration**: By-product sales now auto-create party ledger entries
5. **Party Type "Cash Party" fallback**: Unknown parties get "Cash Party" instead of empty
6. **Rice Type Dropdown**: Only Usna/Raw (removed Boiled/Other)
7. **Type-Specific Stock Display**: Shows Usna stock or Raw stock based on selection

## API Endpoints (Key - New)
- `/api/sale-book` - CRUD for sale vouchers
- `/api/sale-book/stock-items` - Available stock for all items
- `/api/gst-settings` - GET/PUT GST configuration
- `/api/cash-book/fix-empty-party-types` - Fix historical empty party types

## Credentials
- Admin: admin / admin123

## Backlog
- P2: Consolidate Python/Node.js backend duplicate business logic
- P3: Sale Book PDF/Excel export
- P3: Sale Book edit functionality
