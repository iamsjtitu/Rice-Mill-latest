# Mill Entry System - PRD

## Original Problem Statement
A comprehensive Mill Entry System for managing rice mill operations including paddy purchases, rice sales, truck payments, party ledgers, cash books, and private trading.

## Core Accounting Rule
**Every payment MUST create TWO entries:**
1. Cash/Bank Nikasi (money going out) 
2. Ledger Nikasi (party's outstanding balance reducing)

Without BOTH entries, Party Summary shows wrong balances.

## Payment Flows (All Fixed)
| Flow | File | Cash Nikasi | Ledger Nikasi |
|------|------|:-----------:|:------------:|
| Truck partial payment | payments.py | ✅ | ✅ |
| Truck mark-paid | payments.py | ✅ | ✅ |
| Truck owner payment | payments.py | ✅ | ✅ |
| Truck owner mark-paid | payments.py | ✅ | ✅ |
| Agent partial payment | payments.py | ✅ | ✅ |
| Agent mark-paid | payments.py | ✅ | ✅ |
| Diesel payment | diesel.py | ✅ | ✅ |
| Local Party payment | local_party.py | ✅ | ✅ |
| Pvt Paddy payment | private_trading.py | ✅ | ✅ |
| Rice Sale payment | private_trading.py | ✅ | ✅ |

## What's Been Implemented
- Full Private Trading module (Paddy Purchase, Rice Sale, Party Summary)
- Mark Paid / Undo Paid / Payment History for Paddy and Rice
- Party Summary with Paddy/Rice dropdown filter + PDF/Excel
- Description format: `{party} - {mandi} - {qty} Qntl @ Rs.{rate}`
- CashBook: removed "All" from Account filter, default "Ledger"
- CashBook Party Summary: ledger-only counting + auto party_type detection
- Keyboard navigation (↑↓ + Enter) in party search dropdown
- ALL payment flows now create double-entry (Cash + Ledger Nikasi)

## Backlog
- P2: Refactor duplicate business logic between Python backend and Node.js desktop-app

## Credentials
- Admin: admin / admin123
