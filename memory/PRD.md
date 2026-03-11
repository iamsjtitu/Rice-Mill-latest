# Mill Entry System - PRD

## Original Problem Statement
A comprehensive Mill Entry System for managing rice mill operations including paddy purchases, rice sales, truck payments, party ledgers, cash books, and private trading.

## Core Modules
- **Private Trading**: Paddy Purchase, Rice Sale, Party Summary
- **Payments**: Truck Payments, DC Payments, Agent Commission
- **Ledgers**: Party Ledger (Jama/Nikasi), Cash Book
- **Reports**: Various financial and operational reports
- **Staff Management**: Staff records and payments
- **Milling/CMR**: Milling operations tracking

## Key Technical Concepts
- **Jama (Credit)**: Party owes money (e.g., a sale creates jama)
- **Nikasi (Debit)**: Payment reduces debt (e.g., payment received creates nikasi)
- **Ledger vs Cash**: Party Summary only counts `account: "ledger"` entries. Cash/bank entries are money movement, not party balance.

## What's Been Implemented
- Full Private Trading module with Paddy Purchase, Rice Sale, Party Summary
- Mark Paid / Undo Paid / Payment History for both Paddy and Rice
- RST No, Cash Paid, Diesel Paid fields in Rice Sale
- Party Summary with separate Paddy/Rice sections + dropdown filter (All/Paddy/Rice)
- Party Summary PDF/Excel export respects dropdown filter
- Detailed ledger descriptions: `{party} - {mandi} - {qty} Qntl @ Rs.{rate}`
- CashBook Account filter: removed "All", only Cash/Bank/Ledger, default is Ledger
- CashBook Party Summary: party_type auto-detection (permanent fix)
- CashBook Party Summary: only counts ledger account entries (fixes double-counting bug)

## Recent Changes (March 2026)
- Fixed description format: "100 @ Rs.300" → "100 Qntl @ Rs.300"
- CashBook Account filter: removed "All" option, default "Ledger"
- Party Summary split into separate Paddy/Rice sections with dropdown filter
- **Critical Fix**: Party Summary now only counts `account: "ledger"` entries, fixing double-counting where cash advance entries inflated Jama totals (e.g., Kridha showed Rs.12,000 instead of Rs.10,000)

## Backlog
- P2: Refactor duplicate business logic between Python backend and Node.js desktop-app

## Credentials
- Admin: admin / admin123
