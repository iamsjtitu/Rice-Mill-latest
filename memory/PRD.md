# Rice Mill Management System - PRD

## Current Version: v104.28.17

## 🎨 USER UI PREFERENCE — IMPORTANT
**User uses LIGHT/WHITE theme**. All new UI work must:
- Use light backgrounds (white/slate-50/slate-100), NOT dark `bg-slate-800` / `bg-slate-900`
- Use darker text colors (slate-700/slate-800/slate-900) for readability on light bg
- Avoid light-on-light combinations (e.g. green-300 text on green-50 bg = invisible)
- Test contrast: text on tinted backgrounds should be at least slate-700 / slate-800
- Borders: slate-200 / slate-300 instead of slate-700
- Hover: bg-slate-50 / bg-slate-100

## Recent Fixes (Apr 2026) — v104.28.17

### Password Recovery System — NEW (Forgot Password)
**User concern**: "license key dalke koi b reset kar lega" — license key based reset is insecure since any customer's key would work. So we built a per-account recovery system with TWO options:

1. **Recovery Code (one-time, 16 chars)**:
   - Generated via Settings → Users → Account Recovery (admin only, requires current password).
   - Format: `XXXX-XXXX-XXXX-XXXX` (uppercase alphanumeric, ambiguous chars excluded).
   - Stored as SHA256 hash on user record (`recovery_code_hash`). Plaintext shown ONCE.
   - On Forgot Password → Recovery Code tab: enter username + code + new password → password reset + code invalidated.
   - User must regenerate a new code afterwards.

2. **WhatsApp OTP (via existing 360Messenger integration)**:
   - Admin sets `recovery_whatsapp` number in Settings → Users → Account Recovery (requires current password).
   - On Forgot Password → WhatsApp OTP tab: enter username → OTP sent via 360Messenger to registered WhatsApp.
   - 6-digit OTP, 10-min expiry, 5 attempts, 60s rate limit between sends.
   - SHA256 hashed storage on user record (`reset_otp_hash`).

3. **Password Strength Meter** (`/app/frontend/src/components/auth/PasswordStrengthMeter.jsx`):
   - 4-segment visual bar with colors: red (Weak) → amber (Fair) → yellow (Good) → green (Strong).
   - Rule checklist (6+ chars, lowercase, uppercase/number, special char).
   - Embedded in: Password Change Dialog, Forgot Password Modal (both tabs).
   - Backend now enforces minimum 6-character passwords.

**Endpoints (mirrored across all 3 backends)**:
- `POST /api/auth/recovery-code/generate` — admin-only, returns plaintext ONCE.
- `GET /api/auth/recovery-code/status` — boolean + timestamp, no plaintext.
- `PUT /api/auth/recovery-whatsapp` — set/update recovery WhatsApp number.
- `GET /api/auth/recovery-whatsapp` — masked number display.
- `POST /api/auth/forgot-password/send-otp` — sends 6-digit OTP via 360Messenger.
- `POST /api/auth/forgot-password/verify-otp` — validates OTP and resets password.
- `POST /api/auth/forgot-password/recovery-code` — validates code and resets password.

**Files**:
- `/app/backend/routes/auth.py` (Python FastAPI)
- `/app/desktop-app/routes/auth.js` (Express)
- `/app/local-server/routes/auth.js` (Express)
- `/app/frontend/src/components/auth/PasswordStrengthMeter.jsx` (NEW)
- `/app/frontend/src/components/auth/ForgotPasswordDialog.jsx` (NEW)
- `/app/frontend/src/components/settings/AccountRecoveryCard.jsx` (NEW)
- `/app/frontend/src/components/LoginPage.jsx` — Forgot Password link added.
- `/app/frontend/src/components/entries/HeaderDialogs.jsx` — strength meter added to PasswordChangeDialog.
- `/app/frontend/src/components/settings/UsersTab.jsx` — AccountRecoveryCard mounted at top.

**Verified by testing agent (iteration_201)**: 22/23 backend tests + 100% frontend UI tests PASSED.

## Recent Fixes (Apr 2026) — v104.28.16

### CRITICAL Security: Admin Password Reset Bug — FIXED
- **Issue**: Every app/server restart was reverting admin password back to `admin123`.
- **Root cause**: `auth.js` (Electron + local-server) and `auth.py` had a `DEFAULT_USERS` fallback in the login handler that ALWAYS accepted `admin/admin123` IF the admin record was missing from DB. Combined with the in-memory-only seeding in `_loadAll()`, this acted as a permanent backdoor — even after a successful password change, admin/admin123 could log in (if for any reason the DB user was missing on a particular restart, e.g. SQLite→JsonDatabase fallback or Google Drive sync conflict).
- **Fix** (applied across all 3 backends — Python FastAPI + Electron + local-server Express):
  1. **Removed DEFAULT_USERS fallback** in `/auth/login`. The fallback path is replaced with a one-time **DB seeding** step at the start of every login attempt: if `admin`/`staff` is not yet in `db.users`, insert them with the default password. After seeding, the login uses ONLY the DB record. This means once the user changes their password, the old `admin123` is rejected with 401.
  2. **`updateUserPassword` now uses `saveImmediate()`** instead of debounced `save()` (100ms) — so the new password is flushed to disk synchronously before the response is sent. Prevents race-condition data loss if the app is closed quickly.
- **Files**: `/app/backend/routes/auth.py` (login + password change), `/app/desktop-app/routes/auth.js`, `/app/local-server/routes/auth.js`, `/app/desktop-app/sqlite-database.js`, `/app/local-server/sqlite-database.js`, `/app/desktop-app/main.js` JsonDatabase, `/app/local-server/server.js` JsonDatabase.
- **Verified by testing agent (iteration_200)**: 9/9 backend tests + full frontend UI test PASS. Login admin/admin123 → change to mySecret123 → login admin/admin123 returns 401 → login admin/mySecret123 succeeds.

### DataTab White-Theme Redesign — DONE
- **User directive (verbatim)**: *"jo b karna ab se white theme ke hisabs e set karna apne memory mai dalo… backup folder clear nahi dikh raha font ya kuch change karo single single table banao abhi tino backup option ek mai h upper uske baad midle uske baad niche aisa dalo chauda chauda"*
- **Fix** (`/app/frontend/src/components/settings/DataTab.jsx` — full rewrite):
  - All cards now use `bg-white` with 2px slate-200 borders (replaces dark `bg-slate-800` / `border-slate-700`).
  - Three backup tables (Logout / Automatic / Manual) are now **stacked vertically full-width**, NOT a 3-column grid.
  - Each table has a colored section header bar (red / blue / emerald) with bold heading + count badge + "Delete All" button.
  - Proper HTML `<table>` with sticky header (File Name | Date/Time | Size | Actions) + alternating row stripes for clarity.
  - Backup Folder, Auto-Delete, Backup Now, ZIP Download, Restore (ZIP/JSON) — all redesigned with white-theme styling, larger fonts (text-sm/text-base + font-bold for headings), high contrast text.

### Backup "Delete All" double-click bug — FIXED (already in /app/desktop-app/routes/backups.js)
- Iterates BOTH default + custom backup directories in a single pass; no `continue` skipping.

## Recent Fixes (Feb 2026)

### Hemali module overhaul — v104.28.8
1. **Professional Print Receipt Redesign**
   - Dark navy title banner + Receipt No. in amber box + PAID/UNPAID status banner (color-coded green/red)
   - 2×2 Info Grid (Receipt Date / Sardar Name / Items Count / Total Qty)
   - Items table with dark header + alternating row colors
   - 6 color-coded summary tiles: Gross Amount, Adv. Deducted, Net Payable, Amount Paid, New Advance, Balance (shows "SETTLED" if zero)
   - Signature lines + computer-generated footer

2. **Cash Book auto-sync (on CREATE)**
   - On Hemali payment creation → auto-inserts a Ledger "Jama" entry (`hemali_work:<id>`) so the liability "we owe Sardar X" appears immediately in Cash Book > Ledger tab.
   - Startup backfill assigns missing `hemali_work` entries for pre-upgrade payments.
   - Mark-Paid uses upsert to avoid duplication.
   - **UNDO paid** now keeps the work ledger entry (work was still done); only payment entries removed.
   - **DELETE** removes all references (work + payment + debit).

3. **Monthly Summary `Total Work = Rs.0` bug** — FIXED
   - Previously only `status === 'paid'` payments were counted for Total Work → unpaid payments showed Rs.0.
   - Now work is counted regardless of payment status (work done = work counted). Total Paid still uses paid-only.

4. **Hemali Export PDF/Excel showing empty** — FIXED
   - Previously filtered to `status === 'paid'` only.
   - Now includes both paid + unpaid; added `Receipt No.` and `Status` columns for clarity.

**Triple-backend parity:** All fixes implemented in `/app/backend/routes/hemali.py`, `/app/desktop-app/routes/hemali.js`, `/app/local-server/routes/hemali.js`, and shared `/app/*/shared/hemali-service.js`.

### TP Register empty despite entries — v104.28.7 FIXED
- **File:** `/app/frontend/src/components/GovtRegisters.jsx` (`TransitPassRegister` + `buildExportParams`)
- **Root cause:** Global app filter defaults to `date_from = date_to = today` (see `/app/frontend/src/hooks/useFilters.js` line 17). TP Register was blindly forwarding this to backend → backend filtered entries to today only → zero results. Purchase Register didn't suffer this because `/api/entries` skips date filter when any search field (mandi/agent/etc.) is active.
- **Fix:** Removed `date_from`/`date_to` params from TP Register fetch + export calls. TP Register now scopes by KMS year + optional Mandi/Agent (matching its actual UI — no date picker).

### Hemali Receipt No. (HEM-YYYY-NNNN) — NEW
- Sequential receipt number generated on every Hemali payment creation, resets per calendar year (`HEM-2026-0001`, `HEM-2026-0002`, …).
- One-time backfill on startup assigns numbers to existing payments in chronological order.
- Shown prominently (amber, centered, bold) on the printed PDF receipt below the "HEMALI PAYMENT RECEIPT" title.
- Displayed as a column in the Hemali payments table (frontend).
- **Triple-backend parity:** Implemented in `/app/backend/routes/hemali.py` + `/app/backend/server.py` (startup backfill), `/app/desktop-app/routes/hemali.js` + `/app/desktop-app/main.js` (startup backfill), and `/app/local-server/routes/hemali.js`.
- Verified end-to-end: Python + desktop-app both issue sequential receipt_no and render it in the PDF.

### Hemali Print/PDF 500 error — FIXED
- **File:** `/app/desktop-app/routes/hemali.js` line 7 (+ `/app/local-server/routes/hemali.js` parity)
- **Root cause:** `F` helper (font-weight resolver) was used throughout print receipt + monthly-summary PDF code but never imported from `./pdf_helpers` → `ReferenceError: F is not defined` → 500 caught by `safeHandler`
- **Fix:** Added `F` to destructured import
- **Verified end-to-end:** All 5 endpoints returning valid PDF/XLSX.

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

- **Central License Server — Settings Tabs + Auto-Suspension + Cache-Busting** (DONE, Feb 2026):
  - **Settings page → 4 tabs**: WhatsApp, Cloud Tunnels, Server Updates, Account (localStorage persists last tab)
  - **License Suspension** — new status `suspended` alongside active/revoked:
    - Manual: admin clicks "Suspend" → modal with reason textarea + 4 preset chips (Payment pending, Renewal due, Misuse, Terms violation) → WhatsApp sent with reason
    - Auto: settings-configurable — `suspend_on_expiry` (default ON) + `suspend_after_heartbeat_days` (0=off) inside expiry-scheduler scan
    - Restore button (green) for suspended licenses → clears reason + unsuspend WhatsApp
    - New stat card "SUSPENDED" on overview (purple #a855f7)
    - License row shows inline `⚠ reason` tooltip
  - **Auto Cache-Busting** — server.js generates `BUILD_VERSION` on boot (pkg.version + timestamp):
    - Middleware injects `?v=BUILD_VERSION` into app.js/styles.css asset refs
    - HTML served with `Cache-Control: no-cache, no-store, must-revalidate`
    - `/api/version` endpoint for client-side polling
    - Client polls every 30s → if version differs, shows toast "New version available · Reload" → auto-reloads after 8s (skips if modal open or input focused, caps at 60s)
  - New APIs: `POST /api/admin/licenses/:id/suspend`, `POST /api/admin/licenses/:id/unsuspend`, `GET /api/version`
  - Extended `PUT/GET /api/admin/settings` with `suspend_on_expiry` + `suspend_after_heartbeat_days`
  - New notifier helpers: `notifySuspended(lic, reason)`, `notifyUnsuspended(lic)`
  - Deploy tarball: `https://paste.rs/1pFmE` (66 KB, MD5 `11135be596c8d0e1c2737b3964b9793e`)

- **Central License Server — Delete License + Notification Log** (DONE, Feb 2026):
  - **DELETE /api/admin/licenses/:id** — permanently remove license + cascade delete activations. Master license protected (403). Requires body `{confirm_key}` matching license key (400 otherwise). Audit trail (notifications) preserved after delete.
  - **Delete UI**: dark red "Delete" button visible on every non-master license; modal with warning banner, key display (user-select:all for easy copy), input, confirm button disabled until typed key matches exactly.
  - **Notification Log infrastructure**:
    - New `data.notifications[]` table with FIFO cap 5000 + 90-day retention
    - Every `sendMessage()` call auto-logs: `{license_id, license_key, event, phone, status, message_preview, response, error, sent_at}`
    - All 6 notifyXxx helpers + test-whatsapp pass context for logging
  - **New "Notifications" nav tab** (between Licenses and Settings):
    - 4 stat cards: Total / Delivered / Failed / Skipped (color-coded)
    - Filters: search (key/phone/text/error), event dropdown, status dropdown
    - Table with colored event badges (activated/revoked/suspended/unsuspended/expiring/expired/test)
    - Status chips: delivered (green) / failed (red) / skipped (amber)
    - **Retry** button on failed/skipped rows → resend via same notifyXxx
    - **Clear older than 30d** bulk-delete button
  - New APIs: `GET /api/admin/notifications` (filters + totals) · `POST /api/admin/notifications/:id/retry` · `DELETE /api/admin/notifications?older_than_days=N`
  - Deploy tarball: `https://paste.rs/vyUeV` (71 KB, MD5 `9b8236ba444f6ed897a50db98701f71d`)

- **Offline `.mlic` Activation** (DONE, Feb 2026, requires desktop app rebuild):
  - **Cryptography**: Ed25519 keypair auto-generated on central server first boot, stored in `data.settings.mlic_public_key/private_key`. Private key NEVER exposed via API. Deterministic recursive JSON canonicalization for signing.
  - **Central Server**:
    - `GET /api/license/public-key` (unauth) — desktop apps fetch once for offline verify
    - `POST /api/admin/licenses/:id/generate-mlic` — returns signed JSON blob + 48h public download URL
    - `POST /api/admin/licenses/:id/send-mlic-whatsapp` — 360Messenger sends with file URL attached
    - `POST /api/license/activate-mlic` — when customer is online, notifies server of the binding
    - `GET /mlic/:token.mlic` (unauth, 48h TTL, FIFO disk cleanup) — serves the file
    - `POST /api/admin/mlic-keys/rotate` — destructive key rotation
  - **Admin UI**: new orange `.mlic` button on every active license → modal with note input, "Generate & Download" button (auto-downloads JSON file), "Send via WhatsApp" button. Result panel shows filename, public URL (48h), copy+download buttons.
  - **Desktop App (requires rebuild)**:
    - New `mlic-import.js` module with Ed25519 verify + public key resolver (embedded > cached > fetch)
    - `license:import-mlic` IPC handler using `dialog.showOpenDialog`
    - Activation UI: "OR → Import Offline File (.mlic)" button below "Activate License"
    - `license-manager.importMlic(filePath)` — reads, verifies, binds to machine, best-effort pings server
    - `scripts/fetch-public-key.js` embeds public key at build time via GitHub Actions (continue-on-error)
    - Added `mlic-import.js` to electron-builder files whitelist
  - Deploy tarball (central-server only): `https://paste.rs/QshNR` (78 KB, MD5 `2e4d4499005764af9f51ba0bdf8bebcf`)
  - Desktop app changes ship via next "Save to GitHub" → GitHub Actions → Windows installer v104.27.2+

- **v104.28.2 — Offline Tag + React Query Foundation** (DONE, Feb 2026):
  - **Central server — Online/Offline/.mlic tags**: GET /api/admin/licenses now derives `online_status` ('online'/'offline'/'never') from activation `last_seen_at` (10-min live window), plus `via_mlic` boolean. Frontend renders 3 new badges — green "● Online", grey "○ Offline", orange "📥 .mlic". Deploy tarball: `https://paste.rs/xrO3R` (82 KB, MD5 `a4d02f97c84c7572143beebed2363b4a`)
  - **Desktop/frontend — React Query setup**:
    - Installed `@tanstack/react-query` + wrapped app in `QueryClientProvider`
    - Global QueryClient with `staleTime: 0` + `refetchOnMount: 'always'` + `refetchOnWindowFocus: true` (always-fresh discipline)
    - New helper module `/src/lib/queryClient.js` with query key factory (`qk.hemaliPayments.list()`, etc.)
    - New hooks `useApiQuery` + `useApiMutation` in `/src/lib/useApiQuery.js` for future component migrations
    - Axios response interceptor on mutations now ALSO calls `queryClient.invalidateQueries()` → surgical refetch of all react-query hooks (works even for components not yet migrated)
    - 409 conflict handler also invalidates RQ queries
  - **Freshness guarantee (4-layer)**: Server no-store + axios-cache clear + RQ invalidate + Pragma header — verified via build + lint clean
  - Existing 52 components unchanged — they keep getting fresh data via axios-cache; future hot-path migrations opt-in to useApiQuery for window-focus refetch bonus
