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
- **Transactional Side-Effects**: Single API calls cascade writes across multiple collections

## What's Been Implemented
- Full Private Trading module with Paddy Purchase, Rice Sale, Party Summary
- Mark Paid / Undo Paid / Payment History for both Paddy and Rice
- RST No, Cash Paid, Diesel Paid fields in Rice Sale
- Party Summary with separate Paddy/Rice sections
- Navigation from Party Summary to detailed ledger
- Detailed ledger descriptions: `{party} - {mandi} - {qty} Qntl @ Rs.{rate}`
- Truck Payments sorted newest first
- All accounting bugs fixed (jama/nikasi logic)

## Recent Changes (March 2026)
- Fixed description format: "100 @ Rs.300" → "100 Qntl @ Rs.300" in both Python and Node.js backends

## Backlog
- P2: Refactor duplicate business logic between Python backend and Node.js desktop-app

## Architecture
- Frontend: React (Vite/CRA)
- Backend: Python FastAPI + Node.js (desktop-app)
- Database: MongoDB
- Desktop: Electron

## Credentials
- Admin: admin / admin123
