# Mill Entry System - PRD

## Original Problem Statement
A comprehensive Mill Entry System for managing rice mill operations including paddy purchases, rice sales, truck payments, party ledgers, cash books, and private trading.

## Core Accounting Rule
**Every payment MUST create TWO entries:**
1. Cash/Bank Nikasi (money going out) 
2. Ledger Nikasi (party's outstanding balance reducing)

## What's Been Implemented
- Full Private Trading module (Paddy Purchase, Rice Sale, Party Summary)
- Mark Paid / Undo Paid / Payment History for Paddy and Rice
- Party Summary with Paddy/Rice dropdown filter + PDF/Excel
- Description format: `{party} - {mandi} - {qty} Qntl @ Rs.{rate}`
- CashBook: Account filter (Cash/Bank/Ledger), default "Ledger"
- CashBook Party Summary: ledger-only counting + auto party_type detection
- Keyboard navigation (↑↓ + Enter) in party search dropdown
- ALL 10 payment flows create double-entry (Cash + Ledger Nikasi)
- Migration endpoint: `/api/migrate/fix-missing-ledger-nikasi`
- **Rice Stock Dashboard**: Shows Produced - Govt Delivered - Pvt Sold = Available
- **Paddy Stock Dashboard**: Shows Total In - Milling Used = Available

## Key APIs
- `GET /api/rice-stock` - Rice stock calculation
- `GET /api/paddy-stock` - Paddy stock calculation
- `GET /api/migrate/fix-missing-ledger-nikasi` - Fix missing ledger entries

## Backlog
- P2: Refactor duplicate business logic between Python backend and Node.js desktop-app

## Credentials
- Admin: admin / admin123
