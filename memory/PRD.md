# Mill Entry System - PRD

## Current Version: v50.0.0

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON
- Local Server: Express + Local JSON
- Triple Backend Parity enforced

## Credentials
- Username: admin, Password: admin123

## v50.0.0 Features
- KMS concept completely removed - only FY (Apr-Mar) remains
- FY logic updated in all components (Oct-Sep → Apr-Mar)
- All PDF/Excel headers, UI labels, error messages show "FY" instead of "KMS"

## v49.0.0 Features  
- Custom Branding Fields (6 fields, L/C/R alignment + Above/Below placement)
- Label is optional for extra fields - value-only fields display without prefix
- Placement option: fields can appear above or below company name
- Opening Stock Balance (9 items)
- Auto Carry Forward (closing -> opening stock)
- Stock Calculator & Payment Service centralized

## Key Technical Notes
- Internal DB field `kms_year` unchanged (backward compatibility)
- Custom fields schema: {label, value, position, placement}
- Placement: "above" = above company name, "below" = below (default)

## Key API Endpoints
- GET/PUT /api/branding, /api/fy-settings, /api/opening-stock
- POST /api/opening-stock/carry-forward
- GET /api/stock-summary, /api/paddy-stock, /api/sale-book/stock-items

## Completed (This Session)
1. KMS → FY replacement across entire codebase (48 files)
2. FY year logic fix (Oct-Sep → Apr-Mar) in all components
3. Extra Fields: Added "Placement" option (above/below company name)
4. Extra Fields: Label made optional - value-only fields now display
5. All changes synced to desktop-app and local-server backends

## Upcoming
- P1: Export Preview feature (Preview data before exporting to Excel/PDF)

## Backlog
- P2: Desktop/Local server code deduplication
- P2: Centralize payment logic into service layer
