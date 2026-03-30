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

## Key API Changes
- `/api/entries?page=1&page_size=200` → Paginated mill entries
- `/api/cash-book?page=1&page_size=200` → Paginated cash transactions
- `/api/vehicle-weight?status=completed&page=1&page_size=200` → Paginated vehicle weights
- `page_size=0` → Returns all data (no pagination)

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
