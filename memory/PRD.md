# Mill Entry System - PRD

## Current Version: v55.41.0

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture.

## Architecture
- **Triple Backend**: Python FastAPI (Web) + Electron Express (Desktop) + Local Express (LAN Server)
- **Frontend**: React with Tailwind CSS + Shadcn/UI
- **Database**: MongoDB (Web) / Local JSON (Desktop & Local)

## Latest Changes (v55.41.0)
- **Server-Side Pagination**: All main list endpoints (entries, cash-book, vehicle-weight) now accept `page` and `page_size` params
- Returns `{entries/transactions, total, page, page_size, total_pages}` format
- `page_size=0` returns all data (for summary/category filtering)
- Frontend `PaginationBar` component: page numbers, First/Prev/Next/Last
- MongoDB indexes on all key fields (kms_year, date, party_name, account, etc.)
- Desktop JSON compact save (40% smaller file)
- All three backends fully synced with pagination
- **Photo View Dialog Redesigned** (Mar 2026): Print-slip-style layout with bordered table, colored weight summary bar (Gross/Tare/Net-green/Cash-orange/Diesel-orange), dynamic branding
- **Default Today's Date** (Mar 2026): Mill Entries, Cash Book, and Vehicle Weight now default to today's date only. Empty state messages in Hindi. Massive load reduction.
- **Vehicle Weight Filters** (Mar 2026): New filter bar (RST No, Date From/To, Vehicle, Party, Mandi). Excel and PDF bulk export buttons added.
- **Triple Backend Parity**: All filter and export changes replicated to desktop-app and local-server JS backends.
- **Auto Weight Entries Subtab** (Mar 2026): New subtab showing last 7 days VW entries, 150/page, filter bar, Excel/PDF export, Status column (Pending/Checkmark).
- **VW Checkmark Logic** (Mar 2026): VW row shows green checkmark instead of delete when Mill Entry exists with same RST.
- **Photo Dialog Fix** (Mar 2026): Photo sections always visible with "No Photo" placeholders.
- **Photo Zoom** (Mar 2026): Click any photo in dialog to open full-screen zoom overlay.
- **Edit+Delete Hide** (Mar 2026): Both Edit and Delete buttons hidden in VW & AWE tabs when entry is linked to Mill Entry.
- **Pkts→Bags Rename** (Mar 2026): All "Pkts/Packets" renamed to "Bags" across tables, exports, print slips, WhatsApp, Telegram.
- **RST Auto-fill Bags** (Mar 2026): RST auto-fill now includes bags (tot_pkts → bag field).
- **Pending VW Badge** (Mar 2026): Red notification badge on Auto Weight Entries tab showing count of pending VW entries.
- **Photo Zoom** (Mar 2026): Click any photo to open full-screen zoom overlay.

## Key API Changes
- `/api/entries?page=1&page_size=200` - Paginated mill entries
- `/api/cash-book?page=1&page_size=200` - Paginated cash transactions
- `/api/vehicle-weight?status=completed&date_from=&date_to=&vehicle_no=&party_name=&farmer_name=&rst_no=` - Filtered vehicle weights
- `/api/vehicle-weight/export/excel` and `/api/vehicle-weight/export/pdf` - Bulk export
- `/api/vehicle-weight/linked-rst?kms_year=` - Get RSTs linked to Mill Entries
- `page_size=0` - Returns all data

## Scalability Status
| Component | Status | Capacity |
|-----------|--------|----------|
| MongoDB Indexes | Done | 50k+ instant queries |
| JSON Compact Save | Done | 40% smaller file |
| Backend Pagination | Done | 200 per page |
| Frontend Pagination | Done | PaginationBar component |
| Cashbook Query Limits | Done | Paginated (was to_list(100000)) |
| SQLite Migration | Future | For 100k+ entries |

## Prioritized Backlog
### P1 - Upcoming
- Export Preview feature

### P2 - Future
- JS backends code deduplication
- Centralize payment/stock logic
- Refactor App.js (~2500 lines)
- SQLite migration for desktop (100k+ entries)
