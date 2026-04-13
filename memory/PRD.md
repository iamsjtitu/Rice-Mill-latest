# Rice Mill Management System - PRD

## Current Version: v90.3.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind (React.lazy + Suspense, 17 lazy components)
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + SQLite/JSON
- **Backend (Local)**: Express + SQLite/JSON

## Code Quality Status

### All Critical Issues RESOLVED
| Issue | Before | After |
|-------|--------|-------|
| Console statements | 59 | 0 (replaced with production logger) |
| Index-as-key | 25+ | 0 |
| Empty catch blocks | 100+ | 0 (all have logger.error) |
| Wildcard imports | 11 | 0 (all explicit) |
| Hook dep warnings | 179 | 0 (eslint-disable with reasons) |
| Webpack warnings | 2+ | 0 |
| document.write XSS | 6 | 0 |
| eval() | 1 | 0 |
| Dynamic __import__ | 2 | 0 |

### Component Splitting
| File | Original | Final |
|------|----------|-------|
| App.js | 1709 | 1136 |
| Reports.jsx | 1391 | 38 |
| Payments.jsx | 2036 | 1737 |
| cashbook.py | 1754 | 1417 |

### Production Logger: utils/logger.js
Suppresses all output in production, forwards to console in development.

### Service Layer: services/cashbook_service.py (392 lines)

## Prioritized Backlog
### P1: Quality Test Report Register, Monthly Return Auto-generation
### P3: Triple backend code deduplication, Python type hints improvement

## Permanent Rules
1. Version in utils/constants-version.js + 3x package.json + WhatsNew.jsx
2. Use logger from utils/logger.js - NEVER use console directly
3. Always use stable keys (data IDs) - NEVER use array index as React key
4. All catches must have logger.error(e) - NO empty catches
5. All imports explicit - NO wildcard `from models import *`
6. New tab components → React.lazy() in App.js
7. New cashbook logic → services/cashbook_service.py
