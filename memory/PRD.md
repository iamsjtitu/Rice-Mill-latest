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

## Credentials
- Admin: admin / admin123
- Staff: staff / staff123

## Recent Changes

### Stability Fix (2026-02)
- Global crash protection (uncaughtException, unhandledRejection)
- 170 route handlers wrapped with safeAsync/safeSync
- Express error middleware, error logging, atomic DB save, server watchdog

### G.Issued Auto-Deduction (2026-02)
- G.Issued in entries auto-creates gunny bag "out" entry for Old (Market) bags
- Tracks agent_name, mandi_name, truck_no
- Entry update/delete propagates to linked gunny bag
- Removed separate "Govt Issued (g)" card - G.Issued reflected in Old Bags Out

### Entry Form Field Reorder (2026-02)
- P.Pkt and P.Pkt Cut now appear BEFORE Mill W. QNTL

### Error Log in Settings (2026-02)
- Error Log section in Settings page for desktop crash diagnostics

### Gunny Bag Edit Feature (2026-02)
- Added PUT /api/gunny-bags/:id endpoint (all 3 backends)
- Edit button with pre-filled dialog form in Gunny Bags table
- Auto-linked entries (from G.Issued) show "Auto" label and no edit/delete buttons

### Gunny Bags Summary Cleanup (2026-02)
- Removed redundant "G.Issued (Old Bags)" card
- G.Issued already counted in Old Bags Out total
- 5 summary cards: Paddy Bags, P.Pkt, Old Bags, Total (Excl Govt), Govt Bags

## Prioritized Backlog
- P0: All critical features implemented and tested
- Long-term: Refactor desktop-app main.js into modular route files
