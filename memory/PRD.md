# Mill Entry System - PRD

## Original Problem Statement
A comprehensive management tool for a rice mill named "Mill Entry System" (NAVKAR AGRO). React frontend + Python/FastAPI backend + Node.js backends (local-server, desktop-app/Electron).

## Core Features
- Mill Entry Management, Dashboard, Payments, Milling (CMR), Cash Book, DC & Payments, Ledgers
- Private Trading, Reports (P&L, CMR vs DC, Daily), Mill Parts, Staff Management
- PDF/Excel Exports, FY Settings, Auth, Branding, Keyboard Shortcuts (17)
- **Auto Cash Book Integration** - All payments auto-create cash book entries

## Auto Cash Book Integration (NEW - 2026-03-08)
Every payment in/out now auto-creates a corresponding cash book entry:

| Payment Source | Cash Book Entry | Type |
|---|---|---|
| Staff Advance | Auto Nikasi | cash |
| Staff Salary Payment | Auto Nikasi | cash (existed) |
| Truck Payment (partial) | Auto Nikasi | cash |
| Truck Mark Paid (full) | Auto Nikasi | cash |
| Agent Payment (partial) | Auto Nikasi | cash |
| Agent Mark Paid (full) | Auto Nikasi | cash |
| MSP Payment Received | Auto Jama | bank |
| Private Trading Payment | Auto entry | cash (existed) |

Undo/Delete operations also clean up the linked cash book entries.

Applied to ALL 3 backends: Python/FastAPI, local-server (Node.js), desktop-app (Electron).

## Previous Bug Fixes
- Desktop-app staff route path mismatches (11 paths)
- FY settings endpoint fixes (method + field names)
- PDF ₹ black box fix (Helvetica font issue)
- Cash Book PDF column widths and text overflow
- PDF auto-open via shell.openPath()
- Shared pdf_helpers.js for reusable PDF functions
- Export.js duplicate variable declarations
- Auth.js missing fy-settings endpoint

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Prioritized Backlog
- No pending tasks. User needs to rebuild Windows desktop app.
