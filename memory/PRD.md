# Rice Mill Management System - PRD

## Current Version: v104.7.2

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

## Oil Premium Register (v90.10.0)
- Located under: Register > Sales Register > Rice Bran > Oil Premium (sub-tab)
- Only for Rice Bran (Raw & Boiled types)
- Standard Oil%: Raw = 22%, Boiled/Usna = 25%
- Formula: Premium = Rate x (Actual% - Standard%) x Qty / Standard%
- Positive diff = premium (extra payment), Negative diff = deduction
- Sale lookup by voucher_no or rst_no auto-fills form
- Voucher No field added to all By-Product sale entries

## Recent Changes (Apr 2026)
- **v104.7.2 (Feb 2026 fix)**: DC Entries form Depot Name / Depot Code / Delivery To / No of Lots save fix — teeno backends (Python DCEntry model, Desktop JS, Local Server JS) ye 4 fields drop kar rahe the (Python `extra="ignore"`, JS explicit field whitelist mein missing). Ab sab save & return ho rahe hain. Table ke "Depot" column mein ab `DepotName (DepotCode)` format mein data dikhega.
- v104.7.1: DCStacks Approval Checkbox fix — leftover `setSelectedStack` → `setSelectedStackId` references
- v104.7.0: DC Stacks/Lots system, Govt Links auto-login via Electron IPC, Sales Register reorganization, MSP Payments moved back to Payments tab
- v94.0.0: Professional Weight Report PDF + Branding, WhatsApp PDF via tmpfiles.org, Desktop JS PDF generator with addPdfHeader
- v92.0.0: Major tab reorganization, Gunny Bag upgrade (Bran/Broken P.Pkt, OUT form, realtime stock, Opening Stock), Watermark fix + Print watermark, Milling Register Season removed
- v94.0.1-fix: Vehicle Weight View Dialog fixed (gross_wt, tare_wt, remark, avg/bag now show correctly). LAN Weighbridge polling fixed (local-server proxy to desktop-app via weighbridge_host setting)

## Vehicle Weight - View Dialog (Fixed Apr 2026)
- Photos endpoint (`/vehicle-weight/{id}/photos`) now returns `gross_wt` and `tare_wt` fields
- View Dialog weight summary bar shows: Gross, Tare, Net, Avg/Bag, Cash, Diesel
- Remark shows when present, hidden when empty
- Avg/Bag = net_wt / tot_pkts (per bag average)

## LAN Weighbridge (Fixed Apr 2026)
- Local-server now has `/api/weighbridge/live-weight` proxy endpoint
- Reads `weighbridge_host` setting from app_settings
- Proxies requests to desktop-app's serial port weighbridge API
- Settings UI: `Settings > Weighbridge > Desktop App URL` (for LAN browsers)
- Desktop-app and Python backend also have `/api/settings/weighbridge-host` GET/PUT for parity

## Paddy Custody Register
- "Released (Qtl)" sourced from `paddy_release` collection instead of `milling_entries` (all 3 backends)

## Previous Changes (Feb 2026)
- Dynamic PDF/Excel columns verified in Python backend (hides Cash/Diesel/Advance when all zero)
- Desktop JS + Local Server dynamic export columns parity fix
- Oil Premium Register: new backend (Python + Desktop JS + Local Server) + frontend component
- Oil Premium PDF/Excel export with dynamic columns, party-wise summary, premium/deduction breakdown
- Voucher No field added to ByProductSaleRegister form + table + all backends
- Rice Bran sub-tabs: "Sales Register" | "Oil Premium"
- BP Sale Register now creates auto accounting entries: Party Ledger, Cash Book, Truck Payments, Diesel Accounts, Local Party Accounts (same as SaleBook)
- Oil%, Diff%, Premium columns shown in Rice Bran Sales Register table (linked via voucher_no/rst_no)
- Oil%, Diff%, Premium columns added to BP Sale Register PDF/Excel exports (only for Rice Bran when data exists)
- Oil Premium date-range filter, party filter, bran type filter with ESC close
- PDF/Excel exports optimized for single A4 landscape page (auto-fit columns, compact fonts/padding)

## Permanent Rules
1. Version in utils/constants-version.js + 3x package.json + WhatsNew.jsx
2. Use logger from utils/logger.js - NEVER use console directly
3. NEVER use sed/bash bulk replace on source code files
4. After ANY backend modification, run `bash /app/scripts/sync-js-routes.sh`
5. By-product list is HARDCODED in 7 products - do NOT make dynamic
6. **EVERY fix/feature MUST bump version + add What's New entry** — no exceptions. Use MINOR version (101.1.0, 101.2.0) for fixes, MAJOR (102.0.0) only for big features
7. **USER USES DESKTOP APP ONLY** — All issues reported are for desktop-app (Electron + Express + Local JSON). Always check/fix in `/app/desktop-app/` first. Python backend is secondary.
8. **WHITE THEME** — Desktop app uses white/light theme. All new UI elements (totals, highlights, badges) must use light colors (amber-50, green-700, etc.) NOT dark theme colors (slate-900, green-400, etc.)

## Prioritized Backlog
- P3: Triple backend code deduplication
*(Quality Test Report Register and Monthly Return Auto-generation REMOVED from backlog per user request)*
