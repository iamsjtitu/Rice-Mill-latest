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
- **Ledger vs Cash**: Party Summary only counts `account: "ledger"` entries
- **Double-entry accounting**: Every payment creates both Cash Nikasi AND Ledger Nikasi

## What's Been Implemented
- Full Private Trading module with Paddy Purchase, Rice Sale, Party Summary
- Mark Paid / Undo Paid / Payment History for both Paddy and Rice
- RST No, Cash Paid, Diesel Paid fields in Rice Sale
- Party Summary with Paddy/Rice dropdown filter + PDF/Excel export
- Description format: `{party} - {mandi} - {qty} Qntl @ Rs.{rate}`
- CashBook Account filter: removed "All", only Cash/Bank/Ledger, default Ledger
- CashBook Party Summary: ledger-only counting (no double-count)
- CashBook Party Summary: party_type auto-detection from multiple collections
- Keyboard navigation (↑↓ + Enter) in party search dropdown
- Agent payment creates both Cash Nikasi + Ledger Nikasi entries

## Recent Changes (March 2026)
- Description format: "100 @ Rs.300" → "100 Qntl @ Rs.300"
- CashBook Account filter: default "Ledger", removed "All"
- Party Summary: separate Paddy/Rice with dropdown filter
- Party Summary: ledger-only entries fix (Kridha balance fixed)
- Keyboard navigation in party search dropdown
- **Agent Settlement Fix**: Added missing Ledger Nikasi entries for agent payments (both partial and mark-paid flows)

## Backlog
- P2: Refactor duplicate business logic between Python backend and Node.js desktop-app

## Credentials
- Admin: admin / admin123
