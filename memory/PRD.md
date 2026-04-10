# Rice Mill Management System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Triple backend architecture with MongoDB (web) and SQLite/JSON (desktop/local). Requires double-entry accounting, advanced reporting, offline-first desktop, and cross-device sync.

## Current Version: v88.84.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + SQLite
- **Backend (Local)**: Express + SQLite

## What's Been Implemented

### Core Features
- Mill Entry CRUD with full weight/cut/payment tracking
- Cash Book (Jama/Nikasi) with double-entry accounting
- Private Paddy Purchase with party ledgers
- Sale & Purchase Vouchers
- DC Tracker (Delivery Challans)
- Milling Tracker (CMR)
- Staff Management with salary/advance
- Hemali Payment system
- Rice Sales tracking
- Truck Lease management
- Diesel Accounts
- Mill Parts Stock

### Reports
- CMR vs DC comparison
- Season P&L
- Daily Report
- Agent & Mandi reports
- Weight Discrepancy report (with Agent/Mandi dropdowns)

### Features
- Quick Search across all data types (Ctrl+K) - with entry detail dialog on click
- PDF/Excel export with global watermark (tiled pattern, text/image, opacity/font-size/rotation controls)
- FY Summary Dashboard
- Balance Sheet
- Branding/Settings customization
- Auto-update for desktop app
- WhatsApp/Telegram messaging integration
- Camera integration for vehicle weight
- GST Ledger
- Audit Log
- Multi-user with role-based access

### Recent Changes (This Session - Apr 2026)
- Quick Search: Click opens specific entry detail dialog (SearchDetailDialog) instead of full tab
- WeightDiscrepancy: Fixed missing `Input` import and `mandiList.map` error
- PDF Watermark: Tiled repeating pattern across full page, drawn AFTER content
- **Settings.jsx Refactored: 3091 lines → 70 lines + 11 tab files + 1 constants file**

### Settings Component Breakdown
```
frontend/src/components/
├── Settings.jsx (70 lines - thin shell with tab nav)
└── settings/
    ├── settingsConstants.js (shared API, ROLES, PERMISSION_DEFS, etc.)
    ├── UsersTab.jsx (296 lines)
    ├── AuditLogTab.jsx (160 lines)
    ├── BrandingTab.jsx (243 lines)
    ├── WatermarkTab.jsx (233 lines)
    ├── GSTTab.jsx (131 lines)
    ├── StockTab.jsx (108 lines)
    ├── MessagingTab.jsx (657 lines)
    ├── CameraSetupTab.jsx (584 lines)
    ├── WeighbridgeTab.jsx (189 lines)
    ├── DataTab.jsx (375 lines)
    └── ErrorLogTab.jsx (61 lines)
```

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High)
- Export Preview feature (Preview data before exporting to Excel/PDF)

### P2 (Medium)
- Python backend service layer refactoring
- Triple backend code deduplication

### P3 (Low)
- Payment logic centralized service layer

## Key Technical Notes
- Triple Backend: Any change to Python routes MUST be replicated in desktop-app and local-server JS routes
- Desktop paths: Use `os.homedir()` not `Program Files` for dynamic files (EPERM prevention)
- Auth: Session-cookie based, no JWT
- Suggestions APIs return `{suggestions: [...]}` format
- Watermark: Python uses reportlab monkey-patch, JS uses pdfkit drawWatermark on pageAdded event
