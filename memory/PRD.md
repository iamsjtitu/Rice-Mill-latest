# Rice Mill Management System - PRD

## Current Version: v104.27.0

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind
- **Backend (Web)**: Python FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Express + JSON + SQLite + WS weighbridge
- **Backend (Local)**: Express + JSON
- **Central License Server**: Standalone Node.js Express (flat-file JSON DB) → deployed at https://admin.9x.design

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
- **v104.27.0 (Feb 2026)**: Split Billing feature BP Sale Register mein — single-entry form with toggle jo Pakka (GST) + Kaccha (no GST) dono portions handle karta hai ek hi physical dispatch ke liye. Schema additions: `split_billing`, `billed_weight_kg`, `kaccha_weight_kg`, `billed_amount`, `kaccha_amount`. Backend `computeAmountsAndTax()` helper mein calc logic — GST sirf billed portion pe. Stock/GST return/Cashbook/Party ledger sab automatically sync. Regular entries 100% backward compatible.
- **v104.26.x (Feb 2026)**: Cloud Access feature (one-click cloudflared tunnel), License repair UI, activation screen auto-format (9X- prefix + auto-dash), light theme professional polish, platform label humanization (win32 → Windows), GitHub Actions REACT_APP_BACKEND_URL fix for tunnel access, electron-builder files[] fix for license-manager/cloudflared-manager inclusion.
- **v104.25.2 (Feb 2026)**: Central Admin Dashboard mein naya **"Settings"** tab add. WhatsApp (360Messenger) API key ab admin panel se manage hoti hai — `PUT /api/admin/settings` endpoint DB ke andar encrypted-at-rest store karta hai (mask with first-4 + last-4 chars in GET). Notifier.js DB-first lookup karta hai (fallback to .env var for legacy). UI mein: masked key display, country-code input, enabled toggle, "Remove saved key" button, "Send Test Message" form (verifies real 360Messenger POST), aur "Run Expiry Scan Now" button (on-demand trigger). Blank-save protection (accidental key wipe prevent karta hai). database.js automatic migration: older DBs mein `settings` object auto-back-fill hoti hai server boot pe. Deploy to admin.9x.design VPS (PM2) COMPLETE.
- **v104.25.1 (Feb 2026)**: License lifecycle WhatsApp notifications + License Info panel. Central License Server ab revoke / re-activate / create events pe 360Messenger API se customer ko automatic WhatsApp bhejta hai (silent-skip jab API key absent — no errors). Naya `utils/expiry-scheduler.js` har 6 ghante + daily 09:00 pe scan karta hai: 7 din pehle warning + expiry day pe "expired" message, idempotent flags (`notified_7day`, `notified_expired`) ke saath. Naye admin endpoints: `POST /api/admin/licenses/:id/test-notify`, `POST /api/admin/expiry-scan`, `POST /api/admin/licenses/:id/reset-notifications`. License renew karne pe (expires_at future mein push) notified flags auto-reset. **Settings → License tab** Desktop (real data) + Web/LAN (stub "WEB/LAN-DEPLOYMENT") teeno backends mein live — customer license key, mill name, plan, expiry, machine fingerprint, last-verified time dikhta hai, Copy + Verify with server buttons ke saath. Tested 19/19 backend + full frontend PASSED.

- **v104.19.0 (Feb 2026)**: FCI Annexure-1 Verification Report (exact Govt format). New full Annexure-1 UI + `/api/govt-registers/verification-report/full` endpoint + PDF export `/api/govt-registers/verification-report/pdf` (A4). Agency breakdown: OSCSC OWN/Koraput/NAFED/TDCC/Levy (mapped via mill_entries.agent_name + paddy_release.agency ratio). Rice split: RRC/FCI/RRC FRK/FCI FRK. Paddy Release form: new Agency dropdown. Settings extended: electricity_kw, electricity_kv, milling_capacity_mt, variety. Teeno backends parity. Tested 15/15 backend + full frontend PASSED via testing agent.
- **v104.18.1 (Feb 2026)**: DC delivery FCI vs RRC column bug fixed. Milling Register ab dc_entries.delivery_to se classify karta hai (pehle sirf godown_name string check tha). Teeno backends parity.
- **v104.18.0 (Feb 2026)**: Initial simplified Verification Report tab (replaced by v104.19.0 full Annexure-1 format).
- **v104.11.0 (Feb 2026)**: RST Auto-fill + Sale Tick System. (1) Add Delivery form mein "RST Number" field COMMON se hatayi aur har Truck ke andar (highlighted sky card) move kari. Auto-fill trigger: onBlur ya Enter press pe `/api/vehicle-weight/by-rst/{rst}?kms_year=X` fetch. Agar trans_type "Dispatch(Sale)" hai → Vehicle No + Bags (tot_pkts) + Weight (net_wt/100 Qtl) truck mein fill, Cash Paid + Diesel Paid common mein CUMULATIVELY add. Non-sale entries warn karti hain, 404 pe error. Multi-truck scenarios support — har truck ka alag RST. Save pe rst_no slash-joined ("9001 / 9002") store hota hai. (2) Naya endpoint: `/api/vehicle-weight/linked-rst-sale?kms_year=X` — dc_deliveries se sale RSTs return karta hai (slash split handle karta hai). Teeno backends (Python + Desktop JS + Local Server) mein parity. (3) Vehicle Weight page mein action column mein naya **sky CheckCircle tick** add — `linkedRstSale.has(rst_no)` ho toh "DC Delivery done (Sale linked)" tooltip ke saath dikhta hai. Delete button sale-linked entries pe hide ho jaata hai accidental delete prevent karne ke liye.
- v104.10.0: Add Delivery cleanup + Depot Expenses (cash book auto nikasi) + truck-row auto-suggestions
- v104.9.0: Multi-Truck Add Delivery (dynamic trucks, slash-joined vehicle_no)
- v104.7.2: DC Entries Depot save fix (4 fields missing in backends)
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

## Recent Changes (Feb 2026)
- **Global KMS (Kharif Marketing Season) setting** (DONE):
  - **Root cause fixed**: `useFilters.js` had a hard-coded auto-reset that forced `kms_year` back to `CURRENT_FY` on every page load if the saved year was older — wiping out user's KMS selection
  - Removed auto-reset logic → user-selected KMS now **persists** across reloads (saved in `fy-settings` MongoDB collection)
  - Renamed UI label **"FY" → "KMS"** across 13 components
  - Added prominent **Active KMS banner** on Dashboard
  - **Rich toast on KMS switch**: "Switched to KMS 2024-2025 · 📋 145 entries · 🌾 80 Qtl paddy · 🍚 52 Qtl rice" — parallel calls to `/api/entries`, `/api/paddy-stock`, `/api/rice-stock` (5s toast)
  - Backend `/api/fy-settings` unchanged (field `active_fy` stays for backward compat)

- **Verification Report — Save-triggered WhatsApp + History Sub-tab** (DONE):
  - Removed WA icons (Phone/Users) + Print button from VR header — too cluttered
  - "Save as Default" button → renamed "Save & Send to Group" with official WhatsApp SVG icon (teal, sundar)
  - Click = 3 actions atomically: (1) save meter/date advance for next week (2) silent 360Messenger send PDF to default GROUP (3) create history entry
  - New "History" sub-tab under Verification Report (alongside "Report"):
    - Table with Period, Variety, Meter Last/Present/Units, Paddy/Rice week totals, Saved At, WA status, Actions
    - Actions: Load (into Report tab), Re-send (silent 360Messenger), Delete
  - Backend: `GET/POST/DELETE /api/govt-registers/verification-history` — triple parity (Python + Desktop + Local)
  - New MongoDB collection: `verification_history` | JS: `database.data.verification_history[]`
  - Tested via curl: POST → GET → DELETE all return 200 OK with correct data
