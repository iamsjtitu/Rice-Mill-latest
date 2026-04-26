# Rice Mill Management System - PRD

## Current Version: v104.28.36

## 🎨 USER UI PREFERENCE — IMPORTANT
**User uses LIGHT/WHITE theme**. All new UI work must:
- Use light backgrounds (white/slate-50/slate-100), NOT dark `bg-slate-800` / `bg-slate-900`
- Use darker text colors (slate-700/slate-800/slate-900) for readability on light bg
- Avoid light-on-light combinations (e.g. green-300 text on green-50 bg = invisible)
- Test contrast: text on tinted backgrounds should be at least slate-700 / slate-800
- Borders: slate-200 / slate-300 instead of slate-700
- Hover: bg-slate-50 / bg-slate-100

## 🚨 CRITICAL: TRIPLE-BACKEND PARITY DISCIPLINE
**ANY change made to API routes, PDF generation, Excel export, or business logic MUST be applied to ALL three backends**:
- `/app/backend/` — Python FastAPI (web preview, MongoDB)
- `/app/desktop-app/` — Node.js Express (Electron desktop app, JSON/SQLite) — **THIS IS WHAT THE USER ACTUALLY USES IN PRODUCTION**
- `/app/local-server/` — Node.js Express (LAN host, JSON/SQLite)

## ⚠️ LESSON: Stay strictly within scope
**v104.28.35**: User asked for "PDF and Summary report mein hi sirf changes" — but I went and changed the on-screen Dashboard endpoint + frontend JSX too. Reverted. ALWAYS confirm scope when user says "sirf X mein" — don't refactor adjacent code paths even if they share the same logic. PDF and screen are TWO different surfaces, treat them independently.

## Recent Fixes (Apr 2026) — v104.28.36

### Truck Owner Consolidated: Compact Icons + Cash/Diesel History + Per-truck WhatsApp PDF
- **User directive**: *"Ye make payment, mark paid print, whatsapp, group sabke icons dalo sirf kyuki page chauda ho gaya h aacha nahi dikh raha hai. History mai click karne pai koi payment history nahi hai dikh raha hai uska history dikhna chahiye kab kitna cash liya diesel liya. WhatsApp pai ya group pai jab hum koi report bhejta hai sirf usi related truck owner ke truck ke report jana chahiye abhi saare truck ka jaaraha hai."*

- **3 changes shipped**:
  1. **Action buttons → icon-only** with tooltips (Make Pay ₹, Mark Paid ✓, Undo, History ⏱, Print 🖨, WhatsApp 📨, Group 👥). Page width restored.
  2. **History modal redesigned** — now shows Cash Advance + Diesel Advance + Payment Paid as colored chronological rows with totals strip on top. Cash = amber, Diesel = blue, Payment = emerald. Each row shows trip reference (RST/DC), amount, date, and `by`.
  3. **WhatsApp/Group PDF filtered** — when sharing from a truck row, only that truck's data goes into the PDF. Frontend appends `truck_no` query param to `/api/export/truck-owner-pdf`. All 3 backends updated to honor the filter.

- **Files changed**:
  - Frontend: `/app/frontend/src/components/Payments.jsx` (HistoryModal redesign, icon-only action row, `truck_no` param in WhatsApp/Group share).
  - Python: `/app/backend/routes/payments.py` (history endpoint pulls cash/diesel from `mill_entries` + `dc_deliveries`, dedupes ledger auto-deductions). `/app/backend/routes/exports.py` (truck_owner_pdf accepts `truck_no` filter).
  - Node.js Desktop App + LAN: `/app/desktop-app/routes/payments.js`, `/app/desktop-app/routes/exports.js`, mirror in `/app/local-server/routes/`.

- **Verified**:
  - `GET /api/truck-owner/MP%2009%20XY%204444/history` → returns 2 rows: cash ₹4,000 + diesel ₹1,800 sorted by date.
  - `GET /api/export/truck-owner-pdf?truck_no=MP%2009%20XY%204444` → PDF contains exactly 1 truck (MP 09 XY 4444).
  - `GET /api/export/truck-owner-pdf` (no filter) → PDF contains all 11 trucks (regression OK).
  - Frontend screenshot: icons row clean, history modal shows colored Cash/Diesel/Payment rows with totals.

## Recent Fixes (Apr 2026) — v104.28.35

### Dashboard & Summary PDFs: Govt Target vs Agent Cutting Clarity
- **User directive**: *"Target hi sirf count karo +5% jo hai wo humko agent extra deta hai cutting govt nahi govt ka jo target hai wahi target hai"* and *"bhai mera bas bolna ye tha pdf and summary report mai hi sirf changes honge ki Govt target - 5000qntl, Agent Cutting - 250 Qntl"*

- **PDF column changes** (Dashboard PDF + Summary Report PDF, both Python + Node.js):
  - Header `Target (Q)` → `Govt Target (Q)` — clarifies this is the actual govt procurement target (e.g., 5000)
  - Header `Expected (Q)` → `Agent Cutting (Q)` — and the value changed from `target + cutting` (e.g., 5250) to JUST the cutting amount (e.g., 250 = 5% of 5000)
  - **Pending = Govt Target − Achieved** (was: Expected − Achieved)
  - **Progress = Achieved / Govt Target × 100** (was: Achieved / Expected × 100)
  - **TOTAL row** Govt Target column shows sum of `target_qntl`, Agent Cutting column shows sum of cutting amounts
  - **KPI hero banner** "TARGETS" stat shows `tot['target']` (was `tot['expected']`)

- **Files changed**:
  - Python: `/app/backend/routes/exports.py` only — Dashboard PDF + Summary Report PDF endpoints
  - Node.js Desktop App: `/app/desktop-app/routes/exports.js` — same endpoints
  - LAN Local Server: `/app/local-server/routes/exports.js` — synced
  - **NOT touched**: `/api/mandi-targets/progress` endpoint (`entries.py`) and Dashboard.jsx — these power the on-screen Mandi Target view, which user wanted unchanged. (Initially modified by mistake, reverted.)

- **Verified**: Curl-tested Python preview — Kesinga shows Govt Target 500.0, Agent Cutting 25.0 (= 5% of 500), Achieved 49.0, Pending 451.0 (= 500−49), Progress 9.8%. ✓

## Recent Fixes (Apr 2026) — v104.28.34

### Per-Mandi Default Bhada Rate (Auto-Fill Truck Payments)
- **User directive**: *"Mandi Target vs Achieved yaha karna mandi target banate waqt hum dal sakte hai"*
- **Frontend** (`/app/frontend/src/components/Dashboard.jsx`):
  - New "Default Bhada Rate (₹/QNTL)" input field in the Mandi Target form (between Cutting Rate and Year). Optional — empty allowed.
  - `targetForm` state, `handleEditTarget`, and POST payload all carry the new field. Empty string → 0.
- **Python** (`/app/backend/models.py`): added `default_bhada_rate: float = 0` to `MandiTarget`, `MandiTargetCreate`, and `MandiTargetUpdate` Pydantic models. Updated `entries.py` POST handler to pass it through to the persisted document (not just rely on dict spread).
- **Backend rate-resolution logic** (Python `payments.py`):
  - New helper `_get_mandi_default_bhada_rate(entry)` — looks up the matching mandi target (kms_year + season scoped) and returns its `default_bhada_rate`. Falls back to any mandi target without FY/season match. Returns 0 if not configured.
  - 4 rate-resolution sites updated (truck-payments list, single-truck-payment GET, agent payment cross-checks, balance summary): if `truck_payments.rate_per_qntl` is unset/0, fall back to the per-mandi default. Stored value untouched — only the UI display gets the auto-filled rate.
- **Node.js** (`/app/desktop-app/main.js`, `/app/desktop-app/sqlite-database.js` + LAN copies):
  - New `_getMandiDefaultBhadaRate(entryId)` helper method on the Database class.
  - `getTruckPayment(entryId)` modified: if stored doc has rate=0 (or doc missing entirely), return the merged object with `rate_per_qntl: <mandi-default>` and a flag `_is_default_rate: true` so UI can optionally style it differently.
  - Spread-based `addMandiTarget` already passes through the new `default_bhada_rate` field automatically (no schema enforcement in Node.js layer).
- **Verified end-to-end**: created mandi target with `default_bhada_rate=18` → created mill entry for that mandi → API `/api/truck-payments` returned `rate_per_qntl: 18.0` for that entry. Triple-Backend Parity: Python verified directly via curl, Node.js verified via syntax check + helper unit test.

## Recent Fixes (Apr 2026) — v104.28.33

### Truck Payment Default Rate: 32 → 0
- **User directive**: *"Rate 32rs by default hai isko 0 karo rate apan dalenge default 0 rhna chahiye"*
- **Files updated** (Python + Node.js for Triple-Backend Parity):
  - Python: `/app/backend/routes/{entries.py, payments.py, exports.py, private_trading.py, fy_summary.py}` — `.get("rate_per_qntl", 32)` → `.get("rate_per_qntl", 0)`, ` else 32` → ` else 0`, `or 32` → `or 0` (within rate context).
  - Desktop App: `/app/desktop-app/{main.js, sqlite-database.js, routes/exports.js, routes/fy_summary.js}` — JS `|| 32` → `?? 0` to respect explicit zero (pre-existing falsy bug).
  - LAN Local Server: same files mirrored.
- **Behavior change**: When a truck entry is added without explicit rate, Bhada (rate_per_qntl) saves as `0` instead of auto-defaulting to 32. User must manually enter rate per truck.
- Note: existing entries with `rate_per_qntl: 32` are NOT migrated — only NEW entries get 0. User can edit old entries to update.

## Recent Fixes (Apr 2026) — v104.28.32

### Excel Auto-Open: 4-Method Robust Cascade (Critical Fix)
- **User complaint**: *"excel download hone baad auto open hona chahiye wo b nahi ho raha"*
- **Diagnosis confirmed by user**: PDF auto-open works, MS Excel installed, only Excel files fail to auto-open. Same `shell.openPath` is called for both — meaning `shell.openPath` succeeds for PDF but silently fails for Excel.
- **Root cause**: On Windows, `shell.openPath` calls `ShellExecute("path")`. For Excel files (.xlsx), this can silently fail due to:
  - Excel's "Ignore other applications that use Dynamic Data Exchange (DDE)" setting being enabled (user-side config)
  - Excel already running and DDE conflict
  - File association registry issue
  PDF readers (Edge/Chrome built-in) don't have these quirks, hence PDF works fine.
- **Fix**: New `openFileWithFallback(targetPath)` helper at module scope of `/app/desktop-app/main.js` — replaces direct `shell.openPath` calls in both download paths:
  1. **Method 1**: `shell.openPath(path)` — fast, default for non-Office files
  2. **Method 2**: `shell.openExternal('file:///path')` — alternate URL-based handler
  3. **Method 3**: OS-specific spawn:
     - Windows: `cmd.exe /c start "" "path"` — most reliable for Office files (uses cmd's `start` which handles DDE fallback better than ShellExecute)
     - macOS: `open path`
     - Linux: `xdg-open path`
  4. **Method 4**: `shell.showItemInFolder(path)` — last resort, opens Downloads folder with file selected for one-click manual open.
- Each method only triggers if previous fails; detailed logging at every step for future debugging.
- Same helper used by IPC `download-and-save` (line 2548) and `will-download` event (line 2266) so both code paths benefit.
- **Cascade verified** with simulated Excel DDE failure: openPath → openExternal → spawn (correct order).

## Recent Fixes (Apr 2026) — v104.28.31

### Global Banner-Centering Fix + Per-Section PDF Bookmarks
- **User complaint (verbatim)**: *"v104.28.23 - ismai tumne bola tha ki jo neeche banner side mai aaraha tha wo ab center mai ayega · but still u are failed - saare pdf check karo · ek chiz bar bar repeat karna pdd raha hai"*

#### Banner Centering — Single-Point Global Fix
- **Root cause**: `drawSummaryBanner(doc, stats, x, y, totalW)` in `/app/desktop-app/routes/pdf_helpers.js` (and local-server copy) accepted caller-provided `x` and `totalW`. 10+ caller files (cashbook.js, entries.js, vehicle_weight.js, salebook.js, truck_lease.js, diesel.js, hemali.js, purchase_vouchers.js, govt_registers.js, etc.) all passed `tableW` (sum of column widths) which is typically 250-450pt vs full page width 545pt. The Hemali fix from v104.28.23 fixed the Hemali table specifically but every OTHER report still had the issue.
- **Fix**: modified `drawSummaryBanner` to **auto-expand** when caller-provided `totalW < doc.page.width - 2*margin`. Helper now overrides `x = margin` and `totalW = full_content_width` automatically. This fixes ALL existing callers in one place — no per-file edits needed, no risk of missing one.
- **Also synced** to `/app/local-server/routes/pdf_helpers.js`.

#### Per-Section PDF Bookmarks (NEW feature)
- Used PDFKit's native `doc.outline.addItem(title)` API which produces standard PDF outline (table of contents). Renders as a side panel in Acrobat / Edge / Chrome / Firefox / SumatraPDF — user clicks an item and PDF jumps to that section.
- **Summary Report** (`/api/export/summary-report-pdf`): 5 bookmarks → "1 · Stock Overview", "2 · Mandi Targets", "3 · Truck Payments", "4 · Agent / Mandi Payments", "5 · Grand Total".
- **Dashboard PDF** (`/api/export/dashboard-pdf`): "Stock Overview" + "Mandi Targets" bookmarks (when respective sections are present).
- **Hemali Monthly Summary** (`/api/hemali/monthly-summary/pdf`): one bookmark per Sardar — "Sardar: Rajesh", "Sardar: Vijay", etc. — long reports can have 10-20 sardars, this navigation is essential.
- All synced from `/app/desktop-app/` to `/app/local-server/` via the Python regex extractor.

#### Verified
- Smoke-tested cashbook PDF: orange header band, navy title band, AND bottom summary banner now all 3 span full page width and visually align.
- pypdf reader confirmed bookmarks rendering correctly: 5 outline items in summary report PDF.

## Recent Fixes (Apr 2026) — v104.28.30

### Agent / Mandi Payments Calculation Fix + Section Gap Fix
- **User complaints (verbatim)**:
  - *"AGENT / MANDI PAYMENTS ye galat hai · ismai jitna tp weight aya hai uske hisab se 10rs ke hisab se add hona chahiye"*
  - *"and cutting and cutting rates humne 0 rakha taha par ismai amount kyu add hua"*
  - *"jo GAP hai usko thik karo dono ke bich mai"*

- **Bug 1: Wrong basis for agent commission (target_qntl instead of TP weight)**
  - **Old formula** (Python + Desktop + LAN): `total_amt = target_qntl × base_rate + (target_qntl × cutting% / 100) × cutting_rate`
  - **New formula**: `total_amt = tp_weight × base_rate + (tp_weight × cutting% / 100) × cutting_rate`
  - Matches the **existing agent_payments page** logic in `entries.js` and `payments.js` (which has always used `tp_weight`).
  - Files: `/app/backend/routes/exports.py` (Python summary + dashboard), `/app/desktop-app/routes/exports.js` (Node summary + dashboard), `/app/local-server/routes/exports.js` (synced).

- **Bug 2: Falsy bug — `cutting_rate = 0` was being defaulted to 5**
  - Old JS: `t.cutting_rate || 5` → JavaScript treats `0` as falsy → returns `5`. So even when user set `cutting_rate = 0`, the report calculated commission at Rs.5/qntl.
  - **Fix (JS)**: changed to `t.cutting_rate ?? 5` (nullish coalescing — only `null`/`undefined` triggers fallback, `0` is respected).
  - **Fix (Python)**: added `_rate(val, fallback)` helper using explicit `is not None` check (Python's `dict.get(k, default)` already respects `0` for present keys, but the helper makes the intent explicit and handles `None`).
  - Same change applied to `base_rate`, `cutting_rate`, AND `cutting_percent` — all 3 now respect explicit `0`.

- **Bug 3: Orphan section banner (large vertical gap)**
  - **Symptom**: previous section's table ended near page bottom → next section's coloured banner rendered on the same page → but its table didn't fit → banner stayed on Page N while table moved to Page N+1, creating a huge empty gap on Page N below the orphaned banner.
  - **Fix (Python)**: imported `CondPageBreak` from `reportlab.platypus` and added `elements.append(CondPageBreak(60*mm))` before each `get_pdf_section_band(...)` call. ReportLab now forces a page break if remaining vertical space < 60mm so banner+table stay together.
  - **Fix (Node.js)**: added `ensureSpace(doc, needed)` helper to `/app/desktop-app/routes/pdf_helpers.js` (and synced to local-server). Helper calls `doc.addPage()` if `doc.y + needed > doc.page.height - margin`. Called before every `drawSectionBand()` invocation with section-specific minimum needed space (130-170pt).

- **Other**: Agent payments table column header changed from "Target" to "TP Weight" for clarity (label now matches the value).

- **Verified**: smoke-tested Desktop App PDF with realistic 5-mandi scenario including Kesinga(cutting_rate=0). Output validated: `Rates: Rs.10/Rs.0`, `Total: Rs.4,750 = 475 × 10` (no cutting commission added), section banners + tables stay together on same page.

## Recent Fixes (Apr 2026) — v104.28.29

### Hemali Monthly Summary PDF + Excel — Desktop App Full Parity
- **User directive**: *"Hemali Monthly Summary PDF ka Sardar Bands + Summary Banner sirf Python backend mein hai. Desktop App ka version structurally simpler hai (basic table). ... ise bhi Desktop App mein port kar dun. - kardo"*
- **Code paths**:
  - `/app/desktop-app/routes/hemali.js` (and synced to `/app/local-server/routes/hemali.js`).
- **PDF redesign**:
  - Branded header (`addPdfHeader` with company name + tagline + subtitle line containing KMS Year, Season, Sardar filter).
  - Per-sardar **orange pill band** (full A4-landscape width = 792pt) with `SARDAR: <Name>` left-aligned + `Current Advance Balance: Rs.<X>` right-aligned (matches Python's `Sardar Band` design).
  - Per-sardar data table using `addPdfTable` with percentage-based column widths (12/14/18.5/18.5/18.5/18.5%) + automatic TOTAL row highlight (amber bg, amber-700 text).
  - **Grand totals across all sardars** computed in single pass.
  - **Bottom KPI Summary Banner** via `drawSummaryBanner` with 7 stats: TOTAL SARDARS, PAYMENTS (paid/total), GROSS WORK, TOTAL PAID, ADV. GIVEN, ADV. DEDUCTED, OUTSTANDING — same as Python backend.
- **Data bug fix**: previously desktop-app counted Work (`m.work`) only when `status === 'paid'`. Python counts work ALWAYS regardless of status. Now matches → correct semantics: "Work" = gross work done (paid + unpaid both), "Outstanding" = Work − Paid − Adv Deducted.
- **Excel redesign** (same logic):
  - Sardar pill row (full-width merged cell, orange bg, white bold text).
  - Header row (navy bg, white bold).
  - Data rows with currency format `"Rs."#,##0.00`.
  - **TOTAL row in amber** (bg `#FEF3C7`, text `#92400E`, bold) per sardar.
  - **Bottom KPI Summary Banner** via `addExcelSummaryBanner` with same 7 stats.
- **Verified**: PDF tested locally with comprehensive sample data (3 sardars × multiple months × paid/unpaid mix) — generated output visually inspected, matches Python exactly.

## Recent Fixes (Apr 2026) — v104.28.28

### CRITICAL: Desktop App + LAN Server Dashboard & Summary PDF Parity Fix
- **User complaint (verbatim)**: *"mai tang aagaya tumse kuch nahi ho paa raha hai · koi b changes desktop software pai nahi aya jo b tumne kiya"*
- **Root cause**: v104.28.27 redesign was applied only to `/app/backend/routes/exports.py` (Python web). The Desktop App uses `/app/desktop-app/routes/exports.js` (PDFKit) — that file's `dashboard-pdf` was the basic version and `summary-report-pdf` was a 3-line stub. So the user saw **no change** in their Desktop App.
- **Fix**:
  - **New helper** `drawSectionBand(doc, title, opts)` added to `/app/desktop-app/routes/pdf_helpers.js` (also synced to `/app/local-server/routes/pdf_helpers.js`). Eight presets matching the Python helper: navy, teal, orange, emerald, rose, purple, amber, slate.
  - **Desktop App `dashboard-pdf`** fully rewritten to mirror Python design: KPI hero banner with 7 colour-coded stats, orange Stock band + teal Targets band with informative subtitles, percentage-based column widths, achievement % auto-coloured (green/gold/red), TOTAL row in amber highlight via `addTotalsRow`.
  - **Desktop App `summary-report-pdf`** rewritten from a 3-line stub into a full 5-section executive report: KPI hero banner with 7 stats including Grand Total, Paid (with %), Balance Due. Five colour-coded section bands (1·Stock orange, 2·Targets teal, 3·Truck purple, 4·Agent rose, 5·Grand Total amber). Status columns Paid/Pending auto-coloured. Grand Total row uses standard amber emphasis helper for safe page-flow.
  - **LAN Local Server** mirrored using a Python `re`-based extractor that copies the new endpoint blocks from desktop-app to local-server (faster + safer than line-by-line search_replace given the size).
- **Verified**: generated PDFs locally via PDFKit-direct test runner (no Electron needed) → visually inspected — all 5 sections + GRAND TOTAL row fit on a single A4 page with the new design.

## Recent Fixes (Apr 2026) — v104.28.27

### Dashboard & Summary Report PDFs — Professional Redesign
- **User directive**: *"dashboard and target mai Pdf and summary report professional and sunder banao"*
- **New reusable helper** in `/app/backend/utils/export_helpers.py`:
  - `get_pdf_section_band(title, subtitle, preset, total_width)` — full-width coloured section title bar with optional right-aligned subtitle. 8 colour presets (`navy`, `teal`, `orange`, `emerald`, `rose`, `purple`, `amber`, `slate`). Each preset includes a 4pt accent stripe on the left edge for visual branding.
  - `SECTION_BAND_PRESETS` dict for future reports.
- **Dashboard PDF** (`/app/backend/routes/exports.py:export_dashboard_pdf`):
  - **KPI hero banner** at top using `get_pdf_summary_banner` with 7 stats (PADDY IN / USED / AVAILABLE / RICE PRODUCED / TARGETS / ACHIEVED / PENDING), each colour-coded.
  - **Section bands**: orange for STOCK OVERVIEW, teal for MANDI TARGETS — both with informative subtitles ("FY 2026-2027 · Kharif", "Overall: 9.3% achieved").
  - **Stock table**: TOTAL PADDY row highlighted in amber, Available column conditionally green/red, Gunny Bags negative shown in BOLD RED.
  - **Targets table**: per-row Progress colour-coded (green ≥100%, gold 50-99%, red <50%) + bold for extreme values.
  - **Layout fix**: leftMargin=8 + rightMargin=8 (with Frame's 6pt padding = 14pt effective) → 580pt content perfectly centered on A4. Column widths use percentages of PAGE_W instead of hardcoded mm so data won't overflow on different content sets.
  - Duplicate tagline removed (header helper already shows it).
- **Summary Report PDF** (`/app/backend/routes/exports.py:export_summary_report_pdf`):
  - **KPI hero banner** with 7 stats including Grand Total, Paid (with paid %), Balance Due — all colour-coded.
  - **Five colour-coded section bands**:
    - 1 · Stock Overview (orange) — subtitle: Available + Rice
    - 2 · Mandi Targets (teal) — subtitle: Overall achievement %
    - 3 · Truck Payments (purple) — subtitle: Balance
    - 4 · Agent / Mandi Payments (rose) — subtitle: Balance
    - 5 · Grand Total (amber) — subtitle: Outstanding amount + %
  - **Status columns** colour-coded: green Paid / red Pending with bold weight.
  - **Grand Total final row**: amber-700 bg + white text + 11pt bold for executive emphasis (replaces the previous less-emphatic styling).
  - Same 14pt-effective margin centering + percentage-based column widths.
  - Same orange "COMPLETE SUMMARY REPORT" banner removed (replaced by sub-header line + KPI banner that does the job better).

## Recent Fixes (Apr 2026) — v104.28.26

### Excel Auto-Open (Same UX as PDF)
- **User directive**: *"Abhi jaise pdf download karte hai apne aap open ho jata hai waisa excel download karne pai b hona chahiye"*
- **Browser path** (`/app/frontend/src/utils/download.js`):
  - Previous behavior: `window.open(blobUrl)` was called for ALL file types after the anchor download. Browsers can render PDFs inline (good) but for `.xlsx` they trigger a SECOND download (the duplicate confused users into thinking auto-open didn't work).
  - Fix: detect file type by content-type / extension. PDFs still get `window.open(blobUrl)` for inline view. Excel/non-PDF files now show a sonner toast `"Excel downloaded · Downloads folder mein hai"` instead of the duplicate window.open. Single download, clear UX.
- **Electron path** (`/app/desktop-app/main.js`):
  - `download-and-save` IPC handler (auto-save to Downloads): improved `shell.openPath` handling — checks the return value (which is empty string on success or an error message string on failure, e.g. "no application is associated"). On failure it falls back to `shell.showItemInFolder(targetPath)` so the user always gets a one-click path to the file.
  - `will-download` event handler (window.open(URL) fallback path used by direct `window.open` calls in components like `GovtRegisters.jsx`, `MandiCustodyRegister.jsx`, etc.): same robustness — checks `shell.openPath` return value, falls back to `showItemInFolder` if no app associated.
- **Net effect**: Desktop App users get genuine auto-open of Excel files (Excel/LibreOffice launches), with a graceful fallback to opening the folder if no app is associated. Browser users get clean single-download behavior with a clear toast hint (no duplicate downloads).

## Recent Fixes (Apr 2026) — v104.28.25

### Backup Encryption (License-Key Derived AES-256-GCM) — NEW
- **User directive**: *"har backup file ko user ke license-key derived AES key se encrypt karein. Iska fayda: agar koi backup file leak ho, plain JSON read nahi kar sakta"*
- **Crypto** (`/app/desktop-app/utils/backup-crypto.js` + `/app/local-server/utils/backup-crypto.js`):
  - **Algorithm**: AES-256-GCM (authenticated encryption — both confidentiality + integrity).
  - **KDF**: scrypt (N=16384, r=8, p=1, 32-byte key) seeded with `"millentry-backup-v1\0" + license_key` (domain separated to avoid key reuse with the license-cache encryption).
  - **Format** (single JSON wrapper, valid for transport):
    ```json
    { "_encrypted": true, "_version": 1, "_algorithm": "aes-256-gcm",
      "_kdf": "scrypt", "_kdf_params": {...}, "_salt": "<b64>",
      "_iv": "<b64>", "_auth_tag": "<b64>", "_ciphertext": "<b64>",
      "_created_at": "<iso>", "_hint": "License key required to decrypt" }
    ```
  - Random 16-byte salt + 12-byte IV per backup (so identical plaintext → different ciphertext).
- **Toggle setting**: `backup_encryption_enabled` (default `false` for backward compat). UI checkbox.
- **License-key getter**: `licenseManager.getLicenseKey()` (NEW) returns activated license key or `null`.
- **createBackup hook** (`/app/desktop-app/main.js`): if setting enabled AND license activated → encrypt before disk write. If license missing → fail-soft to plain backup with console warn (rare, the toggle is gated by license presence in the API).
- **restoreBackup hook**: detects `_encrypted: true` flag in JSON, decrypts using current license key. Wrong key → clear domain message (no raw crypto stack). Tampered ciphertext → GCM auth tag mismatch → same clear error.
- **API endpoints** (`/app/desktop-app/routes/backups.js`):
  - `GET /api/backups/encryption` → `{ enabled, can_enable, license_present, encrypted_count, plain_count }` — counts walk current backups dir + custom dir to classify each file.
  - `PUT /api/backups/encryption { enabled }` → 400 if enabling without active license, otherwise saves setting.
- **Frontend** (`/app/frontend/src/components/settings/DataTab.jsx`):
  - New "Backup Encryption (AES-256-GCM)" card at top of backup section. Visual states: plain (slate) vs encrypted (emerald with "ON" badge + Lock icon).
  - Live counts: "X encrypted · Y plain".
  - Disabled state when `can_enable=false` (license not activated) with explanatory amber alert.
  - Confirmation dialog before enabling, listing the "license key kho jaye toh restore nahi hoga" warning.
- **LAN Local-Server**: stub endpoints return `can_enable: false, reason: "use BitLocker / OS-level encryption"` (LAN host has no real license). `restoreBackup` detects encrypted format and returns clear error.
- **Verified**: 9 unit tests + 5 E2E tests passed (encrypt/decrypt roundtrip, plaintext invisibility, wrong key rejection, tampering detection, large 1 MB payload, deterministic key derivation, plain backup backward compat, settings persistence, gating by license).

## Recent Fixes (Apr 2026) — v104.28.24

### Hemali Monthly Summary PDF — Page-Centered (Margin Fix)
- **User complaint (verbatim)**: *"areh bhai kya chutiyapa hai kitne baar bolu ek hi cheez monthly sumarry ka pdf and excel proffesional banao... niche jo banner aaraha hai wo center mai ana chahiye abhi side mai aaraha hai"*
- **Root cause**: ReportLab's `SimpleDocTemplate` Frame applies a **default 6pt internal padding** on each side. With `leftMargin=20`, the effective content drawing starts at x=26 (20+6), but tables sized 802pt (sum of percentages × PAGE_W) overflowed by 12pt on the right side, leaving asymmetric margins (left=26, right=14) → entire content block visually left-shifted.
- **Fix** (`/app/backend/routes/hemali.py` lines 544 + 1042): changed `leftMargin=20, rightMargin=20` → `leftMargin=14, rightMargin=14`. Now: 14 + 6 (frame padding) = 20pt effective margin both sides → 802pt tables + banner sit at x=20..822 on the 842pt page, perfectly centered.
- **Verification**: pdfplumber + PIL pixel measurements confirmed orange Sardar bands and gold banner stripe both span x=30..1233 (at 1.5x render = 20pt..822pt), with equal 20pt margins from page edges.

### Backup Management UI Polish — DONE
- **User directive (earlier)**: warning when backup folder size > 100MB, scheduled backup time picker (not just "daily"), show total backup size in UI.
- **Frontend** (`/app/frontend/src/components/settings/DataTab.jsx`):
  - Status banner now shows **Total size** with bytes-aware formatting (`KB`/`MB`).
  - **Red 100MB warning banner** (with `AlertTriangle` icon) appears when `total_size_bytes >= 100 MB`, suggests cleanup actions.
  - **"Daily auto-backup at" picker** — 24-hour dropdown (00:00 to 23:00, with AM/PM hint), enable/disable toggle, helper text describing behavior.
- **Backend (Triple Parity)**:
  - Desktop-app (`/app/desktop-app/routes/backups.js`): new `GET/PUT /api/backups/schedule` endpoints + `total_size_bytes`/`total_size_readable` added to `GET /api/backups` response.
  - Desktop-app (`/app/desktop-app/main.js`): hourly auto-backup interval now respects `backup_schedule_hour` + `backup_schedule_enabled` settings — only triggers when `currentHour >= scheduledHour` AND no today backup yet.
  - Local-server (`/app/local-server/routes/backups.js` + `server.js`): same parity — both endpoints + new hourly interval check.
  - Python web backend: no backup endpoints (web version doesn't store local backups), frontend gracefully falls back via `try/catch`.

## Recent Fixes (Apr 2026) — v104.28.23

### PDF Banner Centering + Hemali Summary Redesign + Branding Audit (DONE)

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
*(All previously-listed P2-P4 items removed per user's explicit request on 25-Apr-2026 — E-Way Bill Govt Links, Triple-backend code dedup, Bulk WhatsApp from dashboard, Daily/Weekly admin summary alerts. Cloudflared auto-setup is already implemented.)*

**Currently no active backlog items — awaiting user input for next feature.**

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
