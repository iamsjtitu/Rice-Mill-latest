# Mill Entry System - PRD

## Original Problem Statement
Comprehensive rice mill management tool (NAVKAR AGRO). React frontend + Python/FastAPI backend + Node.js backends (local-server, desktop-app/Electron).

## Architecture
- Frontend: React (port 3000)
- Primary Backend: Python/FastAPI (port 8001)
- Local Server: Node.js/Express (port 8080)
- Desktop App: Electron + Node.js/Express

## Core Features
All features, CRUD, exports, and integrations fully implemented across all 3 backends.

## Route Parity Verification (2026-03-08)
- Python: 156 routes
- Local-server: 161 routes (156 + 5 backup-only)
- Desktop-app: 155 routes (156 - 1 root)
- All routes matched. No missing endpoints.

## Missing Endpoints Added (2026-03-08)
1. GET/PUT /cash-book/opening-balance
2. GET /dc-entries/excel, /dc-entries/pdf
3. GET /gunny-bags/excel, /gunny-bags/pdf
4. GET /msp-payments/excel, /msp-payments/pdf
5. GET /staff/advance-balance/:staffId
6. PUT /dc-entries/:id

## Auto Cash Book Integration
All payments auto-create cash book entries (Nikasi/Jama). Undo/delete cleans up linked entries.

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Prioritized Backlog
- No pending tasks
