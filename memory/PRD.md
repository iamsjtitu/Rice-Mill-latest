# Mill Entry System - PRD

## Original Problem Statement
NAVKAR AGRO Mill Entry System - Comprehensive rice mill management with paddy purchase tracking, milling, cash book, payments, ledgers, private trading, sale book (vouchers), GST settings, staff management.

## Core Architecture
- **Frontend**: React (CRA) + Tailwind CSS + shadcn/ui
- **Backend**: FastAPI (Python) + MongoDB
- **Desktop**: Electron app wrapper
- **Language**: Hindi (UI and user communication)

## Menu Order (Mar 2026)
Entries → Dashboard & Targets → Milling (CMR) → DC (Payments) → Vouchers → Cash Book & Ledgers → Payments → Reports → Mill Parts → Staff → FY Summary → Settings

## Implemented Features

### Dashboard & Targets
- Dropdown filter: All / Stock Only / individual Mandi names
- PDF export with filter (stock, targets, specific mandi)
- Summary Report PDF (complete overview)
- Rice & Paddy stock cards
- Mandi target progress bars with agent payment calculations

### Vouchers Tab (5 sub-tabs)
- Sale Vouchers: Tally-style, GST, ₹ payment, Print Invoice, Local Party sync
- Purchase Vouchers: Custom items, auto accounting, ₹ payment, Local Party sync
- Paddy Purchase: Weight calculations, payment tracking
- Stock Summary: All stocks + Gunny Bags + category filter
- Party Summary: 3 sections (Sale, Purchase, Paddy)

### Gunny Bags (Enhanced)
- Purchase form: Invoice No, Truck No, RST No, Party Name, separate CGST%/SGST%, Advance
- Auto accounting: Party Ledger + Cash Book + Local Party
- Stock Summary integration (Raw Material category)
- Purchase Report: Party-wise with GST breakup (Excel + PDF)

### Accounting Sync
- ₹ Payment button on all vouchers (Sale/Purchase/Gunny)
- Payment auto-creates: Cash Book + Party Ledger + Local Party entries
- Voucher creation auto-creates Local Party entries
- Cross-system sync from any payment source

### Core Modules
- Mill Entries, Milling (CMR), DC Payments, Cash Book & Ledgers
- Payments (Truck, Agent, MSP, Gunny Bags), Reports
- Mill Parts, Staff, FY Summary, Settings, GST

## Key API Endpoints
- `GET /api/export/dashboard-pdf?filter=<all|stock|mandi_name>` - Dashboard PDF with filter
- `POST /api/voucher-payment` - Universal payment for any voucher
- `GET /api/sale-book/invoice/{id}` - Sale invoice HTML
- `GET /api/gunny-bags/purchase-report[/excel|/pdf]` - Purchase report with GST breakup
- All standard CRUD endpoints

## Credentials
- Admin: admin / admin123 | Staff: staff / staff123

## Data Status
- All data cleared for fresh user testing (Mar 2026)
