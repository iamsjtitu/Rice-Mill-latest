# Mill Entry System - Product Requirements Document

## Original Problem Statement
A comprehensive management tool for a rice mill ("Mill Entry System"). Full-stack app with React frontend, Python/FastAPI backend (web preview), and two Node.js backends (desktop-app + local-server).

## User Language
Hindi (all communication must be in Hindi)

## Core Requirements
- **P0: Full Data & Feature Parity** - All reports, calculations, UI must work identically on web preview and desktop app
- **P0: Correct Ledger Balancing** - All financial transactions must balance correctly
- **P1: UI/UX Consistency** - Modern, user-friendly across all modules
- **P2: Stability & Performance** - Resolve bugs, improve performance

## Architecture
```
/app
├── backend/          (Python/FastAPI - web preview)
├── desktop-app/      (Node.js/Electron - desktop app)
├── local-server/     (Node.js - local server)
└── frontend/         (React - shared UI)
```

## Completed Features
- Telegram Report Integration (send daily reports via Telegram)
- Truck Owner Payments (Mark Paid, Make Payment, History, Undo Paid)
- Agent/Mandi Payments (target-based)
- PDF/Excel exports for all payment types
- CashBook with ledger tracking
- Mill Entries with QNTL calculations
- Milling Tracker
- Staff Management
- Diesel Account
- Local Party Account
- DC Tracker
- FY Summary Dashboard
- Settings page with company branding

## Bug Fixes Applied (March 2026)
- **FIXED: Double Cash Book Entry on Mark Paid** - Removed duplicate ledger jama entry from `pay_truck_owner` and `mark_truck_owner_paid` functions. Now only creates 1 cash nikasi entry.
- **FIXED: Existing duplicate entries cleaned** - Deleted orphan ledger jama entries from DB
- Undo Paid status fix
- QNTL calculation fix in PDF/Excel
- Removed extra Cash Transaction table from Mill Entry reports
- Added RST and TP columns to Mill Entry reports
- Excel total row alignment fix

## New Feature: Agent & Mandi Wise Report (March 2026)
- **Sub-tab** in Reports page: "Agent & Mandi"
- **Search** by Mandi name or Agent name (case-insensitive)
- **Date Range Filter**: From/To date picker for filtering entries by date
- **Grouped view**: Mandi-wise with expand/collapse per group
- **Entry details**: Date, Truck No, RST, TP, Weight(Kg), QNTL, Bags, Gunny Deposit, Gunny Issued, Mill Wt, Final Wt, Cutting, Cash Paid, Diesel Paid
- **Summary cards**: Total Entries, QNTL, Bags, Gunny Deposit, Gunny Issued, Final Weight
- **Totals**: Per-mandi total row + Grand total
- **Export**: Excel and PDF with formatted tables (supports date range)
- **Synced** to all 3 backends (Python, desktop-app, local-server) + frontend build updated

## Bug Fix: Agent Mark Paid Missing Jama Entry (March 2026)
- **Issue**: `mark_agent_paid` was only creating nikasi (cash payment) entry but NOT creating jama (ledger commission) entry. Kesinga's jama was missing while Utkela's was present.
- **Fix**: Added jama (Agent Commission) entry creation in `mark_agent_paid` function for ALL mandis. Also fixed `undo_agent_paid` to delete both jama and nikasi entries.
- **Synced** to all 3 backends (Python, desktop-app, local-server)

## Backend Parity Status (March 2026)
- **Python backend**: All features complete, all bugs fixed
- **Desktop-app (Node.js)**: Truck Owner endpoints + Agent Mandi Report synced
- **Local-server (Node.js)**: Truck Owner endpoints + Agent Mandi Report synced
- **Frontend build**: Copied to desktop-app/frontend-build

## Credentials
- Admin: admin / admin123

## Key DB Collections
- `mill_entries` - Main mill entry records
- `cash_transactions` - All cash/ledger movements
- `truck_payments` - Individual trip payment records
- `truck_owner_payments` - Owner-level payment history
- `agent_payments` - Agent/mandi payment records
- `mandi_targets` - Target configuration for mandis

## Feature: Extra QNTL to Pvt Purchase (March 2026)
- **Auto-calculation**: Target QNTL vs Actual QNTL - extra automatically calculated per mandi
- **Summary card**: "Extra QNTL" shown in red in grand summary
- **Per mandi**: Target, Extra QNTL shown; "Move to Pvt" button appears only when extra > 0
- **Move to Pvt dialog**: Shows Mandi, Agent, Target, Actual, Extra QNTL; user enters rate per QNTL
- **Pvt entry created** with party_name = "AgentName (MandiName)", source = "agent_extra"
- **Duplicate prevention**: Once moved, button shows "Pvt Moved" (disabled)
- **Synced** to all 3 backends

## Bug Fix: Cash Book / Party Ledger Export Filters (March 2026)
- **Cash Book exports** (PDF/Excel) now pass ALL applied filters: account, txn_type, category, party_type, date_from, date_to
- **Cash Transactions tab** automatically adds account=cash to exports
- **Party Summary exports** now pass status filter (pending/settled) + party_type
- **Party Ledger exports** now pass date_from/date_to range + party_type
- **Tab switching** clears category/party_type filters so they don't carry over
- **Agent party type** added to Party Ledger filter dropdown

## Remaining/Future Tasks
- None currently pending - all reported issues resolved
