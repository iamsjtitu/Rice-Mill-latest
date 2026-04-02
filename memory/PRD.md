# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage. Requires highly accurate double-entry accounting ledgers, advanced reporting, and offline-first desktop capabilities.

## Core Architecture
- **Web Backend**: Python FastAPI + MongoDB
- **Desktop Backend**: Electron + Express + Local JSON
- **Local Server**: Express + Local JSON (network-accessible)
- **Frontend**: React (shared across all backends)
- **Triple Backend Rule**: Any logic change MUST be replicated in all 3 backends

## Current Version: v74.0.0

## What's Been Implemented

### Core Features (Complete)
- Mill Entry CRUD with auto-calculations (KG→QNTL, GBW cut, P.Pkt cut, Cutting, Moisture cut, Final W)
- Dashboard with targets & analytics
- Milling (CMR) Tracker
- DC Tracker with payments
- Cash Book with double-entry accounting & party ledgers
- Vouchers system
- Payment management with round-off
- Private Paddy Purchase (PaddyPurchase.jsx)
- Paddy Purchase Register
- Reports with Excel/PDF export
- Staff Management
- Mill Parts Stock tracking
- Hemali Payment module
- FY Summary with Balance Sheet
- Vehicle Weight (Weighbridge + IP Camera integration)
- Auto Weight Entries
- Excel Import
- WhatsApp/Telegram messaging integration
- Session heartbeat indicator (Google Drive sync protection)
- Keyboard shortcuts (Ctrl+N, Ctrl+S, Ctrl+F, etc.)
- Theme toggle (dark/light)
- Branding customization
- Backup/Restore system
- Auto-updater for desktop app

### App.js Refactoring (Feb 2026) - COMPLETE
App.js reduced from **2504 → 1429 lines** (43% reduction, 1075 lines extracted)

Extracted components in `/app/frontend/src/components/entries/`:
| Component | Lines | Description |
|-----------|-------|-------------|
| MillEntryForm.jsx | 439 | Entry form dialog with 26 fields + auto-calculations |
| EntryTable.jsx | 269 | Total Summary card (6 metrics) + Mill Entries table (23 columns) |
| TabNavigation.jsx | 56 | 12 main tabs + Settings (admin only) |
| FilterPanel.jsx | 141 | 9 filter inputs + Clear All |
| HeaderDialogs.jsx | 169 | ShortcutsDialog, BackupReminderDialog, PasswordChangeDialog |

Previously extracted utilities in `/app/frontend/src/utils/`:
- `print.js` - Print utility
- `constants.js` - FY_YEARS, SEASONS, initialFormState
- `date.js` - fmtDate (DD-MM-YYYY formatting)

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High)
- "Export Preview" feature (preview data before Excel/PDF export)

### P2 (Medium)
- Centralize payment/stock logic across triple-backend system

### P3 (Low/Future)
- SQLite migration for desktop app (when data exceeds 1 Lakh+ entries)

## Key Technical Notes
- User communicates in Hindi/Hinglish
- User is sensitive to UI layout changes - ensure visual parity during refactoring
- GitHub Actions workflow (.github/workflows/build-desktop.yml) handles .exe builds
- All 3 backends must stay in sync for any logic changes

## Test Reports
- `/app/test_reports/iteration_156.json` - Previous session tests
- `/app/test_reports/iteration_157.json` - Phase 1 refactoring (MillEntryForm + EntryTable)
- `/app/test_reports/iteration_158.json` - Phase 2 refactoring (TabNavigation + FilterPanel + HeaderDialogs)

## Credentials
- Username: admin
- Password: admin123
