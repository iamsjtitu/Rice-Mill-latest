# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, WhatsApp/Telegram messaging integration, and automated hardware integration for vehicle weight capture.

## User Personas
- **Mill Owner/Admin**: Full access to all features including settings, financial reports, staff management
- **Mill Operator**: Day-to-day entry management, weighbridge operations, milling tracking

## Core Requirements
1. Mill Entries CRUD with filters (season, agent, mandi, date range)
2. Double-entry accounting (Cash Book, Party Ledgers)
3. Milling/CMR tracking
4. DC (Payments) tracker
5. Voucher management
6. Reports generation (PDF/Excel)
7. WhatsApp & Telegram messaging integration
8. Staff management
9. Hemali payment tracking
10. FY Summary with balance sheet
11. **Vehicle Weight / Weighbridge** - Live scale display, camera feed, weight slip PDF

## Architecture
- **Frontend**: React with Shadcn/UI, Tailwind CSS
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + local JSON storage
- **Local Server**: Express for LAN access
- Triple backend system - logic changes must be replicated across all three

## Current Version: v55.9.0

## What's Been Implemented
- All core CRUD operations for entries, milling, payments, vouchers
- Cash Book with double-entry accounting
- WhatsApp integration (individual + group + scheduled auto-sending)
- Telegram integration (individual + scheduled)
- Global ON/OFF toggles for WhatsApp and Telegram
- PDF/Excel exports for all reports
- Staff management with salary tracking
- Hemali payment system
- FY Summary with balance sheet
- **Vehicle Weight / Weighbridge demo** (v55.9.0):
  - Live digital scale display with weight simulation
  - IP Camera feed panel (placeholder for desktop)
  - Full CRUD: Create entry with first weight, add second weight, calculate net
  - Pending vehicles banner
  - Weight slip PDF generation
  - WhatsApp share for weight slips
- Cash and Diesel columns removed from all export routes (Python + JS backends)
- Excel header wrapText fix for NAVKAR AGRO title

## Prioritized Backlog
### P0 - None currently
### P1 - None currently  
### P2 - Future/Technical Debt
- Code deduplication across Desktop and Local server JS backends
- Centralize payment and stock calculation logic into shared service layer
- Electron Serial Port integration for real weighbridge hardware (when desktop app is ready)
