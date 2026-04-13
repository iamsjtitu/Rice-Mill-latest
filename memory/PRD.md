# Rice Mill Management System - PRD

## Current Version: v90.8.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + JSON
- **Backend (Local)**: Express + JSON

## By-Product Categories (v90.8.0) - HARDCODED
7 products, fixed across all backends:

| ID | Display Name | Auto-calc? |
|----|-------------|------------|
| bran | Rice Bran | No |
| kunda | Mota Kunda | No |
| broken | Broken Rice | No |
| rejection_rice | Rejection Rice | No |
| pin_broken_rice | Pin Broken Rice | No |
| poll | Poll | No |
| husk | Bhusa | Yes (100% - all others) |

**Removed**: Kanki (merged into Broken Rice)
**Settings By-Products tab**: REMOVED

## Permanent Rules
1. Version in utils/constants-version.js + 3x package.json + WhatsNew.jsx
2. Use logger from utils/logger.js - NEVER use console directly
3. NEVER use sed/bash bulk replace on source code files
4. After ANY backend modification, run `bash /app/scripts/sync-js-routes.sh`
5. By-product list is HARDCODED in 7 products - do NOT make dynamic

## Prioritized Backlog
- P3: Triple backend code deduplication
*(Quality Test Report Register and Monthly Return Auto-generation REMOVED from backlog per user request)*
