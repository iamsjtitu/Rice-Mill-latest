# Rice Mill Management System - PRD

## Current Version: v104.44.23

## 🎯 v104.44.23 — Global Filename Party/Context Standardization
**Build date:** 2026-02-17

Fixed 8 components that were using hardcoded filenames (no party/date context):
1. `Ledgers.jsx` - Party Ledger export
2. `LetterPadTab.jsx` - Letter PDF/DOCX (uses subject as party)
3. `StockSummary.jsx` - Stock export (category as extra)
4. `PaddyPurchase.jsx` - Paddy Purchase Register (search as party)
5. `AgentMandiReport.jsx` - (search as party)
6. `CMRvsDC.jsx` - (KMS year)
7. `DailyReport.jsx` - (date + mode)
8. `SeasonPnL.jsx` - (KMS year + season)

All now use `buildFilename` helper from `/app/frontend/src/utils/filename-format.js`.

---

## 🎯 v104.44.22 — Single Instance Lock (Desktop App)
**Build date:** 2026-02-17

Electron desktop app ab ek baar me sirf ek instance hi run kar sakta hai:
- `app.requestSingleInstanceLock()` at the top of main.js
- Dusri instance launch → error dialog "Software already opened!" + immediate quit
- Existing window auto-focus + taskbar flash (Windows) on second-instance event

File: `/app/desktop-app/main.js` (~25 lines added before `app.whenReady()`)

---

## 🎯 v104.44.21 — Daily Report Full Coverage Documentation Refresh
**Build date:** 2026-02-17

Documentation-only version bump. Daily Report ab 21 sections cover karta hai (Normal + Detail mode) across Frontend + PDF + Excel. What's New me user-facing summary published.

---

## 🎯 v104.44.20 — Jump-to-Section Nav + Excel/PDF Export Updated
**Build date:** 2026-02-17

- Added sticky "Jump to Section" dropdown at top of Daily Report — scrollIntoView smooth, only non-empty sections listed
- Excel export: added all 7 new sections (Vehicle Weight, Per-Trip Bhada, Truck/Agent/Local Party Payments, Leased Truck, Oil Premium) — triple-backend parity
- PDF export: same 7 sections added with normal/detail mode handling
- Verified on 2026-04-29: Excel shows 4/4 applicable sections correctly, Jump dropdown auto-scrolls to target

---

## 🎯 v104.44.19 — Daily Report P1 Expansion (Leased Truck + Oil Premium)
**Build date:** 2026-02-17

Added 2 more sections to Daily Report (triple-backend parity):
6. `leased_truck` — Today's truck_lease_payments with Truck/Owner/Type/Mode/Amount
7. `oil_premium` — Today's Lab Test (Bran quality) entries with Sauda Amount/Diff%/Premium

Verified via curl on 2026-04-29: oil_premium returns 2 entries (MBOPL ₹-77,195 + Cash Test Agent ₹-76,086 = ₹-1,53,282 total negative premium — savings for mill).

---

## 🎯 v104.44.18 — Daily Report P0 Expansion (Vehicle Weight + Per-Trip Bhada + Party Payments)
**Build date:** 2026-02-17

Added 5 new sections to Daily Report across all 3 backends (Python + Node Desktop + Node LAN) + frontend:
1. `vehicle_weight` — Sale/Purchase trips from vehicle_weights collection with BagType + Bhada
2. `per_trip_bhada` — Today's bhada activity by truck
3. `truck_payments` — Cash txn summary filtered by party_type=Truck
4. `agent_payments` — Cash txn summary filtered by party_type=Agent
5. `local_party_payments` — Cash txn summary filtered by party_type=LocalParty

**Pending (next iterations)**: Leased Truck, Lab Test/Oil Premium, DC Delivery (Govt Rice), Mandi Custody, Govt Registers (8 sub), Weight Discrepancy, Stock changes, Letter Pad.

---

## 🎯 v104.44.17 — Shortcuts Cheat Sheet Updated (Alt+Shift Actions)
**Build date:** 2026-02-17

Added new "Action Shortcuts (Alt+Shift)" section to existing `ShortcutsDialog` in `HeaderDialogs.jsx` — documents the 4 new Alt+Shift+P/E/W/G shortcuts with scope hint. Playwright verified 5/5 content entries.

---

## 🎯 v104.44.16 — Keyboard Shortcuts for Icon Buttons (Alt+Shift+P/E/W/G)
**Build date:** 2026-02-17

### User Request
"Keyboard shortcuts test karo" + "version bump + whatsnew"

### Verification
Tested via Playwright browser automation on Per-Trip Bhada panel:
- ✅ 4/4 tooltips show correct shortcut hints (Alt+Shift+P/E/W/G)
- ✅ All 4 data-testid'd buttons present in DOM
- ✅ `Alt+Shift+W` fired → `handleHeaderWhatsApp` executed → 'Koi trips nahi' toast
- ✅ `Alt+Shift+G` fired → `handleHeaderGroup` executed → 'Koi trips nahi' toast
- ✅ Guard works: input-focused state auto-disables shortcuts

### Changes
- Bumped frontend version: `104.44.15` → `104.44.16` (`constants-version.js`)
- Bumped Node versions: `desktop-app/package.json`, `local-server/package.json`
- Added v104.44.16 entry to `WhatsNew.jsx` changelog (5 items: feature/improvement/fix)

---

## 🎯 v104.44.15 — GLOBAL Icon-only Buttons

## 🎯 v104.44.11 — Excel Filter Row Fix (Triple-Backend)
**Build date:** 2026-04-30

### User Report
"Desktop pe saara Excel me filter upper aaraha hai header me. Global fix karo."

### Root Cause
`detect_excel_header_row()` ki simple heuristic (first row with 4+ non-empty cells) wrongly picked Row 1 (branding: NAVKAR AGRO / GSTIN / PHONE), since every cell in merged branding banners returns the master's value in ExcelJS (Node). In openpyxl (Python) only master had value, but row with colons still matched the old logic.

### Fix
**Python** (`/app/backend/utils/export_helpers.py::detect_excel_header_row`):
- **Pass 1**: Find row with 4+ cells that are BOTH bold AND have solid fill (matches `hdr_font + hdr_fill` pattern across codebase)
- **Pass 2**: Fallback using value-shape rejection (reject colons, long strings, majority-numeric rows)

**Node Desktop + LAN** (`pdf_helpers.js::applyConsolidatedExcelPolish`):
- Same 2-pass logic
- PLUS: Uses **unique values count** (not non-empty count) — since ExcelJS merged cells return master's value to every cell, repeated-value rows (branding) get filtered out

### Verification
- Node harness: 2/2 tests PASSED (styled row 5 + unstyled fallback row 2)
- Python curl: 4/4 endpoints correct (Cash Book→Row 5, Party Summary→Row 7, Outstanding→Row 5, Per-Trip Bhada→Row 5)

---

## 🎯 v104.44.10 — Sale Entries: Source/Mandi → Destination (Semantic Fix)
**Build date:** 2026-04-30

### User Request
"Auto Vehicle Weight Sale me Completed Entries me Source/Mandi ke jagah Destination ana chahiye. Same print and download me bhi. Auto Weight Entries (Last 7 Days) me bhi."

### Implementation
**Logic**: detect via `trans_type` containing 'sale' OR 'dispatch' (case-insensitive) → label = "Destination", else "Source/Mandi".

**11 places fixed across all 3 backends:**
- Frontend (5): VehicleWeight.jsx (3 — WhatsApp text, print HTML, photo dialog) + AutoWeightEntries.jsx (2 — print HTML, photo dialog). Table headers were already conditional.
- Backend Python (2): Single weight slip PDF (canvas + platypus versions in `/app/backend/routes/vehicle_weight.py`)
- Backend Node Desktop (3): WhatsApp text, drawGridRow PDF, bordered info table PDF
- Backend Node LAN (3): identical to Desktop

### Verification
- **Python pypdf test**: SALE PDF shows 'Destination' (only) ✓ | PURCHASE PDF shows 'Source/Mandi' (only) ✓
- **Node desktop-app harness pypdf test**: SALE ✓ | PURCHASE ✓
- **Logic test**: 7/7 test cases (Dispatch(Sale), Sale, Sale_Pakka, Receive(Purchase), Purchase, DC, empty) all correct
- Lint clean (frontend + backend)

---

## 📊 v104.44.9 — GLOBAL Excel Polish: Auto-filter + Freeze Header on EVERY Excel Download
**Build date:** 2026-04-30

### User Request
"jaise Per-Trip Bhada Excel me filter aaya hai (auto-filter dropdown), waisa global feature complete software me apply karo — jaha jaha Excel download hai sab me. Sirf jab consolidated/all-records download ho — single party/record ke liye nahi."

### Implementation
**170+ Excel endpoints upgraded across all 3 backends:**
- Python: 50+ endpoints (15 manual + 33 auto-injected)
- Node Desktop: 60+ endpoints (auto-injected via `/tmp/inject_node_polish.js`)
- Node LAN: 60+ endpoints (auto-injected)

**Polish features applied (all 3):**
1. **Auto-filter dropdowns** on header row → enables per-column sort/filter inside Excel
2. **Frozen header row** → header sticks while scrolling
3. **Gridlines off** → cleaner look (borders provide structure)

### Helper Functions
- **Python**: `/app/backend/utils/export_helpers.py::apply_consolidated_excel_polish(ws, header_row=None, n_cols=None, last_data_row=None)` + `detect_excel_header_row(ws, max_scan=8)`
- **Node Desktop**: `/app/desktop-app/routes/pdf_helpers.js::applyConsolidatedExcelPolish(ws, opts={})`
- **Node LAN**: `/app/local-server/routes/pdf_helpers.js::applyConsolidatedExcelPolish(ws, opts={})`

### Idempotency
If a route has already explicitly set `auto_filter` + `freeze_panes` (e.g. `per-trip-all/excel` knows its true header row is 5), the helper detects this and **skips override** — only ensures gridlines are disabled. This preserves route-specific correct configurations.

### Auto-Detection Logic
For routes without explicit configuration, the helper auto-detects header row by scanning first 8 rows; picks first row where 4+ of first 5 cells are non-empty. Falls back to row 1 if nothing matches.

### Coverage Examples (verified)
- Cash Book / Party Summary → `filter=A4:H74 freeze=A5 grid=False`
- Outstanding Report → `filter=A5:F34 freeze=A6 grid=False`
- FRK Purchases → `filter=A4:F6 freeze=A5 grid=False`
- Per-Trip Bhada (route had explicit header row 5) → `filter=A5:K7 freeze=A6 grid=False` ✅ (idempotency respected)
- Single-truck Per-Trip → `filter=A5:J6 freeze=A6 grid=False` (Node parity)

### Files Modified
- `/app/backend/utils/export_helpers.py` (added 2 helper functions ~120 LOC)
- `/app/desktop-app/routes/pdf_helpers.js` (added helper + module export)
- `/app/local-server/routes/pdf_helpers.js` (synced)
- 11 Python route files (manual + 33 auto-injected polish calls)
- 24 Node Desktop route files
- 24 Node LAN route files
- `/app/frontend/src/components/WhatsNew.jsx` (top entry)
- Version bumped 104.44.8 → 104.44.9 across constants + 2 package.json

### Auto-Injection Scripts (saved)
- `/tmp/inject_polish.py` (Python — handles standalone wb.save and inline patterns)
- `/tmp/inject_node_polish.js` (Node — handles 5 different Excel write patterns)

### Verification
- **Backend supervisor**: Started cleanly post-changes
- **Python curl**: 8/8 sampled endpoints PASSED (200 OK + valid xlsx + correct polish properties)
- **Node load tests**: All 24+24 = 48 route files load without errors
- **Node in-process harness**: 2/2 endpoints (per-trip-all + single-truck) verified — correct header row detected, freeze + filter + gridlines all confirmed via openpyxl-style ExcelJS read

---

## 🎯 v104.44.8 — Agent Payments + Local Party — Same Unified Header Pattern
**Build date:** 2026-04-30

### Changes
- **Agent Payments**: Full unification — search filter (`agentSearchFilter` + `filteredAgentPayments`), Card header title + tagline + search box + 4 icon buttons (PDF/Excel/WhatsApp/Group). Excel/PDF text buttons replaced.
- **Local Party**: Excel/PDF buttons converted to icon-only style. WhatsApp + Group icons added. Top toolbar (party dropdown + date range + Manual Purchase) preserved (party drilldown UX requires it).
- **Group dialog text formats**: Both panels use WhatsApp-friendly markdown with emoji + bold + party-wise mini-list (≤10 items).

### Files Updated
- `/app/frontend/src/components/Payments.jsx`:
  - State: `agentSearchFilter`
  - Memo: `filteredAgentPayments`, `agentTotals` recomputed
  - Helpers: `_agentSummaryText(label, list, totals)`
  - Handlers: `handleHeaderAgentWhatsApp`, `handleHeaderAgentGroup`
  - Agent Payments Card refactored — search + 4 icons in header
  - `agentPayments.map` → `filteredAgentPayments.map`
- `/app/frontend/src/components/payments/LocalPartyAccount.jsx`:
  - Imports: `Send`, `Users`, `SendToGroupDialog`
  - State: `groupDialogOpen, groupText, groupPdfUrl`
  - Helper: `_localPartySummaryText()`
  - Handlers: `handleHeaderWhatsApp`, `handleHeaderGroup`
  - Excel/PDF buttons → icon-only style + 2 new icon buttons (WhatsApp/Group)
  - SendToGroupDialog mounted at bottom
- `/app/frontend/src/components/WhatsNew.jsx` (top entry)
- `/app/frontend/src/utils/constants-version.js` → `104.44.8`
- `/app/desktop-app/package.json` → `104.44.8`
- `/app/local-server/package.json` → `104.44.8`

### Verification
- Lint clean (both files)
- Frontend smoke test:
  - Agent Payments: search=✓ PDF=✓ Excel=✓ WhatsApp=✓ Group=✓
  - Local Party: PDF=✓ Excel=✓ WhatsApp=✓ Group=✓
- Both panels render with consistent icon-only export buttons matching v104.44.7 pattern

### Consistency Status — All 5 Payment Sub-Tabs
| Tab | Search | PDF | Excel | WhatsApp | Group |
|---|---|---|---|---|---|
| Truck Payment | ✅ | ✅ | ✅ | ✅ | ✅ |
| Truck Owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| Per-Trip Bhada | ✅ | ✅ | ✅ | ✅ | ✅ |
| Agent Payments | ✅ | ✅ | ✅ | ✅ | ✅ |
| Local Party | (party drilldown) | ✅ | ✅ | ✅ | ✅ |

---

## 🎯 v104.44.7 — Truck Payments / Owner / Per-Trip Bhada — Unified Header (Search + Icon Exports + WhatsApp + Group)
**Build date:** 2026-04-30

### User Feedback Addressed
1. Stat lines/cards hatao: Truck Payment 3-card summary + Truck Owner 4-col footer + Per-Trip Bhada bottom strip — all gone
2. Truck Owner me search filter add karo (pehle nahi tha)
3. Truck Payment ko ek single white box me layout karo (like Per-Trip Bhada)
4. Truck Payment + Truck Owner + Per-Trip Bhada teeno me WhatsApp + Group icons add karo
5. Demo data clear (P1 deployment ready)

### Changes
- **Stat blocks removed**: 3 places (~50 lines deleted)
- **Truck Owner search filter**: New `truckOwnerSearchFilter` state + `filteredConsolidatedTruckList` memo. Live filters table + summary calculations.
- **Single-card unified layout**: Truck Payment ka filter/export bar pehle Card ke bahar tha (alag block) — ab Card header me integrated. Truck Owner pehle se Card me tha — header refactor kiya.
- **4-icon button pattern across all 3 panels**:
  - 🔴 PDF (FileText icon) — text export
  - 🟢 Excel (Download icon) — sheet export
  - 🟢 WhatsApp (Send icon) — copy summary text to clipboard (or wa.me fallback)
  - 🔵 Group (Users icon) — opens SendToGroupDialog with text + PDF link
- **Group dialog text format**: KMS context + filter context + truck count + total bhada + paid + balance + truck-wise mini-list (if ≤10 trucks)

### Demo Data Cleanup
- Ran `python3 /app/backend/scripts/seed_truck_pertrip_demo.py --clear`
- Removed 2 demo trucks (`OD-15-DEMO-1234`, `OD-21-DEMO-5678`) and their associated payments
- DB still has some `CG 07 TEST 111` and `TEST_BHADA_*` entries from earlier testing — user did not request these to be cleared

### Files Updated
- `/app/frontend/src/components/Payments.jsx`:
  - State: `truckOwnerSearchFilter`
  - Memo: `filteredConsolidatedTruckList`, `consolidatedTotals` recomputed
  - 4 new handlers: `handleHeaderTruckPaymentGroup/WhatsApp`, `handleHeaderTruckOwnerGroup/WhatsApp`
  - Helper: `_truckPaymentSummaryText(label, list, totals)`
  - Truck Payment Card refactored — search + 4 icons in header
  - Truck Owner Card refactored — search + 4 icons in header
  - 2 stat blocks removed (Truck Payment 3-card, Truck Owner 4-col footer)
  - 2 missing data-testid added: `tab-truck`, `tab-consolidated`
- `/app/frontend/src/components/TruckOwnerPerTripPanel.jsx`:
  - Import `SendToGroupDialog`
  - State: `groupDialogOpen, groupText, groupPdfUrl`
  - New: `handleHeaderGroup()` — generates consolidated summary text
  - 4th icon button (Users / cyan) added in header
  - SendToGroupDialog mounted at bottom
  - Bottom stat strip removed
- `/app/frontend/src/components/WhatsNew.jsx` (top entry)
- `/app/frontend/src/utils/constants-version.js` → `104.44.7`
- `/app/desktop-app/package.json` → `104.44.7`
- `/app/local-server/package.json` → `104.44.7`

### Verification
- Lint clean (frontend)
- Frontend smoke test:
  - Truck Payment: search=✓ PDF=✓ Excel=✓ WhatsApp=✓ Group=✓
  - Truck Owner: search=✓ PDF=✓ Excel=✓ WhatsApp=✓ Group=✓
  - Per-Trip Bhada: PDF=✓ Excel=✓ WhatsApp=✓ Group=✓
  - All 3 panels render in single Card with consistent header layout
- Demo trucks removed from DB

---

## 📊 v104.44.6 — Per-Trip Bhada Polish: Banner Below + Professional Excel + Node Single-Truck Parity
**Build date:** 2026-04-30

### User Feedback Addressed
1. **"ye niche ana chahiye"** — Navy summary banner ko table ke niche move karna (pehle upar tha + Hindi text vertical bars `||||` jaise dikhta tha font issue se).
2. **"excel ko professional banao"** — Plain Excel ko production-grade me convert karna.
3. **"Node Parity for single-truck Pending PDF/Excel/WhatsApp"** — Backlog item: `:vehicle_no/per-trip-pdf`, `/per-trip-excel`, `/whatsapp-text` ko Node Desktop + LAN me mirror karna.

### PDF — KPI Banner Moved BELOW Table
- 5 colored tiles below the data table: `TOTAL TRIPS` (navy) · `TOTAL BHADA` (orange) · `SETTLED` (green) · `PARTIAL` (amber) · `PENDING` (red)
- Each tile shows label + value + sub-text (e.g. "Sale 6 · Purchase 6", "7 trips")
- English-only labels (no Devanagari) → no font rendering issues
- Subtle column separators (#D5DBE5), refined header height (18pt) and row height (14pt)
- Bold colored text per column: RST (navy), Truck No (sky), Bhada (orange), Pending (red)

### Excel — Professional Production-Ready Layout
- Row 1: Branded company header (NAVKAR AGRO, 18pt bold, navy bg)
- Row 2: Subtitle ("Per-Trip Bhada Report — All Trucks")
- Row 3: Filter info strip (light blue bg, italic)
- Row 5+: Data table with auto-filter dropdown + frozen header (sticky on scroll)
- Alternating row colors (white/F7F9FC)
- ₹ currency formatting (`"₹"#,##0`)
- Color-coded status cells (Settled green, Partial amber, Pending red)
- Bold colored fonts per column type
- KPI banner BELOW data (5 colored tiles, 2 rows: label + value)
- Composition strip: "6 Sale · 6 Purchase · 7 Settled · 2 Partial · 3 Pending"
- Footer: generation timestamp + filter context
- Gridlines disabled for cleaner look

### Node Single-Truck Parity (NEW Endpoints)
- `GET /api/truck-owner/:vehicle_no/per-trip-pdf?[filter_status=&kms_year=]`
- `GET /api/truck-owner/:vehicle_no/per-trip-excel?[…]`
- `GET /api/truck-owner/:vehicle_no/whatsapp-text?[filter_status=pending]`
- All 3 mirror Python implementations exactly. Mirrored across Node Desktop + LAN.
- Filename includes truck no: `OD-15-DEMO-1234_per_trip_bhada_pending.pdf`

### Architecture — Shared Renderers
- New helper `_renderPerTripPdf(res, payload, opts)` — used by BOTH all-trucks and single-truck PDF endpoints (DRY)
- New helper `_renderPerTripExcel(res, payload, opts)` — used by BOTH all-trucks and single-truck Excel endpoints
- New helper `_buildPerTripPayload(vehicleNo, query)` — single-truck filter wrapper
- New helper `_buildWhatsAppText(vehicleNo, query)` — formatted text builder

### Triple-Backend Parity Status
- ✅ Python: all-trucks endpoints (banner below, professional Excel) updated. Single-truck endpoints unchanged (still functional with old layout — acceptable since user view defaults to all-trucks).
- ✅ Node Desktop: all 5 endpoints (2 all-trucks + 3 single-truck) fully synced with new layout
- ✅ Node LAN: identical to Desktop

### Verification
- **Pytest**: 17/17 backend tests PASSED (`test_pertrip_all_export_v104_44_5.py`)
- **Node in-process harness**: 9/9 PASSED (4 all-trucks + 4 single-truck + 1 WhatsApp text)
- **AI Vision PDF analysis**: 98% confidence — confirmed table at top, KPI banner at bottom, no garbled characters, clean professional layout
- **openpyxl direct read**: confirmed branded header, frozen panes (A6), auto-filter (A5:K17), ₹ format, KPI banner at row 19 (below data ending row 17)
- **Frontend smoke**: v104.44.6 visible, 10 demo trips rendered, PDF/Excel buttons clickable

### Files Updated
- `/app/backend/routes/vehicle_weight.py` (per-trip-all/pdf + per-trip-all/excel rewritten)
- `/app/desktop-app/routes/vehicle_weight.js` (full block rewrite + 3 new single-truck endpoints)
- `/app/local-server/routes/vehicle_weight.js` (synced with desktop)
- `/app/frontend/src/components/WhatsNew.jsx` (top entry)
- `/app/frontend/src/utils/constants-version.js` → `104.44.6`
- `/app/desktop-app/package.json` → `104.44.6`
- `/app/local-server/package.json` → `104.44.6`

---

## 📑 v104.44.5 — All-Trucks Per-Trip Bhada PDF/Excel Exports (Filter-Aware)
**Build date:** 2026-04-30

### Feature
Adds combined PDF/Excel export endpoints for the **All-Trucks Per-Trip Bhada** view that respect every active filter (status, trans_type, search). Replaces the prior single-truck-only behaviour where users had to filter to one truck before exporting.

### Endpoints (Triple-Backend Parity)
- `GET /api/truck-owner/per-trip-all/pdf?[kms_year=&season=&filter_status=&trans_type=&search=&date_from=&date_to=]`
- `GET /api/truck-owner/per-trip-all/excel?[…same params…]`

### Layout
- **PDF**: A4 landscape · header bar (NAVKAR AGRO + "🛻 Per-Trip Bhada — All Trucks") · summary banner (Total Bhada / Settled / Partial / Pending / Sale·Purchase) · 11-col table with Truck No column · color-coded status cells
- **Excel**: 11-col sheet (RST · Date · Truck No · Type · Party · Destination · Net Wt · Bhada · Paid · Pending · Status) · summary subtitle row · status fill colors

### Filter-Aware Filename
- `per_trip_bhada_all_trucks.pdf` (no filter)
- `per_trip_bhada_all_trucks_pending.pdf` (status filter applied)

### Triple-Backend Parity
- ✅ Python: `/app/backend/routes/vehicle_weight.py` (helper `_build_pertrip_all_payload` + 2 endpoints)
- ✅ Node Desktop: `/app/desktop-app/routes/vehicle_weight.js` (helper `_buildPerTripAllPayload` + 2 endpoints)
- ✅ Node LAN: `/app/local-server/routes/vehicle_weight.js` (identical)

### Frontend
- `/app/frontend/src/components/TruckOwnerPerTripPanel.jsx`
  - `handleHeaderExport()` rewritten — uses `/per-trip-all/pdf` and `/per-trip-all/excel`, passes `filter_status`, `trans_type`, `search` query params from current panel state.
  - Removed "filter to 1 truck first" hint — buttons always work for combined export.
  - Tooltip updated: "PDF Export (current filters apply)".
  - WhatsApp button still single-truck only (text-template format limitation).

### Verification
- **Backend curl** — 18 filter combinations PASSED (200 OK, valid PDF/XLSX magic bytes).
- **Pytest regression** — `/app/backend/tests/test_pertrip_all_export_v104_44_5.py`: **17/17 PASSED**.
- **Node desktop-app harness** — in-process Express test: **6/6 PASSED**.
- **Frontend smoke test** — Per-Trip Bhada panel renders with PDF/Excel/Search buttons all visible and enabled. v104.44.5 WhatsNew entry shown at top.

### Files Updated
- `/app/backend/routes/vehicle_weight.py` (+250 lines for helper + 2 endpoints)
- `/app/desktop-app/routes/vehicle_weight.js` (+220 lines)
- `/app/local-server/routes/vehicle_weight.js` (+220 lines)
- `/app/frontend/src/components/TruckOwnerPerTripPanel.jsx` (handleHeaderExport rewrite)
- `/app/frontend/src/components/WhatsNew.jsx` (top entry)
- `/app/frontend/src/utils/constants-version.js` → `104.44.5`
- `/app/desktop-app/package.json` → `104.44.5`
- `/app/local-server/package.json` → `104.44.5`
- `/app/backend/tests/test_pertrip_all_export_v104_44_5.py` (NEW — 17 regression tests)

---

## 🛻 v104.44.4 — Truck Owner Per-Trip Bhada (Production Ready)
**Build date:** 2026-04-30

### Feature
New **`Payments → Per-Trip Bhada`** subtab — truck-wise drill-down view that joins `vehicle_weights.bhada` (Sale + Purchase) with `cash_transactions` NIKASI payments and applies **FIFO settlement** to derive per-trip Settled / Partial / Pending status.

### Endpoints (Triple-Backend Parity)
- `GET /api/truck-owner/per-trip-trucks` — List trucks with bhada > 0
- `GET /api/truck-owner/{vehicle_no}/per-trip` — Per-trip breakdown with FIFO + summary KPIs
- `POST /api/truck-owner/{vehicle_no}/settle/{rst_no}` — One-click settle → auto NIKASI entry
- `GET /api/truck-owner/{vehicle_no}/per-trip-pdf?filter_status=...` — PDF export (color-coded status)
- `GET /api/truck-owner/{vehicle_no}/per-trip-excel` — Excel export
- `GET /api/truck-owner/{vehicle_no}/whatsapp-text?filter_status=pending` — Formatted WhatsApp text

### UI Highlights
- Truck dropdown with trip count + total bhada per row
- 4 Live KPI tiles: Total Trips (Sale/Purchase split), Total Bhada, Settled, Pending
- Filters: All/Sale/Purchase + All/Pending/Partial/Settled
- Per-trip table: RST · Date · Type tag · Party · Net Wt · Bhada · Paid · Pending · Status badge · Action
- **Pay button** on Pending/Partial trips → real backend NIKASI → instant refresh
- **Pending PDF / Excel / WhatsApp** export buttons (all functional)

### Architecture (FIFO Algorithm)
1. Fetch all VW entries for truck with `bhada > 0` (chronological asc)
2. Fetch all `cash_transactions` (account=ledger, party_type=Truck, category=vehicle_no, txn_type=nikasi)
3. Sum nikasis → `pool`
4. For each trip (oldest first):
   - If pool ≥ bhada → fully Settled, pool -= bhada
   - Else if pool > 0 → Partial (paid=pool), pool=0
   - Else → Pending

### Triple-Backend Parity (Core Endpoints)
- ✅ Python: `/app/backend/routes/vehicle_weight.py` (lines ~1955-2300)
- ✅ Node Desktop: `/app/desktop-app/routes/vehicle_weight.js`
- ✅ Node LAN: `/app/local-server/routes/vehicle_weight.js`
- ⚠️ Export endpoints (PDF/Excel/WhatsApp) — Python only in this release; Node parity pending for next release.

### Verification (testing_agent_v3_fork — iteration_207)
- **Backend**: 22/22 PASSED (100%)
- **Frontend**: All UI elements verified (truck dropdown, KPIs, filters, Pay button, exports, WhatsNew)
- **FIFO**: Verified — settling RST #1006 (₹4,000) correctly redistributed pool, status changed to Partial with ₹2,000 paid

### Demo Data
Seeded via `/app/backend/scripts/seed_truck_pertrip_demo.py`:
- `OD-15-DEMO-1234` — 7 trips (4 Sale + 3 Purchase) + 3 partial nikasis → mix of settled/partial/pending
- `OD-21-DEMO-5678` — 3 trips, all pending

### Files Updated
- `/app/backend/routes/vehicle_weight.py` (6 new endpoints)
- `/app/desktop-app/routes/vehicle_weight.js` (3 core endpoints — parity)
- `/app/local-server/routes/vehicle_weight.js` (same parity)
- `/app/frontend/src/components/Payments.jsx` (new tab + lazy import)
- `/app/frontend/src/components/TruckOwnerPerTripPanel.jsx` (NEW — main UI, ~310 lines)
- `/app/backend/scripts/seed_truck_pertrip_demo.py` (NEW — demo seed script)
- `/app/backend/tests/test_pertrip_bhada_v104_44_4.py` (NEW — testing agent created)
- Versions: 104.44.3 → 104.44.4

---

## 🚛 v104.44.3 — Bhada (Lumpsum) Across All Sale/Purchase Forms
**Build date:** 2026-04-30

### Feature
Single **Bhada (Lumpsum) ₹** field added across **4 forms** — replacing previous separate `Cash (Truck ko)` + `Diesel (Pump se)` UI. Single source of truth = `vehicle_weights.bhada`. RST se auto-fetch + canonical update.

### Forms Updated
1. **BP Sale Register** (`ByProductSaleRegister.jsx`) — Rice Bran/Broken/Kanki/Husk
2. **Sale Voucher** (`SaleBook.jsx`)
3. **DC Delivery** (`DCTracker.jsx`) — multi-truck setup, per-truck Bhada
4. **Pvt Purchase Vouchers** (`PurchaseVouchers.jsx`)

### Architecture
- **Single source of truth**: `vehicle_weights.bhada` (canonical). All 4 forms read & write via existing `/api/vehicle-weight/by-rst/{rst_no}` (auto-fetch on RST blur) and `/api/vehicle-weight/{id}/edit` (sync on save).
- **Helper utility** (`/app/frontend/src/utils/vw-bhada.js`):
  - `fetchVwByRst(rstNo, kmsYear)` — pulls VW entry + bhada
  - `updateVwBhada(rstNo, bhada, username, kmsYear)` — pushes new bhada → triggers backend `_sync_*_bhada_ledger`
- **Backend helper extended** (`_sync_sale_bhada_ledger`):
  - Now handles **Sale** (`vw_sale_bhada:{rst}`) AND **Purchase** (`vw_purchase_bhada:{rst}`) trips with distinct refs (no collision on same RST).
  - Both trans_types create `cash_transactions` JAMA entries on truck owner.
  - Description prefix: "Sale Bhada" or "Purchase Bhada" based on trans_type.
  - DELETE cascade cleans both refs.

### Triple-Backend Parity
- ✅ Python: `/app/backend/routes/vehicle_weight.py`
- ✅ Node Desktop: `/app/desktop-app/routes/vehicle_weight.js`
- ✅ Node LAN: `/app/local-server/routes/vehicle_weight.js`

### Verification (testing_agent_v3_fork — iteration_206)
- **Backend**: 14/14 tests passed (100%)
  - Purchase POST + auto-jama → ✓
  - Purchase edit → ledger update ✓
  - Purchase bhada=0 → ledger auto-delete ✓
  - Purchase DELETE → cascade-remove ✓
  - Sale regression (existing `vw_sale_bhada`) ✓
  - VW CRUD no regression ✓
- **Frontend**: All 4 forms verified
  - `bp-bhada`, `sv-bhada`, `pv-bhada`, `delivery-truck-{idx}-bhada` data-testids present ✓
  - Cash + Diesel UI removed ✓
  - WhatsNew modal v104.44.3 at top ✓

### Files Updated
- `/app/backend/routes/vehicle_weight.py` (helper extended for purchase, DELETE cascade for both refs)
- `/app/desktop-app/routes/vehicle_weight.js` (same parity)
- `/app/local-server/routes/vehicle_weight.js` (same parity)
- `/app/frontend/src/utils/vw-bhada.js` (NEW shared helper)
- `/app/frontend/src/components/ByProductSaleRegister.jsx`
- `/app/frontend/src/components/SaleBook.jsx`
- `/app/frontend/src/components/PurchaseVouchers.jsx`
- `/app/frontend/src/components/DCTracker.jsx`
- `/app/frontend/src/components/WhatsNew.jsx` (top entry)
- `/app/frontend/src/utils/constants-version.js` → `104.44.3`
- `/app/desktop-app/package.json` → `104.44.3`
- `/app/local-server/package.json` → `104.44.3`

---

## 🚛 v104.44.2 — Sale Truck Lumpsum Bhada (Triple-Backend Parity)
**Build date:** 2026-04-30

### Feature
For Sale dispatches in Vehicle Weight, replaced separate "Cash Paid" + "Diesel Paid" fields with a single **"Bhada (Lumpsum) ₹"** field. The amount automatically creates a JAMA (CR) ledger entry under the truck owner — mill owes the lump-sum freight.

### Implementation Surface
- **Schema:** `vehicle_weight` records now carry a `bhada` (float) field. Persists across 1st-weight create, 2nd-weight capture, and admin edits.
- **Auto-Ledger:** New helper `_sync_sale_bhada_ledger` (Python) / `syncSaleBhadaLedger` (Node) maintains an idempotent `cash_transactions` row:
  - `account=ledger, party_type=Truck, category=<vehicle_no>, txn_type=jama`
  - `reference=vw_sale_bhada:{rst_no}` → unique → update on edit, delete on bhada=0 / vehicle removed / DELETE entry.
- **Triggers:** POST `/vehicle-weight`, PUT `/{id}/second-weight`, PUT `/{id}/edit`, DELETE `/{id}` all sync the helper. DELETE additionally cascade-removes the linked `cash_transactions` row.
- **Sale Excel/PDF Exports:** `trans_type=sale` exports use 11-col layout (Excel) / 12-col layout (PDF):
  - Sale columns: RST | Date | Vehicle | Party | Destination | Product | Bags | Bag Type | Net Wt | **Bhada** | Remark
  - Summary banner: 4 stats (Total Entries, Total Bags, Net Wt, **Total Bhada**)

### Triple-Backend Parity (Critical)
Pichli session me sirf Python backend update hua tha. Yeh fix Node.js backends ko ab Python ke saath sync me laata hai:
- ✅ Python: `/app/backend/routes/vehicle_weight.py` (already done last session)
- ✅ Node Desktop: `/app/desktop-app/routes/vehicle_weight.js` (added in v104.44.2)
- ✅ Node LAN: `/app/local-server/routes/vehicle_weight.js` (added in v104.44.2)

### Verification (curl + node test harness)
**Python (curl against preview URL):**
- POST Sale entry with `bhada=4000` → auto-jama `cash_transactions` row created with `category=<vehicle_no>, party_type=Truck, txn_type=jama, amount=4000` ✓
- Edit bhada=5500 → ledger amount updated ✓
- Edit bhada=0 → ledger auto-deleted ✓
- DELETE entry → cascade-removed ledger ✓
- Sale Excel export header includes "Bhada" not "Cash"/"Diesel" ✓
- Sale PDF export shows "Bhada" column + "TOTAL BHADA" banner ✓

**Node desktop-app + local-server (in-process express harness):**
- All 4 lifecycle scenarios (create, edit, bhada=0, DELETE) validated identically to Python ✓

### Files Updated
- `/app/desktop-app/routes/vehicle_weight.js` (helper + 4 handlers + Excel + PDF Sale layout)
- `/app/local-server/routes/vehicle_weight.js` (same as above)
- `/app/desktop-app/package.json` → `104.44.2`
- `/app/local-server/package.json` → `104.44.2`
- `/app/frontend/src/utils/constants-version.js` → `104.44.2`
- `/app/frontend/src/components/WhatsNew.jsx` (top entry)

---

## 🚨 v104.41.2 — Owner Expense Payment Ledger Fix (Titu's JAMA)
**Build date:** 2026-02-16

### Reported Issues (User)
1. **Bug 1**: "Titu ne 1000 pay kiya Rakhad Fikai ko, par Titu ke ledger me JAMA nahi hua" — Owner expense not reflecting in Owner's ledger.
2. **Bug 2 (after first attempt)**: "1000 dikha raha par 1,00,000 jama jo Titu ne diya tha wo nahi aaraha" — only `account=owner` entries showed; cash/bank entries with `category=Titu, party_type=Owner` were missing.
3. **Bug 3**: "Titu ko clear karke koi aur party search kiya toh nahi aati. Party Type Owner me lock reh jaata hai" — X-clear of Select Party didn't reset `party_type`.

### Root Cause
- Cashbook stores Owner txns in **mill perspective** (`account=owner, owner_name=Titu, txn_type=nikasi` = mill paid via Titu). Owner ledger needs **owner perspective** (Titu contributed = JAMA).
- Pre-fix, GET `/api/cash-book?category=Titu&party_type=Owner` only matched `category=Titu` which yielded zero owner-account txns.
- Combined ledger needed **both** sources: (a) `account=owner, owner_name=<o>` AND (b) `account in [cash,bank], category=<o>, party_type=Owner`.
- X-clear handler reset `category` but not `party_type`, locking the dropdown to Owner-only parties.

### Fix
**Backend (Python `/app/backend/routes/cashbook.py`)** — `get_cash_transactions`, `_generate_cash_book_pdf_bytes`, `export_cash_book_excel`:
```python
if category and party_type == "Owner":
    query["$and"] = [
        {"$or": [
            {"owner_name": category, "account": "owner"},
            {"category": category, "party_type": "Owner",
             "account": {"$in": ["cash", "bank"]}},
        ]},
        {"reference": {"$not": {"$regex": "^auto_ledger:"}}},
    ]
# Account filter from query string is IGNORED for owner view.
```
For Excel/PDF exports: txn_type is **flipped only for `account=owner` entries** (cash/bank entries are already in Owner perspective).

**Frontend (`TransactionsTable.jsx`)** — `effectiveType()` flips `txn_type` for display only when `isOwnerLedger=true` AND `account=='owner'`. Running balance, totals, badges all use `effectiveType`.

**Frontend (`CashBookFilters.jsx`)** — X clear button + onChange handler now reset both `category` AND `party_type`.

**Triple-Backend Parity** — Same fix mirrored in `/app/desktop-app/routes/cashbook.js` and `/app/local-server/routes/cashbook.js` (lowDB JS filtering).

### Test Results (testing_agent_v3_fork iteration 205)
- Backend: **100%** (10/10 API tests passed)
- Frontend: **100%** (6/6 UI tests passed)
- Verified: Titu's ledger now shows 5 entries (2 cash jama, 1 cash nikasi, 2 owner-paid expenses flipped to jama), Total **₹78,000 CR** (mill owes Titu).
- Verified: After X-clear, MBOPL can be searched — party_type unblocked.

---

## ♻️ Refactor (Apr 29, 2026) — `upsert_jama_ledger()` Helper for Truck Rate + Agent Commission Logic

**What:** Pulled out the repetitive "find existing jama → update OR insert new ledger entry" pattern from `payments.py` into a single helper function, applied across **both** `set_truck_rate` and `record_agent_payment` + `mark_agent_paid` endpoints.

**Files:**
- New helper: `/app/backend/services/cashbook_service.py` → `upsert_jama_ledger(query, doc, allow_delete_on_zero=False)`
- Refactored: `/app/backend/routes/payments.py`
  - `set_truck_rate` — 5 duplicate truck-jama blocks (pvt/sale/purchase/dc/multi)
  - `record_agent_payment` — agent_jama upsert
  - `mark_agent_paid` — agent_jama upsert
- Tests: `/app/backend/tests/test_truck_rate_refactor.py` (4 tests, all pass)

**Impact:**
- 7 duplicate upsert blocks → 7 helper calls
- payments.py: 2146 → 2039 lines (**-107 lines, ~5% smaller**)
- Future bug fixes / param changes → 1 file edit instead of 7
- Zero remaining `existing_jama = await db.cash_transactions.find_one(...)` upsert patterns in payments.py

**API behaviour:** UNCHANGED. Same field names, same response, same reference prefixes. All 4 regression tests pass + manual end-to-end test (rate 50→75→0 confirmed insert→update→delete works).

**Triple-Backend Parity:** Node backends (`desktop-app`, `local-server`) only have **1 occurrence** of these patterns each — refactoring there would be over-engineering. API contract unchanged → parity preserved at the API level.

**Skipped (intentional):**
- `hemali.py`, `staff.py` cash_transactions inserts — single inserts, no upsert pattern, no benefit from refactoring.

---

## 🔔 v104.36.0 — Mill Parts Low Stock Notification (Header Bell)
**Build date:** 2026-04-29

### Feature
Header me global 🔔 Bell icon — jab koi Mill Part stock low ho ya khatam (`current_stock <= min_stock`), red badge me alert count dikhata hai. User ko bina Mill Parts page khole pata chal jaata hai ki kaunsa part restock chahiye.

### Behavior
- **Trigger:** `min_stock > 0 AND current_stock <= min_stock` (sirf un parts ke liye jinka min_stock master me set hai)
- **Out of Stock first:** `current_stock <= 0` items sabse upar (most critical)
- **Then by shortage:** `min_stock - current_stock` zyada ho woh upar
- **Auto-refresh:** Har 60 seconds me background poll + dropdown khulne pe instant fetch
- **Filter respect:** Global KMS year + Season ke according filter hota hai
- **Animated:** Bell icon pulse karta hai jab alerts hote hain

### UI
- **Position:** Header me, SessionIndicator ke baad — har tab pe global
- **Badge:** Red circle with white count (99+ if too many)
- **Dropdown:** 340px wide, max 480px tall, scrollable list
  - Each item: Part name + OUT/LOW badge + current/min stock + unit + store room + category
  - Out-of-stock rows: Red background + red icon (PackageX)
  - Low-stock rows: Amber background + amber icon (AlertTriangle)
- **Footer:** "Mill Parts Stock kholein" → Mill Parts tab pe navigate

### API
`GET /api/mill-parts/low-stock-alerts?kms_year=&season=` → `{count: int, alerts: [...]}`

Each alert: `{part_name, category, unit, store_room_name, min_stock, current_stock, shortage, is_out_of_stock}`

### Triple-Backend Parity
- ✅ Python: `/app/backend/routes/mill_parts.py` — uses `get_stock_summary()` then filters
- ✅ Desktop Electron: `/app/desktop-app/routes/mill_parts.js` — uses `getStockSummary()` then filters
- ✅ LAN Express: `/app/local-server/routes/mill_parts.js` — uses `getStockSummary()` then filters

### Files Changed
- Python: `/app/backend/routes/mill_parts.py` (added endpoint before summary)
- Node: `/app/desktop-app/routes/mill_parts.js` + `/app/local-server/routes/mill_parts.js`
- React: NEW `/app/frontend/src/components/LowStockBell.jsx`
- React: `/app/frontend/src/components/entries/AppHeader.jsx` (mounted bell)
- Version: `constants-version.js` + 2× `package.json` → 104.36.0
- Changelog: `WhatsNew.jsx` (top entry added)

### Testing
- ✅ Curl: Created 2 test parts (TEST_LOW_STOCK_BELT, TEST_OUT_BEARING) — endpoint returned 2 alerts in correct order (out-of-stock first by shortage)
- ✅ Frontend: Bell shows red "2" badge, dropdown opens with both items, OUT badges + counts visible
- ✅ Test data cleaned up

---

## 🔒 v104.34.0+ — 5-Minute Edit Lock Across ALL Modules + Settings Toggle + Custom Duration
**Build date:** 2026-04-28 (Late evening, refined)

### Feature
Existing 5-min edit window (jo Mill Entries me tha) ab **saare transactional modules** me apply hota hai with a global Settings toggle AND **custom duration** (1-1440 min).

### NEW: Custom Duration
- Settings → Permissions me preset buttons: **2 / 5 / 10 / 30 / 60 minutes**
- Custom number input (1-1440 range = up to 24 hours)
- Both `enabled` and `duration_minutes` saved together
- All 8+ modules respect this duration dynamically

### Modules Covered
- ✅ Mill Entries
- ✅ Cash Book Transactions
- ✅ Vehicle Weight Entries
- ✅ Hemali Payments
- ✅ Sale Vouchers
- ✅ Purchase Vouchers
- ✅ BP Sale Register
- ✅ **Staff Payments** (NEW)
- 🟢 Truck Payments — already admin-only (different protection)
- 🟢 Agent Payments — already admin-only

### API Schema
- `GET /api/settings/edit-window` → `{enabled: bool, duration_minutes: int}`
- `PUT /api/settings/edit-window` body `{enabled: bool, duration_minutes: int}` → updates atomically

### Files Updated
**Python:**
- `services/edit_lock.py`: `get_edit_window_settings()`, `set_edit_window_settings()` with duration support
- `routes/entries.py`: GET/PUT endpoints updated for duration
- `routes/staff.py`: delete_payment now uses check_edit_lock

**Node (Desktop + LAN, parity-synced):**
- `routes/edit_lock_helper.js`: `getEditWindowSettings()`, `setEditWindowSettings()` with duration
- `routes/entries.js`: GET/PUT endpoints updated

**Frontend:**
- `components/settings/PermissionsTab.jsx`: 5 preset buttons + custom number input + live status banner

### Verified
- ✅ curl GET returns `{enabled: true, duration_minutes: 5}`
- ✅ curl PUT 2 min → 30 min → 5 min — all save correctly
- ✅ UI shows preset buttons highlighting active value
- ✅ Custom input accepts any value in [1, 1440]
- ✅ All lints pass

## v104.33.2 — GLOBAL Fix: All PDFs Hindi/Devanagari Rendering
**Build date:** 2026-04-28

### Issue
**All PDFs** (Weight Report, Mill Entries, Stock Summary, Sale Book, Hemali, etc.) had Devanagari labels rendering as `||||||||` vertical bars. Header/branding could have Hindi text (e.g., "मिल एंट्री", "नवकार एग्रो") which broke wherever it appeared.

### Root Cause
Both Python (ReportLab) and Node (PDFKit) had `FreeSans` aliased to **Inter** font for premium aesthetics, but Inter has **NO Devanagari glyphs** — so every Hindi character rendered as a missing-glyph box.

### Global Fix (Single-line cascade for entire app)

#### Python (`utils/export_helpers.py`)
- Re-aliased `FreeSans` font family to **NotoSansDevanagari** (which has both Latin AND Devanagari glyphs)
- Now ALL PDFs using FreeSans/FreeSansBold automatically render Hindi correctly without any caller code change
- Inter still registered separately for English-only contexts

#### Node (`pdf_helpers.js` for Desktop + LAN)
- All shared helpers (`addPdfHeader`, `addPdfTable`, `addTotalsRow`, `addSummaryBox`, `addSectionTitle`, `drawSummaryBanner`, `drawSectionBand`) now use `autoF()` instead of plain `F()`
- `autoF()` auto-detects Devanagari in text and switches to NotoDeva font on the fly
- Vehicle Weight Report (`vehicle_weight.js`) — additional fixes for `drawWeightBar` label, summary box labels (कुल/शुद्ध/बोरा/नकद/डीजल)

#### Mill Entries Report (`entries.py`)
- `title_table` and `style_commands` styled tables now use `NotoDevaBold` font
- Header "Mill Entries / मिल एंट्री" renders correctly

### Triple-Backend Parity
- ✅ Python: NotoDeva alias for FreeSans
- ✅ Node Desktop: pdf_helpers.js + vehicle_weight.js fixed with autoF
- ✅ Node LAN Local: synced with desktop-app

### Verified
- Generated Mill Entries PDF via curl → AI analysis confirms "**मलि एंट्री** is clearly legible"
- All shared helper functions now Devanagari-aware

## v104.33.1 — Bug Fix: TOTAL Row Double-counting Auto-Ledger Pairs
**Build date:** 2026-04-28

### Issue
Cash Book → Cash Transactions → TOTAL row me amounts double ho rahe the. User ne "Titu" ke liye ₹42,500 ka ek transaction banaya tha, lekin TOTAL row Jama ₹85,000 dikhata tha (kyunki real cash txn + auto_ledger pair dono count ho rahe the).

### Root Cause
`TransactionsTable.jsx` ka `totalJama`/`totalNikasi` computation **saare visible rows** ko sum kar raha tha — including auto_ledger pairs (jo basically same transaction ka hidden duplicate hota hai for double-entry accounting).

### Fix
- Frontend (`TransactionsTable.jsx`): Added `isAutoLedger` filter → only real txns contribute to totals
- TOTAL row label updated: `TOTAL (N transactions, M auto-pair excluded)` — transparency ke liye
- Backend Node Excel/PDF export (`cashbook.js` x 2): Same filter applied to total_jama/total_nikasi calculations
- Python backend (`cashbook.py`) already had this skip logic (line 482-483, 509)

### Triple-Backend Parity
- ✅ Python: already correct
- ✅ Node Desktop: fixed
- ✅ Node LAN Local: synced

## v104.33.0 — Major Release: Direct File Upload + Ledger→Owner Convert + Multiple Bug Fixes
**Build date:** 2026-04-28

### NEW: Convert Existing Ledger to Owner Account
- One-click migration: existing party (e.g. "Titu" used as cash category) ko Owner Account me convert karna
- **Endpoint:** `POST /api/owner-accounts/convert-from-ledger` with `{name, dry_run}`
- **Logic:**
  1. Creates owner account if not exists
  2. Finds all `cash_transactions` with `category=name` and `account in [cash, bank]`
  3. **Flips txn_type** (Owner accounting is inverted from cash/bank: cash-nikasi to Titu = Owner-jama [withdrew])
  4. Updates auto-ledger pairs to match
  5. Returns counts for verification
- **UI:** CashBook → Owner Accounts dialog → expandable "Pehle se Cash/Bank ledger hai? Convert karein →"
- **Safety:** Dry-run preview shows match count + total amount before actual conversion. User confirms via popup.
- **Triple-Backend Parity:** All 3 backends (Python + Electron + LAN Express) implement identical logic

### v104.33.0 Major Items (Today's Combined Changelog)
1. wa.9x.design Direct File Upload (sendMessageFile + sendGroupFile, ~70% faster)
2. Generic File Upload endpoint (`/api/whatsapp/send-file` — any MIME type, max 100 MB)
3. 8 New WhatsApp icon buttons (Daily Report, Staff Attendance, Stock Summary, Cash Book, Agent/Mandi Report, Gunny Bags, Hemali, Mill Parts, Sale/Purchase Vouchers)
4. Icon-only action buttons across all reports (cleaner UI)
5. Ledger → Owner Account converter
6. Bug fix: Daily Report single WhatsApp also sent to group
7. Bug fix: Weighbridge stuck at last weight (3-sec staleness timeout)
8. Bug fix: Weight Report PDF Hindi labels rendering as `||||||||` (font fix)
9. Bug fix: bp_sale_register CRASH on DELETE (operator precedence)
10. Bug fix: Auto Weight pending badge stale after bulk delete
11. WhatsNew + version bump to v104.33.0

## v104.32.0 — wa.9x.design Group Fetch Verified + Dynamic Provider Footer
**Build date:** 2026-04-28

### 🔴 Bug Fix #A — bp_sale_register.js: matchRef CRASH on undefined ref
- **Issue:** `DELETE /api/bp-sale-register/:id` crashed with `Cannot read properties of undefined (reading 'includes')`
- **Root cause:** Operator precedence — `&&` binds tighter than `||`, so `ref &&` guard didn't apply to second clause
- **Old:** `ref && (ref.includes('a') && ref.includes(b)) || (ref.includes('c') && ref.includes(b))`
- **Fix:** `!!ref && ((ref.includes('a') && ref.includes(b)) || (ref.includes('c') && ref.includes(b)))`
- **Files:** `desktop-app/routes/bp_sale_register.js`, `local-server/routes/bp_sale_register.js` (Python uses MongoDB regex, not affected)
- **Verified:** Node test confirms OLD crashes on `undefined`/`null`, NEW returns `false` safely

### 🔴 Bug Fix #B — Weighbridge stuck at 5,850 kg (no truck on bridge)
- **Issue:** Display showed "STABLE - LOCKED" with 5,850 kg even when no truck on weighbridge
- **Root cause:** `lastWeight`/`isStable` only updated on serial port data events. If bridge stops streaming (truck moves off), values persist forever.
- **Fix added in `serial-handler.js`:**
  - New `lastUpdateTime` timestamp updated on every reading
  - New `STALE_THRESHOLD_MS = 3000` (3 sec without data → stale)
  - `getWeightStatus()` returns `{weight: 0, stable: false, stale: true}` if stale
  - **NEW periodic stale-checker** (1 sec interval): emits `serial-weight` event with `weight=0` to renderer when bridge becomes idle, unfreezing the LOCKED display

### 🔴 Bug Fix #C — Weight Report PDF: Devanagari labels showing as `||||||||`
- **Issue:** Hindi labels (गाड़ी, पार्टी, माल, बोरे, दिनांक) rendered as vertical bars/boxes
- **Root cause:** PDF generators used `FreeSans` font which has no Devanagari glyphs
- **Fix:**
  - **Python** (`vehicle_weight.py`): `lbl_style`/`val_style` now use `NotoDeva`/`NotoDevaBold` (renders both Latin + Devanagari)
  - **Node** (`vehicle_weight.js`): `drawGridRow()` switched from `F('normal')` to `autoF(text, 'normal')` — auto-detects Devanagari
- **Verified:** Generated weight report PDF, AI analysis confirms ALL 5 Hindi labels (गाड़ी/पार्टी/माल/बोरे/दिनांक) render correctly ✅

### 6 New WhatsApp Share Locations (icon-only, drop-in)
1. **Gunny Bags Register** (DCTracker.jsx) — share `gunny_bags.pdf`
2. **Hemali Payments** (HemaliPayment.jsx) — main list `hemali_payments.pdf`
3. **Hemali Monthly Summary** (HemaliPayment.jsx) — month-wise summary `hemali_monthly.pdf`
4. **Mill Parts Stock** (MillPartsStock.jsx) — `mill_parts.pdf`
5. **Sale Book** (SaleBook.jsx) — `sale_book.pdf` (with search/filter preserved)
6. **Purchase Vouchers** (PurchaseVouchers.jsx) — `purchase_book.pdf` (with search preserved)

All existing PDF/Excel buttons in these places also converted to **icon-only** (h-9 w-9 p-0) with title tooltips.

## v104.35.0 — Icon-Only Buttons + 3 Initial WhatsApp Share Locations
**Build date:** 2026-04-28

### 🔴 Bug Fix: Single WhatsApp click was ALSO sending to group
- **Issue:** Daily Report → click "WhatsApp" button (single send) → message ALSO appeared in WhatsApp Group
- **Root cause:** `send_to_group: true` was hardcoded in the WhatsApp button onClick handler (DailyReport.jsx:157)
- **Fix:** Changed to `send_to_group: false` — single button only sends to phone/default numbers, Group button sends to group
- **Verified via curl:** `send-daily-report` with `send_to_group=false` returns only 1 target (no group)

### Icon-Only Action Buttons (cleaner UI)
Replaced text+icon buttons with **icon-only buttons** across all key reports:
- **DailyReport**: Telegram, WhatsApp (single), Group buttons → all icon-only with hover tooltips
- **StaffManagement**: Excel, PDF, WhatsApp Share buttons → icon-only
- **StockSummary**: Excel, PDF, WhatsApp Share → icon-only
- **AgentMandiReport**: Excel, PDF, WhatsApp Share → icon-only
- **CashBook (SummaryCards)**: Excel, PDF, WhatsApp Share → icon-only with `actionExtras` slot
- **ShareFileViaWhatsApp** component: now icon-only by default with `title` tooltip

### 3 New WhatsApp Share Locations (drop-in)
1. **Stock Summary** — share Excel report directly to WhatsApp group (file: `stock_summary.xlsx`)
2. **Cash Book** — share PDF (with current filters preserved: account, txn_type, party, dates) (file: `cash_book.pdf`)
3. **Agent / Mandi Report** — share PDF (with current filters: search, dates, expanded mandis) (file: `agent_mandi_report.pdf`)

### Pattern (any future location):
```jsx
<ShareFileViaWhatsApp
  getFile={async () => fetchAsBlob('/api/some/export?fmt=xlsx', 'report.xlsx')}
  caption="Report description"
  title="WhatsApp pe bhejein"
/>
```

## v104.34.0 — Generic File Upload (Excel/Word/Image/Video → WhatsApp)
**Build date:** 2026-04-28

### MIME-aware backend helpers
- `_send_wa_message()` and `_send_wa_to_group()` ab `content_type` param accept karte hain
- New `_detect_mime(filename)` helper — extension se auto-detect karta hai
- Supported: PDF, XLSX/XLS, DOCX/DOC, PPTX, CSV, TXT, JPG/PNG/GIF/WebP, MP4/MOV, MP3/OGG
- Renamed param `pdf_bytes` → `file_bytes` (backward-compatible internally)

### New Generic Endpoint: `POST /api/whatsapp/send-file`
Frontend ya backend kahin se bhi koi bhi file blob ko WhatsApp pe direct bhej sakta hai:
- **Form fields:** `file` (binary), `mode` (`phone`|`group`|`default`), `phone`, `group_id`, `caption`
- **Max:** 100 MB
- **Returns:** `{success, message, details, filename, size_bytes, mime_type}`
- Mirror in all 3 backends (Python + Electron Node + Local Express via multer)

### New Reusable Component: `ShareFileViaWhatsApp`
Path: `/app/frontend/src/components/common/ShareFileViaWhatsApp.jsx`
- Drop-in button — pass a `getFile` callback that returns `{blob, name}`
- Opens existing `SendToGroupDialog` with file pre-loaded
- New `SendToGroupDialog` prop: `fileBlob` + `fileName` (auto-routes to `/send-file` endpoint)
- New utility `fetchAsBlob(url, filename)` in `/utils/download.js`

### Frontend Integration: Staff Attendance Excel
- Staff → Attendance section me ab **Excel | PDF | WhatsApp** teeno buttons hain
- WhatsApp button click: Excel monthly attendance fetch → directly group ya default numbers pe bhej deta hai
- Pattern reusable — bas import + button drop karke kahin bhi add kar sakte hain

### Verified
- ✅ `POST /api/whatsapp/send-file` (mode=group, Excel) → 200, file delivered
- ✅ `POST /api/whatsapp/send-file` (mode=default, default numbers) → 200, file delivered
- ✅ Frontend Staff Attendance UI — Excel/PDF/WhatsApp buttons render correctly
- ✅ `data-testid="att-share-whatsapp"` present

## v104.33.0 — wa.9x.design Direct File Upload (Refactor)
**Build date:** 2026-04-28

### Eliminated tmpfiles.org middleman for wa.9x.design provider
- **Before:** PDF → fetch → upload to tmpfiles.org (~3-5s) → public URL → /sendGroup with `url`
- **After:** PDF bytes → directly POST multipart to `/sendGroupFile` (1-2s, ~70% faster)

### New endpoints integrated (wa.9x.design)
- `POST /api/v2/sendMessageFile` — direct binary file upload to phone (multipart: phonenumber, file, caption, filename)
- `POST /api/v2/sendGroupFile` — direct binary file upload to group (multipart: groupId, file, caption, filename)
- Response: `{success, statusCode, data: {messageId, groupId/phonenumber, fileType}}`

### Helper-level provider routing (clean abstraction)
Both `_send_wa_message()` and `_send_wa_to_group()` now accept optional `pdf_bytes` param:
- **wa9x + pdf_bytes** → direct `sendGroupFile`/`sendMessageFile` (fast path)
- **360messenger + pdf_bytes** → tmpfiles.org upload internally → existing URL flow (fallback)
- **media_url only (no bytes)** → `/sendGroup`/`/sendMessage` with `url` field (unchanged)

### Callers refactored to pass bytes (no more inline tmpfiles)
- `POST /api/whatsapp/send-group` — fetches PDF bytes, passes to helper
- `POST /api/whatsapp/send-daily-report` — fetches PDF bytes, passes to helper
- `POST /api/whatsapp/send-party-ledger` — generates PDF in-memory, passes bytes directly
- `POST /api/whatsapp/send-pdf` — fetches bytes, passes to helper
- `POST /api/letter-pad/whatsapp` — already had bytes, now passes directly
- WhatsApp scheduler — passes generated PDF bytes directly

### Triple-Backend Parity
- `/app/backend/routes/whatsapp.py` — 4 helpers refactored, 5 endpoints updated
- `/app/desktop-app/routes/whatsapp.js` — added `fetchLocalPdfBuffer`, `sendWaFileMultipart`, `sendWaToGroup`, `uploadPdfBufferToTmpFiles`
- `/app/desktop-app/routes/letter_pad.js` — added `sendWaFileMultipart`, provider-aware routing
- `/app/local-server/routes/whatsapp.js` and `letter_pad.js` — copied identically (zero diff with desktop-app)

### Verified (curl + backend logs)
- `sendGroup` (text only) → 200 OK ✅
- `sendGroupFile` (PDF direct) → 200 OK with messageId ✅
- `sendMessageFile` (PDF direct) → 200 OK ✅
- groupId with `@g.us` preserved correctly (wa.9x.design fixed their sanitization bug)

## v104.32.0 — wa.9x.design Group Fetch Verified + Dynamic Provider Footer
**Build date:** 2026-04-28

### wa.9x.design WhatsApp Provider — User Verification PASSED
- Backend `GET /api/whatsapp/groups` correctly fetches groups from wa.9x.design's `/api/v2/groupChat/getGroupList` endpoint and returns the group list "Navkar Agro" (id `120363424861931093@g.us`, size 2)
- Settings → Messaging tab dropdown "Default WhatsApp Group" populates with "Navkar Agro" — verified via Playwright
- Provider toggle: 360messenger ↔ wa.9x.design works; selected provider shown with orange highlight + tick

### Code Simplification — Identical Response Shape Across Providers
- User confirmed both 360messenger AND wa.9x.design return identical JSON shape: `{success, statusCode, data: {groups: [...]}}`
- Removed defensive shape-detection logic (Array.isArray, `.list` fallback, separate success-flag check) across all 3 backends
- Now uses single line: `groups = result.data.groups` (with safe `.get()` defaults)
- Files updated (parity maintained): `/app/backend/routes/whatsapp.py`, `/app/desktop-app/routes/whatsapp.js`, `/app/local-server/routes/whatsapp.js`
- Regression curl test: `Navkar Agro` group still fetches successfully ✅

### Dynamic Provider Footer (UX Fix)
- Footer text below WhatsApp section was hardcoded to "360Messenger API use hota hai | 360messenger.com"
- Fixed: footer now dynamically reads `waForm.wa_provider`. Shows "wa.9x.design API use hota hai | wa.9x.design" when wa9x is selected, otherwise 360messenger
- File: `/app/frontend/src/components/settings/MessagingTab.jsx` (lines 332-338)

## 🆕 v104.30.0 — Letter Pad Productivity Suite (3 features)
**Build date:** 2026-04-26

### Save Drafts (CRUD)
- New endpoints: `GET/POST/PUT/DELETE /api/letter-pad/drafts`
- Storage: Python → `db.letter_drafts` (MongoDB); Node → `database.data.letter_drafts` array (JSON+SQLite). Added `letter_drafts` to `ARRAY_COLLECTIONS` in both Node `sqlite-database.js` files.
- Each draft = `{id (uuid), title, ref_no, date, to_address, subject, references, body, created_at, updated_at}`
- Validation: empty body+empty subject → 400 "Khaali draft save nahi ho sakti"
- PUT preserves the original title when title not in payload (regression-tested)
- Frontend: "Save Draft / Update Draft" button (changes label based on `activeDraftId`), "Drafts" sidebar dialog with click-to-load and Trash icon

### Templates Library
- New endpoints: `GET /api/letter-pad/templates` (lightweight list) + `GET /api/letter-pad/templates/{id}` (full content)
- 8 hardcoded English templates for rice millers (kept identical across 3 backends — `/app/backend/utils/letter_pad_templates.py` and `/app/{desktop-app,local-server}/routes/letter_pad_templates.js`):
  - bank_statement, supplier_reminder, agent_dispute, govt_inquiry, truck_owner_notice, paddy_quality, noc_request, gst_compliance
- Frontend: "Templates" button → grid dialog with category badge + lucide icon per template; clicking applies subject/to/references/body and resets `activeDraftId`

### WhatsApp Share
- New endpoint: `POST /api/letter-pad/whatsapp` with `{letter, mode: 'phone'|'group'|'default', phone?, group_id?, caption?}`
- Backend internally renders the letter PDF (in-memory, via shared `_build_letter_pdf_bytes` / `renderLetterPdfBuffer`), uploads to `tmpfiles.org`, then sends via existing 360Messenger helpers (`sendMessage` for phone, `sendGroup` for groups)
- Caption format: `*Company Name*\nSubject: ...\n<custom note OR "Please find attached letter.">\n\n— Company`
- Frontend: two new buttons in compose footer — "Phone" (single 📱) + "Group" (📥 broadcast). Both open `wa-dialog` with phone/group_id input + optional caption textarea
- Reuses existing 360Messenger settings from `db.settings.whatsapp` (api_key, country_code, default_numbers, default_group_id) — no new config

### Triple-Backend Parity
- All 3 backends updated identically: `/app/backend/routes/letter_pad.py`, `/app/desktop-app/routes/letter_pad.js`, `/app/local-server/routes/letter_pad.js`
- Node backends inline the 360Messenger HTTP helpers (no whatsapp.js cross-import) to keep letter_pad.js self-contained
- PDF rendering refactored into reusable `renderLetterPdf()` (returns PDFKit doc stream) + `renderLetterPdfBuffer()` (returns Buffer for upload)

### Test Coverage (iteration_204.json)
- 23/23 backend tests passed (100%)
- All frontend UI elements verified by Playwright
- Test file: `/app/backend/tests/test_letter_pad_features_iteration204.py`

## 🎨 GLOBAL TYPOGRAPHY (v104.28.42-44)
**Two-font system applied across screen + PDF + Excel** — single CSS rule + monkey-patches, no per-component edits:
- **Inter** (loaded weights 400-800) — UI text, headings, buttons, navigation, tabs, body copy, Excel cells (default + via Font())
- **JetBrains Mono** (loaded weights 400-600) — Numbers/codes: KPI values, ₹ amounts, QNTL/BAG counts, dates, version badges, PDF banner values

### Screen (CSS auto-detection in `index.css`)
- `text-lg font-bold` (KPI value pattern) → JetBrains Mono with `tabular-nums`, `letter-spacing: -0.015em`
- Exception: `text-amber-/cyan-/purple-/violet-` colored `text-lg font-bold` (semantic section labels) → Inter
- `text-2xl/3xl/4xl font-bold` & all `h1-h6` → Inter with display tracking (`-0.025em`)
- `text-xl font-bold` → Inter with `-0.015em` tracking
- All `<td>` cells get `font-variant-numeric: tabular-nums`
- Buttons, tabs, nav, dialog/card titles → forced Inter

### PDF (ReportLab + PDFKit)
- Body text → **Inter** (8 .ttf files bundled in `/app/{backend,desktop-app,local-server}/fonts/`)
- KPI banner labels → Inter Semibold
- KPI banner values → **JetBrains Mono Bold** with mixed-font Paragraph rendering
- Python: `register_hindi_fonts()` aliases `FreeSans` → Inter so legacy code paths inherit; `JetBrainsMono` family registered for explicit use
- Node.js: `F('mono'|'mono-bold')` returns `AppMono`/`AppMonoBold` resolved from JetBrainsMono TTFs

### Excel (openpyxl + ExcelJS)
- **Python (openpyxl)**: `Font.__init__` monkey-patched to default `name='Inter'`, AND `Workbook.__init__` patched to replace `_fonts[0]` (default font) + `Normal` named style font with Inter. Result: 100% Inter coverage in cells (verified 42/42, 58/58, 29/29 cells).
- **Node.js (ExcelJS)**: 24 route files bulk-updated via sed — `font: { ...` and `.font = { ...` patterns now include `name: 'Inter'`.
- Cells that need monospace numbers explicitly pass `name: 'JetBrains Mono'`. Recipient systems without Inter fall back to system default (Calibri) gracefully.

Result: Stripe/Plaid/Linear-grade premium typography across screen + PDF + Excel. Dark + Light themes both inherit automatically.

## 🚨 CRITICAL: TRIPLE-BACKEND PARITY DISCIPLINE
**ANY change made to API routes, PDF generation, Excel export, or business logic MUST be applied to ALL three backends**:
- `/app/backend/` — Python FastAPI (web preview, MongoDB)
- `/app/desktop-app/` — Node.js Express (Electron desktop app, JSON/SQLite) — **THIS IS WHAT THE USER ACTUALLY USES IN PRODUCTION**
- `/app/local-server/` — Node.js Express (LAN host, JSON/SQLite)

## ⚠️ LESSON: Stay strictly within scope
**v104.28.35**: User asked for "PDF and Summary report mein hi sirf changes" — but I went and changed the on-screen Dashboard endpoint + frontend JSX too. Reverted. ALWAYS confirm scope when user says "sirf X mein" — don't refactor adjacent code paths even if they share the same logic. PDF and screen are TWO different surfaces, treat them independently.

## Recent Fixes (Apr 2026) — v104.29.1

### Letter Pad fixes — Letterhead, GSTIN/Phone/Email, AI Quality
- **User report**: "letterhead bahut ganda aaraha hai. GST number etc jaisa maine letter upload kiya tha waisa nai aaraha hai. AI improve aur generate bhi kaam nahi kar raha aachi se."

**3 fixes shipped**:
1. **Letterhead Settings expanded** — All letterhead fields (GSTIN, Mobile 1, Mobile 2, Email, Address, License No.) are now editable from the Letter Pad Settings dialog. Previously only signature_name + designation were configurable.
2. **PDF layout improved** to exactly match user's reference image:
   - Company name reduced from 28pt → 22pt (was too big)
   - Tighter spacing between header rows
   - License No. now centered below the red divider (matches reference)
   - Letterhead returns dynamic content_top_y so body starts immediately below — no fixed gaps
3. **AI prompts strengthened** for cleaner output:
   - No preamble ("Here is your letter:" suppressed)
   - No sender's company info hallucination (letterhead handles that)
   - No "Yours faithfully" (signature is added separately)
   - Fixed Gemini 2.5 Flash truncation: maxOutputTokens 1024 → 2048, `thinkingBudget: 0` (otherwise thinking tokens ate the budget mid-letter)
   - Letters end with "Thanking you." consistently

**Verified live**: AI Vision 100% confidence — all 16 letterhead fields visible in correct order (GSTIN, ॐ NAVKAR AGRO, Mob×2, address, email, red divider, License No, Ref/Date, To, Subject, body, Yours faithfully + Aditya Jain + Proprietor + M/s NAVKAR AGRO). AI generate produces clean 100-word letter, no truncation, no preamble. AI improve removes "Sir, I am writing to ask..." → "I am writing to request my account statement..." cleanly.

## Recent Fixes (Apr 2026) — v104.29.0

### NEW FEATURE: Company Letter Pad (Milling → Company Letter Pad subtab)
- **User request**: Letter generator/editor with company letterhead, downloadable as PDF or MS Word. Optional AI assistant for letter generation/improvement/translation. Each miller (multi-tenant SaaS scenario) adds their own free Gemini API key OR paid OpenAI key.

**3 backends synced**:
- Python (`/app/backend/routes/letter_pad.py`)
- Node.js Desktop App (`/app/desktop-app/routes/letter_pad.js`)
- Node.js LAN (`/app/local-server/routes/letter_pad.js`)

**Endpoints**:
- `GET /api/letter-pad/settings` — return signature + AI key presence (never exposes actual keys)
- `PUT /api/letter-pad/settings` — save signature_name, designation, ai_enabled, gemini_key, openai_key
- `POST /api/letter-pad/ai` — proxy to Gemini 2.5 Flash OR GPT-5-mini using miller's stored key. Modes: generate / improve / translate. Free Gemini = 1500 letters/day per miller.
- `POST /api/letter-pad/pdf` — generate ReportLab/PDFKit PDF with the Navkar-style letterhead (GSTIN top-left, ॐ + company name centered red, address+email below, phone right, red divider, Ref/Date row, To/Subject/Body, signature block bottom-right)
- `POST /api/letter-pad/docx` — same letterhead in editable Word format (python-docx in Python, docx npm in Node.js)

**Frontend** (`/app/frontend/src/components/LetterPadTab.jsx`):
- Form: Ref. No., Date (auto-today DD-MM-YYYY), To Address (multiline), Subject, References, Body (large textarea)
- 3 AI buttons in body header: **AI Generate** (emerald), **Improve** (blue), **Translate** (purple) — disabled when AI off
- 2 download buttons: Download PDF (rose), Download Word (.docx) (blue)
- Settings dialog: signature name + designation, AI toggle, provider picker (Gemini Flash / GPT-5-mini), key inputs (password type)
- AI dialog: target language picker (English/Hindi/Odia for translate), input textarea, Run AI button

**Multi-tenant cost model**: Each miller adds own FREE Gemini key from Google AI Studio (2-min setup, 1500 letters/day forever free). If they prefer GPT-5-mini, they paste own OpenAI key. Software author pays ₹0.

**Verified live**: PDF generated correctly (AI Vision 95% confidence: NAVKAR AGRO red bold, address centered, red divider, Ref/Date row, signature block); DOCX downloads as 37KB; settings GET/PUT returns `has_gemini_key:false` initially. Lint clean, all 3 backends started cleanly.

## Recent Fixes (Apr 2026) — v104.28.44

### Excel Typography Upgrade — Inter as default in ALL Excel exports
- **Python (openpyxl)**: Monkey-patched `Font.__init__` and `Workbook.__init__` in `export_helpers.py`. `Workbook` patch replaces `_fonts[0]` (the default font slot) AND `Normal` NamedStyle with Inter. Eager imports added in 12 backend route files via `from utils import export_helpers as _eh_default_font` to ensure patches fire before any Font() / Workbook() use.
- **Node.js (ExcelJS)**: Bulk-updated 24 route files using sed — every `font: { ... }` / `.font = { ... }` now includes `name: 'Inter'`.
- **Verified**: 100% Inter coverage in tested Excel files — `truck-owner-excel` (42/42 cells), `truck-payments-excel` (58/58), `agent-payments-excel` (29/29). Lint clean.

## Recent Fixes (Apr 2026) — v104.28.43

## 🚨 CRITICAL: TRIPLE-BACKEND PARITY DISCIPLINE
**ANY change made to API routes, PDF generation, Excel export, or business logic MUST be applied to ALL three backends**:
- `/app/backend/` — Python FastAPI (web preview, MongoDB)
- `/app/desktop-app/` — Node.js Express (Electron desktop app, JSON/SQLite) — **THIS IS WHAT THE USER ACTUALLY USES IN PRODUCTION**
- `/app/local-server/` — Node.js Express (LAN host, JSON/SQLite)

## ⚠️ LESSON: Stay strictly within scope
**v104.28.35**: User asked for "PDF and Summary report mein hi sirf changes" — but I went and changed the on-screen Dashboard endpoint + frontend JSX too. Reverted. ALWAYS confirm scope when user says "sirf X mein" — don't refactor adjacent code paths even if they share the same logic. PDF and screen are TWO different surfaces, treat them independently.

## Recent Fixes (Apr 2026) — v104.28.43

### PDF Typography Upgrade + Section Title Hierarchy
- **PDF**: Inter + JetBrains Mono now embedded in every PDF report (8 .ttf files bundled across all 3 backends)
- **PDF banner**: KPI labels in Inter, values in JetBrains Mono Bold via mixed-font Paragraph rendering. Confirmed via AI Vision analysis: "values exhibit monospace characteristics... uniform width digits" (95% confidence).
- **Section title hierarchy** standardized via CSS:
  - H1 / page titles (text-2xl/3xl/4xl font-bold) → Inter, `-0.025em` tracking, `line-height: 1.2`
  - H2 / section titles (text-xl font-bold) → Inter, `-0.015em` tracking, `line-height: 1.3`
  - H3 / KPI values (text-lg font-bold) → JetBrains Mono with tabular alignment
  - Buttons/tabs/nav → Inter (forced override)
- **Fonts bundled**: `Inter-Regular/Medium/SemiBold/Bold/Italic.ttf` + `JetBrainsMono-Regular/Medium/Bold.ttf` in all 3 backend `fonts/` dirs
- **Theme**: Dark theme + Light theme both inherit the new typography automatically

### Verified
- PDFs: `pdfplumber` confirms 5 fonts embedded — Inter-Regular, Inter-Bold, Inter-Italic, JetBrainsMono-Bold (+ Helvetica residual)
- AI Vision: confirmed mixed-font rendering on KPI banner (95% confidence)
- Frontend screenshot: page title in display Inter, KPI values in JetBrains Mono, tabs/nav in Inter — clean hierarchy
- Lint clean, all 3 backends synced

## Recent Fixes (Apr 2026) — v104.28.42

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

## Recent Fixes (Apr 2026) — v104.28.41

### Recalculate Entries: Now syncs Pvt Purchase + Sale + BP Sale + DC Delivery ledgers too
- Building on v104.28.40, recalc now ALSO sanity-syncs ledger amounts for:
  - **Pvt Purchase** (`purchase_vouchers`): `purchase_voucher:` (=total), `purchase_voucher_adv:`, `purchase_voucher_adv_cash:` (=advance), `purchase_voucher_cash:`, `purchase_truck_cash:` (=cash_paid), `purchase_voucher_diesel:`, `purchase_truck_diesel:` (=diesel_paid)
  - **Sale Truck** (`sale_vouchers`): `sale_voucher:` (=total), `sale_voucher_adv:`, `sale_voucher_adv_cash:` (=advance), `sale_voucher_cash:`, `sale_truck_cash:` (=cash_paid), `sale_voucher_diesel:`, `sale_truck_diesel:` (=diesel_paid)
  - **BP Sale** (`bp_sale_register`): `bp_sale:` (=total), `bp_sale_adv:`, `bp_sale_adv_cash:` (=advance), `bp_sale_cash:` (=cash_paid), `bp_sale_diesel:` (=diesel_paid)
  - **DC Delivery** (`dc_deliveries`): `delivery:`, `delivery_tcash:` (=cash_paid), `delivery_tdiesel:`, `delivery_jama:` (=diesel_paid), `delivery_depot:` (=depot_expenses)
- Logic: For each existing ledger, if its amount differs from the source document's value → **update** to correct value. If source value is 0 → **delete** the stale ledger. Does NOT auto-create missing ledgers (safe — only re-syncs amounts).
- Files: `/app/backend/routes/entries.py`, `/app/desktop-app/routes/entries.js`, `/app/local-server/routes/entries.js`

### Verified
- Live test: corrupted purchase_voucher ledger to ₹99,999 → recalc fixed to ₹5,000 ✓
- Live test: corrupted sale_voucher ledger to ₹99,999 → recalc fixed to ₹35,000 ✓
- All 3 backends synced; lint clean

## Recent Fixes (Apr 2026) — v104.28.40

### Settings → Recalculate Entries: now globally syncs ALL truck ledger amounts
- **User report**: *"Recalculate entries mai click karne pai entire software mai jo jaisa set kiya hai amount kahi b uske hisab hisab hai kuch b uppner niche ho wo click karte hai sab global auto recalculate kar dena chahiye chahe wo koi b payment ho kis type ka bhi ho wrna iska matlab kya diya"*
- Earlier: button only re-derived entry-level fields (mill_w, p_pkt_cut, etc.). Did NOT touch ledger amounts → so if a rate changed but ledger didn't sync, it stayed stale.
- **Now (v104.28.40)**: button does TWO passes:
  1. Recalculate every entry's auto-fields (mill_w, p_pkt_cut, moisture_cut, cutting, final_w, qntl)
  2. **Sync every `truck_entry:` jama ledger** based on current `truck_payments.rate_per_qntl × final_qntl`:
     - If rate>0 + ledger missing → **auto-create**
     - If rate>0 + ledger has wrong amount/desc → **auto-update**
     - If rate=0 + ledger exists → **auto-delete** (per v104.28.39 lifecycle rule)
- Toast shows breakdown: "X entries • Y ledgers banaye • Z ledgers update • W stale ledgers hataye"
- Files: `/app/backend/routes/entries.py`, `/app/desktop-app/routes/entries.js`, `/app/local-server/routes/entries.js`, `/app/frontend/src/components/settings/DataTab.jsx`

### Verified
- **Live test 1**: corrupted a ledger amount to ₹999 → recalc restored to ₹1225 (49Q × ₹25) ✓
- **Live test 2**: injected stale ₹7777 ledger on rate=0 entry → recalc removed it ✓
- Lint clean across all changed files

## Recent Fixes (Apr 2026) — v104.28.39

### 3 changes — Cap Transparency + Move-to-Pvt Quick Action + Truck Ledger Lifecycle Fix

**1. Cap Transparency Badge + Move-to-Pvt button (Agent Payments table)**
- When `tp_weight > target × (1 + cutting%/100)`, the row now shows a **"Capped @ X Q"** amber badge with tooltip explaining the cap
- New orange **ArrowRightCircle** action button shown only when `excess_weight > 0` — opens a one-click "Move to Pvt Paddy Purchase" dialog pre-filled with mandi/agent/extra_qntl
- Backend fields added to `AgentPaymentStatus` model: `cap_qntl` (the cap value) + `is_capped` (bool)
- Files: `Payments.jsx`, `models.py`, `payments.py` (Python), `payments.js` (×2 Node.js)

**2. Truck Ledger Lifecycle Fix — rate=0 means NO ledger**
- **User report**: *"jiska 0 hai wo ledger nahi banna chahiye, after amount set hi ledger banega apne aap"*
- New rule: `truck_entry:` jama ledger is created **iff** rate_per_qntl > 0
  - On **mill_entry create/update**: skip ledger creation if rate=0 (was creating ₹0 ledger before)
  - On **set-rate from 0 to >0**: auto-CREATE the ledger (was only updating existing)
  - On **set-rate from >0 to 0**: auto-DELETE the ledger (was leaving stale 0-amount entry)
- Files: `entries.py`, `payments.py` (Python), `sqlite-database.js`, `payments.js` (×2 Node.js)

**3. Cleanup endpoint for accidentally cascaded rates**
- **User report**: *"sabka by default 32rs ke hisab se ledger ban gaya hai wo thik karo"*
- New endpoint: `POST /api/truck-payments/reset-unpaid-rates` (admin only)
- Resets rate_per_qntl=0 for all truck_payments where paid_amount=0, and removes their `truck_entry:` ledger entries
- Safely skips trucks that have any payment trail (preserves user's actual data)
- Mirrored across all 3 backends

### Verified
- **Live curl test**: set rate=15 → ledger auto-created ₹735 (49Q × ₹15) ✓; set rate=0 → ledger deleted ✓; set rate=25 → ledger re-created ₹1225 ✓
- **Lint**: clean across all changed files
- **8/8 commission cap regression tests** pass
- **Screenshot**: agent payments tab shows orange "Move to Pvt" button when excess_weight > 0; capped badge shown only when cap is active

## Recent Fixes (Apr 2026) — v104.28.38

### Auto-Cap Agent Commission at (Target + Cutting%) — Excess goes to Pvt Purchase
- **User scenario**: Agent ka contract = govt target + 5% cutting (e.g. 5000 + 250 = 5250 Q). Agar agent ne 5500 deliver kiya, extra 250 Q "Move to Pvt Purchase" hota hai. Lekin abhi tak agent commission unke pure 5500 par calculate ho raha tha. User: *"par jo 250 qntl paddy hai usmai 5% cutting nahi hoga kyuki wo agent se pvt purchase hua wo kaise karenge?"*
- User chose **Auto-cap (option a)** + **Bilkul nahi** for extra Q (no base_rate, no cutting_rate on the excess).

- **Solution**: New helper `capped_tp_for_commission(tpw, target_qntl, cutting_pct)` returns `min(tpw, target × (1 + cutting%/100))`. Used everywhere agent commission is computed.
  - Helper files: `/app/backend/utils/commission.py`, `/app/desktop-app/utils/commission.js`, `/app/local-server/utils/commission.js`.
  - Routes updated:
    - **Python**: `payments.py` (`/api/agent-payments`, `/mark-paid`, agent excel export, agent pdf export, `/pay` jama entry); `entries.py` (`/api/mandi-targets/summary`); `exports.py` (Dashboard PDF + Summary PDF agent calc).
    - **Node.js Desktop App** (`/app/desktop-app/routes/`): same 3 files updated.
    - **LAN Local Server** (`/app/local-server/routes/`): same 3 files updated.

- **Math** (user's exact scenario, target=5000, cut=5%, base=10/Q, cut_rate=5/Q):
  - **Before** (uncapped, agent delivers 5500): `5500 × 10 + (5500 × 5%) × 5 = ₹56,375` (over-paid)
  - **After** (capped at 5250): `5250 × 10 + (5250 × 5%) × 5 = ₹53,812.50` ✓
  - **Saved**: ₹2,562.50 per cycle of over-delivery

- **Verified**:
  - Python helper: 8/8 pytest cases pass (`/app/backend/tests/test_commission_cap.py`)
  - JS helper: 6/6 sanity checks pass via `node -e`
  - All endpoints (200 OK): `/api/agent-payments`, `/api/mandi-targets/summary`, `/api/truck-payments`, `/api/export/summary-report-pdf`, `/api/export/dashboard-pdf`
  - Lint: clean across all changed files.

- **Edge cases handled**:
  - `target=0` (no target set) → no cap applied, returns full TP
  - `cutting=0` → cap = target itself
  - Falsy/string inputs → gracefully coerced

## Recent Fixes (Apr 2026) — v104.28.37

### Critical Bug Fix + Agent Cutting KPI on Reports
- **User report**: Payments tab error log + Summary report PDF crashed:
  ```
  TypeError: Cannot read properties of undefined (reading 'find')
    at SqliteDatabase._getMandiDefaultBhadaRate (sqlite-database.js:1107)
    at SqliteDatabase.getTruckPayment (sqlite-database.js:1121)
  ```

- **Root cause**: `_getMandiDefaultBhadaRate()` was reading `this.data.mill_entries` but the in-memory collection key is `entries` (not `mill_entries`). Both Summary Report PDF and Truck Payments tab call `getTruckPayment()` which depends on this. Fixed in 4 files by switching to `(this.data.entries || []).find(...)` and adding null-safety on `mandi_targets`:
  - `/app/desktop-app/sqlite-database.js`
  - `/app/desktop-app/main.js` (legacy JSON DB class)
  - `/app/local-server/sqlite-database.js`
  - `/app/local-server/server.js`

- **AGENT CUTTING KPI added** to KPI hero banner (between TARGETS and ACHIEVED) in:
  - **Dashboard PDF** (Python `/app/backend/routes/exports.py` + Node.js `/app/desktop-app/routes/exports.js` + LAN `/app/local-server/routes/exports.js`)
  - **Summary Report PDF** (same 3 backends)
  - Value = `Σ(target_qntl × cutting%)` per mandi, e.g. Kesinga 500 Q × 5% = **25 Q** total agent cutting
  - Color: teal (#0F766E)
  - Reuses existing computation in the targets table — single source of truth

- **Verified**:
  - `GET /api/truck-payments?kms_year=2025-2026` → 200 OK (was 500 TypeError) ✓
  - `GET /api/export/summary-report-pdf` → KPI banner now shows: `PADDY IN | PADDY USED | TARGETS 500 Q | AGENT CUTTING 25 Q | ACHIEVED 135.2% | GRAND TOTAL | PAID | BALANCE DUE` ✓
  - `GET /api/export/dashboard-pdf` → KPI banner shows: `PADDY IN | PADDY USED | AVAILABLE | RICE PRODUCED | TARGETS 500 Q | AGENT CUTTING 25 Q | ACHIEVED 676 Q (135.2%) | PENDING 0 Q` ✓
  - Math correct: 500 × 5% = 25 Q ✓
  - Lint: clean.

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
