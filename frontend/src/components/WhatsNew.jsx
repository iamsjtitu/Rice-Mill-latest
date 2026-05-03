import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Gift, ArrowRight, Check } from "lucide-react";

import { APP_VERSION } from "@/utils/constants-version";

const CHANGELOG = [
  {
    version: "104.44.60",
    date: "Feb 17, 2026",
    title: "v104.44.60 — 🎯 Pending = Statement closing + Double-count dedupe",
    items: [
      { type: "fix", text: "🎯 **Critical fix — Double-count removed** — Cash Book payments cash_transactions me 2 jagah store hote hain (manual + auto_ledger mirror), is wajah se Received aur expanded rows me ₹1L ke ₹2L dikh rahe the. Ab dedupe by (date+description), prefer auto_ledger entry. PKA me sirf ₹1L, KCA me sirf ₹94,318.18 dikhega." },
      { type: "improvement", text: "🎯 **Pending = Balance + Premium − Received** — ab Pending column ka value Party Statement ke closing balance se exactly match karta hai. ALL: ₹2,57,500 (= 5,27,500 − 75,681.82 premium − 1,94,318.18 cash). PKA me premium nahi (sirf billed), KCA me premium add hota hai." },
      { type: "improvement", text: "🌐 **Triple-Backend Parity** — Python + Node Desktop + Node LAN — teeno backends me identical dedupe + premium logic." },
    ],
  },
  {
    version: "104.44.59",
    date: "Feb 17, 2026",
    title: "v104.44.59 — 💯 Whole-payment FIFO + PKA payment columns",
    items: [
      { type: "fix", text: "💯 **Whole-Payment FIFO** — Pehle ek payment FIFO me split ho jata tha (e.g. ₹1L → ₹1L bucket cap reach hone par next 57.5K dikhata tha). Ab har payment uski **full amount me dikhega** — sahi payment trail. ₹1,00,000 entry ki to ₹1,00,000 hi dikhega, NA 57,500." },
      { type: "feature", text: "📋 **PKA tab me bhi Last Pmt / Received / Pending columns** — Pehle sirf ALL/KCA me dikhte the. Ab PKA me bhi visible — billed-only payments ka tracker." },
      { type: "improvement", text: "🔵 **Negative Pending = Overpaid** — Agar party ne extra paisa de diya, Pending column me negative value blue color me dikhayega (e.g. PKA: −42,500 means overpaid). Tooltip 'Overpaid' bata dega." },
      { type: "improvement", text: "📊 Excel + PDF exports me bhi same — Last Pmt / Received / Pending columns sabhi modes me, whole payments shown. Triple-backend parity (Python + Node Desktop + LAN)." },
    ],
  },
  {
    version: "104.44.58",
    date: "Feb 17, 2026",
    title: "v104.44.58 — 💸 Cash Book payments → BP Sales auto-link",
    items: [
      { type: "fix", text: "💸 **Major fix** — Cash Book me jo party payments record karte hain (txn_type=jama with party category), wo ab automatically BP Sale Register me Last Pmt / Received / Pending columns me reflect honge. Pehle sirf local_party_accounts payment txns count hote the." },
      { type: "improvement", text: "👀 **3 payment columns ab hamesha visible** (PKA mode chhod ke). Even if no payment, '—' aur '0' dikhayega — predictable layout. Excel + PDF me bhi same." },
      { type: "improvement", text: "📋 **Party Statement** ab Cash Book payments + premium credit + sale debits sab ek hi ledger me dikhayega. Smart filter: Lab Test Premium / Sale Bhada / Sale entries skip honge taaki double-count na ho." },
      { type: "fix", text: "🔧 Triple-Backend Parity (Python + Node Desktop + LAN) — teeno backends me cash_transactions integration." },
    ],
  },
  {
    version: "104.44.57",
    date: "Feb 17, 2026",
    title: "v104.44.57 — 🧹 Payment columns + Layout cleanup",
    items: [
      { type: "fix", text: "🧹 **Premium-related entries skip in Received** — Lab Test Premium / Oil Premium ledger entries ab `Received` me count nahi honge (wo already Balance me adjusted hain). Sirf actual party payments dikhayenge. Triple-backend (Python + Node Desktop + LAN)." },
      { type: "improvement", text: "📏 **N/W Kg column hata** — frontend table + Excel + PDF teeno me sirf **N/W (Qtl)** column. Quintal hi standard hai." },
      { type: "fix", text: "🔧 **Action menu wrap fix** — table action buttons (Eye/Edit/Delete/Expand) ab single line me rahenge, vertically wrap nahi honge. `flex-nowrap` + `shrink-0` + 110px width set." },
    ],
  },
  {
    version: "104.44.56",
    date: "Feb 17, 2026",
    title: "v104.44.56 — 💰 Sales Ledger: Payment Tracking + Party Statement (A+B+C combo)",
    items: [
      { type: "feature", text: "💰 **Auto Payment Fetch (Option A)** — Har sale row me 3 naye columns: **Last Pmt** (last payment date), **Received** (cumulative payments via FIFO), **Pending** (after all payments + premium). PKA payments PKA portion ko, KCA payments KCA portion ko allocate hote hain." },
      { type: "feature", text: "📋 **Expandable Payment Rows (Option B)** — Sale ke saath ▸ button click karo to neeche nested payment rows: Date, Description, PKA/KCA badge, Amount. Sirf un sales pe button dikhega jin par payments aaye hain." },
      { type: "feature", text: "📄 **Party Statement (Option C)** — Naya purple `$` icon button: Party select karo, mode (ALL/PKA/KCA) chuno → A4 portrait PDF ya Excel download. Chronological ledger (Sale Dr + Payment Cr + Premium Cr) running balance ke saath. Tally-style format. Send button bhi WhatsApp/share-sheet ke liye." },
      { type: "improvement", text: "📊 **Excel + PDF exports** me bhi 3 naye columns (Last Pmt, Received, Pending) auto-show hote hain jab payments aate hain. PKA mode me hide (since billed-only view). Color-coded — Received cyan, Pending orange." },
      { type: "improvement", text: "🔤 **Description normalization** — Statement me legacy 'Pakka'/'Kaccha' descriptions automatically PKA/KCA me convert hote hain. Consistent abbreviation poore software me." },
      { type: "improvement", text: "🌐 **Triple-Backend Parity** — Python FastAPI + Node Desktop + Node LAN — teeno backends me identical API: `/api/bp-sale-register/with-payments`, `/api/bp-sale-register/party-statement`, `/api/bp-sale-register/export/statement-excel`, `/api/bp-sale-register/export/statement-pdf`." },
    ],
  },
  {
    version: "104.44.55",
    date: "Feb 17, 2026",
    title: "v104.44.55 — 📤 WhatsApp button: ab seedha PDF share karta hai",
    items: [
      { type: "feature", text: "📤 **WhatsApp button** ab summary text copy nahi karta — direct **PDF file** share karta hai. Mobile pe native share-sheet (WhatsApp / Telegram / Email select karke send), Desktop pe PDF download + WhatsApp Web open." },
      { type: "improvement", text: "🎯 BP Sale Register me click karte hi PDF generate hota hai aur Web Share API se WhatsApp pe attach hone ke liye taiyar — koi extra paste/manual step nahi." },
    ],
  },
  {
    version: "104.44.54",
    date: "Feb 17, 2026",
    title: "v104.44.54 — 🧹 PDF clean-up: Payment Summary line removed",
    items: [
      { type: "improvement", text: "🧹 BP Sale Register PDF se 'Payment Summary: Balance: ...' wala footer line hata di — ab table ke baad sirf 'Generated: ...' timestamp dikhega. Cleaner look." },
    ],
  },
  {
    version: "104.44.53",
    date: "Feb 17, 2026",
    title: "v104.44.53 — 💰 Smart Balance: Premium-adjusted + Last Column Position",
    items: [
      { type: "fix", text: "🎯 **KCA balance bug fix** — Pehle KCA tab me Pakka+Kaccha mila hua balance dikhata tha. Ab sirf **Kaccha portion - Advance** dikhega (advance hamesha kaccha side se kata jata hai). Triple-backend (Python + Node Desktop + LAN)." },
      { type: "feature", text: "💰 **Balance ab Premium-adjusted** — Balance column ka final value = `Balance + Premium`. Premium negative ho to balance kam, positive ho to badh jata hai. Ye actual pending amount hai jo party par baki hai oil quality test ke baad." },
      { type: "improvement", text: "📍 **Balance column LAST me move ki gayi** — ab Premium ke baad aati hai, taaki user dekhe: Total → Oil% → Diff% → Premium → Balance (final). Logical flow." },
      { type: "improvement", text: "🎨 **Tooltip + color** — Cell pe hover se 'Balance after Premium: X + Y = Z' calculation dikhega. Red bold for positive (party owes), green for zero/negative." },
      { type: "improvement", text: "📊 **Excel + PDF mai bhi same** — All 3 backends me identical column order + premium adjustment + amber background tint for Balance(final) column." },
    ],
  },
  {
    version: "104.44.52",
    date: "Feb 17, 2026",
    title: "v104.44.52 — 🧹 PKA Tab: Balance + Oil%/Diff%/Premium Columns Hidden",
    items: [
      { type: "improvement", text: "🧹 **PKA tab simplified** — Frontend table + header summary se Balance hata. Oil%, Diff%, Premium bhi sirf ALL/KCA me dikhayenge (PKA me hide). PKA = sirf billed portion, balance/oil-premium relevant nahi." },
      { type: "improvement", text: "📊 **Excel + PDF exports me bhi same** — `?gst_filter=PKA` se export karne pe Balance + Oil columns automatic hide hote hain. Triple-backend parity (Python, Node Desktop, Node LAN)." },
    ],
  },
  {
    version: "104.44.51",
    date: "Feb 17, 2026",
    title: "v104.44.51 — 📊 BP Sale Register: Professional Excel/PDF with PKA/KCA Breakdown",
    items: [
      { type: "feature", text: "📊 **By-Product Sale Register Excel/PDF** ab fully professional layout me. Mode-aware title banner: **[ALL]** (blue), **[PKA]** (emerald), **[KCA]** (rose) — direct dikhata hai konsa view export hua." },
      { type: "feature", text: "🟢🔴 **PKA/KCA Split Breakdown columns** — ALL view me split entries ke liye 'PKA Amt' (green-tinted) + 'KCA Amt' (rose-tinted) + 'Tax' (amber-tinted) alag-alag columns me dikhayenge. PKA/KCA single-mode views me single 'Amount' column." },
      { type: "improvement", text: "🎨 **Color-coded data cells** — Pakka cells green, Kaccha cells rose, Tax cells amber, Total cells dark blue/green bold. Headers white-on-blue with auto-filter + frozen pane (Excel)." },
      { type: "improvement", text: "🔍 **Filter summary subtitle** — Date range, Party, Vehicle, Bill From, Destination, RST jo filter active hain wo title ke neeche subtitle me dikhayenge." },
      { type: "fix", text: "🔤 **PKA / KCA hi likhna** — Excel/PDF me kahin bhi 'Pakka' ya 'Kaccha' full word nahi, sirf abbreviations (PKA / KCA). Ledger descriptions bhi update — Cash Book exports me bhi consistent." },
      { type: "improvement", text: "⚙️ **Triple-Backend Parity** — Same professional layout Python (FastAPI), Node Desktop (Electron), Node LAN (Express) — teeno backends me identical." },
    ],
  },
  {
    version: "104.44.50",
    date: "Feb 17, 2026",
    title: "v104.44.50 — 🎨 Light Theme Color Contrast Fix",
    items: [
      { type: "fix", text: "🎨 **BP Sale Register me white theme me numbers clear nahi dikhte the** — Pichla code sirf dark mode (text-emerald-400, text-rose-400, text-amber-400) ke liye optimized tha. White theme me ye colors faded look karte the. Ab dark+light dono ke liye separate variants:" },
      { type: "improvement", text: "  → 🟢 **Pakka amount/rate**: text-emerald-700 (light) / text-emerald-400 (dark)" },
      { type: "improvement", text: "  → 🔴 **Kaccha amount/rate**: text-rose-700 (light) / text-rose-400 (dark)" },
      { type: "improvement", text: "  → 🟡 **Tax**: text-amber-700 (light) / text-amber-400 (dark)" },
      { type: "improvement", text: "  → 🔵 **N/W(kg), Bags, Total**: same dual-tone treatment" },
      { type: "improvement", text: "✅ **font-semibold** added to amount/tax — readability boost. Total stays font-bold." },
    ],
  },
  {
    version: "104.44.49",
    date: "Feb 17, 2026",
    title: "v104.44.49 — 💯 Tax Column + Mode-Aware Amount/Rate Display",
    items: [
      { type: "feature", text: "💯 **Tax ka separate column** — Aapne kaha 'tax amount ka ek field dalo'. Done — Amount aur Total ke beech me **Tax** column add kiya. Agar tax_amount > 0 hai to amber color me dikhega, warna em-dash (—)." },
      { type: "fix", text: "🎯 **PKA tab me kaccha 0 nahi dikhega** — Pehle PKA me bhi Amount cell me 0 wala kaccha line dikhata tha. Ab PKA mode me sirf Pakka amount + rate, KCA mode me sirf Kaccha amount + rate. ALL me dono breakdown (split entries ke liye)." },
      { type: "improvement", text: "🎨 **Rate column same logic** — PKA: pakka rate only, KCA: kaccha rate only, ALL: dono stacked (split entries)." },
    ],
  },
  {
    version: "104.44.48",
    date: "Feb 17, 2026",
    title: "v104.44.48 — 💰 Split Entry Pakka+Kaccha+Tax Breakdown in ALL Tab",
    items: [
      { type: "fix", text: "💰 **ALL tab me amount breakdown** — Aapne kaha 'sirf pakka ka dikha raha hai ALL mai'. Ab split entries me Amount column 3-line stacked breakdown dikhata hai:" },
      { type: "improvement", text: "  → 🟢 **Pakka Amount** (green) — billed_amount" },
      { type: "improvement", text: "  → 🔴 **Kaccha Amount** (rose) — kaccha_amount" },
      { type: "improvement", text: "  → 🟡 **+ ₹Tax** (amber, small) — tax_amount (sirf agar GST hai)" },
      { type: "improvement", text: "📊 **Rate column bhi split** — Pakka rate (green) + Kaccha rate (rose) stacked. Hover karne pe Pakka/Kaccha clear ho jaata hai." },
      { type: "improvement", text: "🔗 **Hover tooltip** — Amount cell pe hover karne pe full breakdown text dikhega: 'Pakka ₹150,000 + Kaccha ₹370,000 + Tax ₹7,500 = ₹527,500'." },
      { type: "improvement", text: "🎯 **Total column unchanged** — Wahi pura total (Pakka + Kaccha + Tax) bold green me dikhata hai. Single-source-of-truth value." },
    ],
  },
  {
    version: "104.44.47",
    date: "Feb 17, 2026",
    title: "v104.44.47 — 🐛 VW Season Field Fix (Per-Trip Bhada Visibility)",
    items: [
      { type: "fix", text: "🐛 **Per-Trip Bhada me trip dikhega ab** — User ne complain kiya: 'ledger wagera bana par yaha nai aya'. Root cause: VW POST endpoint me `season` field hi nahi store ho raha tha (Python + Node dono me). Per-Trip panel apna fetch query me `season=Kharif` filter karta tha — VW me season=null tha, isliye filter mismatch → empty result." },
      { type: "fix", text: "✅ **Backend fix** — VW POST endpoint ab `season: data.get('season', 'Kharif')` set karta hai. Triple-backend parity: Python + Node Desktop + Node LAN, sab fixed." },
      { type: "fix", text: "🔄 **Existing data backfill** — Already-created VW entries with null season ko script ne update kar diya season='Kharif' set kar ke. Ek-time migration successful." },
      { type: "improvement", text: "🧪 **Verified**: GET /api/truck-owner/per-trip-all?kms_year=2026-2027&season=Kharif ab trip return karta hai (RST 2, OD19K2002, ₹3750 bhada, status=pending)." },
    ],
  },
  {
    version: "104.44.46",
    date: "Feb 17, 2026",
    title: "v104.44.46 — 🚛 Auto-Create VW Stub for Bhada Sync",
    items: [
      { type: "feature", text: "🚛 **Bhada save karte waqt VW auto-create hota hai ab** — Pehle agar Vehicle Weight entry nahi thi to bhada save hota tha par truck owner ledger me sync nahi hota tha (warning: 'Pehle Vehicle Weight entry banayein'). Ab Sale / Purchase / By-Product Sale me bhada > 0 ho aur VW exist nahi karta to system ek **stub VW entry** auto-create karta hai (rst_no, vehicle_no, party_name, trans_type, bhada, date — saare fields auto-fill). Truck owner ledger automatically sync ho jaata hai." },
      { type: "improvement", text: "📝 **Stub fields**: vehicle_no, party_name (= farmer_name fallback), trans_type (Sale=Dispatch, Purchase=Receive), date, kms_year, season, product, bhada. first_wt = 0 (placeholder). Status = 'pending' so user can edit later in VW tab to add actual weights." },
      { type: "improvement", text: "✅ **Toast info, not warning** — Auto-create successful → 'Vehicle Weight entry auto-create ho gayi (RST X). Weight add karna chahein to VW tab me edit karein.' Friendly, not blocking." },
      { type: "improvement", text: "🔧 **Idempotent** — Agar VW already exist hai (purana flow), to direct edit/PUT use hota hai (no auto-create). Auto-create sirf fresh case me trigger hota hai." },
    ],
  },
  {
    version: "104.44.45",
    date: "Feb 17, 2026",
    title: "v104.44.45 — 🛍️ Bags Mirror in Pakka + Kaccha (Single Stock Deduction)",
    items: [
      { type: "feature", text: "🛍️ **Bags input dono Pakka aur Kaccha section me dikhta hai ab** — Aapne bola: 'bags kaccha mai dala toh pakka mai aaja chahiye and pakka mai dala toh kaccha mai b copy ho jana chahiye'. Done — dono inputs same `form.bags` field se bound hain, kahin bhi type karenge dono me aa jaayega instantly." },
      { type: "feature", text: "📦 **Stock deduction sirf ek baar** — Backend logic me `form.bags` single field hai, gunny_bag_register se bhi sirf ek baar deduct hota hai. Aapka demand: 'stock se sirf ek hi bags se deduct hona chahiye' — already correct, mirror sirf UX/clarity ke liye hai." },
      { type: "improvement", text: "🏷️ **'(shared)' label** — Dono Bags inputs ke neeche ek small (shared) hint diya hai taaki user ko clear ho ki ye same physical bags hain, double-count nahi hote." },
    ],
  },
  {
    version: "104.44.44",
    date: "Feb 17, 2026",
    title: "v104.44.44 — 🎯 Row-Level Pakka/Kaccha Split (Option A)",
    items: [
      { type: "feature", text: "🎯 **Split entries ab row-level pe split hote hain** — Aapne kaha 'Pakka ka entries sirf PKA mai ana chahiye, Kaccha ka sirf Kaccha mai aur ALL mai KCA + PKA ka'. Ab S-006 SPLIT (₹3L pakka + ₹1.85L kaccha):" },
      { type: "improvement", text: "  → **PKA tab me**: ye entry dikhega lekin sirf pakka portion ke saath — 10000kg billed weight, ₹300,000 Amount, ₹315,000 Total (with 5% GST). Kaccha columns blank/0." },
      { type: "improvement", text: "  → **KCA tab me**: ye entry dikhega lekin sirf kaccha portion ke saath — 5000kg kaccha weight, 3700 rate, ₹185,000 Total. Pakka + GST columns blank/0." },
      { type: "improvement", text: "  → **ALL tab me**: full original entry (Amount ₹300K, Total ₹500K — sab data)." },
      { type: "fix", text: "🔧 **Excel/PDF/WhatsApp/Group sub-tab ke hisab se** — PKA pe ho aur Excel click karein → backend `_project_pakka_view()` apply hota hai before Excel generation. Sirf pakka portion data Excel me. KCA me sirf kaccha. Triple-backend parity (Python + Node Desktop + Node LAN)." },
      { type: "improvement", text: "🧪 **Live verified Rice Bran 2026-2027**: ALL=9 entries (Total ₹20,16,952), PKA=4 entries (Total ₹9,74,333), KCA=8 entries (Total ₹6,65,963). Split entries dono tabs me dikh rahe hain with portion-specific data." },
    ],
  },
  {
    version: "104.44.43",
    date: "Feb 17, 2026",
    title: "v104.44.43 — 🎯 KCA Strict: Pure Kaccha Only (No Split)",
    items: [
      { type: "fix", text: "🐛 **KCA tab me ab pakka entries nahi aaengi** — Pichla logic split entries dono tabs me dikhata tha. User ne kaha: 'KCA mai pakka ka b show ho raha hai wo nahi hona chahiye'. Ab KCA = **pure kaccha only** (billed_amount=0 AND gst_percent=0). Split entries (jo dono pakka+kaccha portion rakhte hain) ab sirf PKA me dikhte hain." },
      { type: "improvement", text: "📊 **Live test (Rice Bran)**: ALL=9, PKA=4 (split + full pakka), **KCA=5** (sirf S-001 to S-005, sab bill=0 gst=0). Pehle KCA=8 aata tha (galat). Ab sahi." },
      { type: "improvement", text: "🎨 **Tooltip text updated** — PKA: 'Pakka GST sales (split entries bhi)', KCA: 'Pure Kaccha sales (split nahi)' — clarity ke liye." },
    ],
  },
  {
    version: "104.44.42",
    date: "Feb 17, 2026",
    title: "v104.44.42 — 🏷️ ALL/PKA/KCA Sub-Tabs in Sale Register",
    items: [
      { type: "feature", text: "🏷️ **3 sub-tabs har product me** — Sale Register me Sale Book (Pvt Rice / Govt Rice etc) + BP Sale Register (Rice Bran, Husk, Phak, Awan, Broken etc), sab me ab **ALL | PKA | KCA** sub-tabs aate hain. Default ALL pe khulta hai. Aur PKA pe click karne par sirf Pakka GST sales (gst_type='gst' ya billed_amount>0), KCA pe sirf Kaccha sales dikh jaate hain." },
      { type: "feature", text: "🔄 **Split entries dono tabs me dikhte hain** — User example: MBOPL ko 150 qntl becha (100 pakka 5% GST + 50 kaccha) — split entry. Ab PKA tab me wo entry pakka portion ke saath dikhega, KCA tab me kaccha portion ke saath. Auto-split per `billed_amount`/`kaccha_amount` field." },
      { type: "fix", text: "🐛 **Excel/PDF/WhatsApp/Group sub-tab ke hisab se** — Aap PKA tab pe ho aur Excel click karenge to sirf Pakka entries Excel me aayenge. KCA tab → sirf Kaccha. ALL → sab. Backend `gst_filter=PKA|KCA` query param accepts." },
      { type: "feature", text: "🎨 **Color-coded tabs** — ALL=amber, PKA=emerald (green = GST/pakka), KCA=rose (kaccha). Compact pill design, single-row layout. data-testid: `sale-book-gst-tab-{ALL,PKA,KCA}` aur `bp-gst-tab-{ALL,PKA,KCA}`." },
      { type: "improvement", text: "🔧 **Triple-backend parity** — Python + Node Desktop + Node LAN, sab me `gst_filter` param consistent (Sale Book + BP Sale Register both)." },
    ],
  },
  {
    version: "104.44.41",
    date: "Feb 17, 2026",
    title: "v104.44.41 — 📤 Purchase + Paddy Register WhatsApp/Group + Filter Sync",
    items: [
      { type: "feature", text: "📤 **Purchase Vouchers me 4-icon export pattern** — PDF + Excel + WhatsApp + Group icons. WhatsApp icon: filtered vouchers ka summary text clipboard copy (Total Vouchers, Gross Purchase, Advance, Cash Paid, Balance + top-10 list). Group icon: SendToGroupDialog with PDF attach for WhatsApp groups." },
      { type: "feature", text: "📤 **Paddy Purchase me 4-icon export pattern** — Same pattern. WhatsApp summary me Total Qntl, Total Amount, Paid, Balance dikhta hai. Group share filter-aware PDF bhejta hai." },
      { type: "fix", text: "🐛 **Filter sync** — Purchase + Paddy export Excel/PDF me top-bar ke saare filters (date_from, date_to, party_name, season + Paddy ke liye mandi_name + agent_name) backend tak jaate hain. Pehle sirf kms_year + search jaata tha. Ab user agar 'date 1-15 May' aur 'mandi BERAR' set kare to Excel/PDF unhi entries ka aayega." },
      { type: "feature", text: "🔧 **Backend filter extension** — `/api/purchase-book/export/{excel,pdf}` me 3 naye params, `/api/private-paddy/{excel,pdf}` me 5 naye params. Triple-backend parity (Python + Node Desktop + Node LAN)." },
      { type: "improvement", text: "🎨 **Pura Register section consistent** — Sale Book, By-Product Sale, Purchase Vouchers, Paddy Purchase — sab me Excel + PDF + WhatsApp + Group 4-icon row. Transit Pass + Payments tab ke saath uniform feel." },
    ],
  },
  {
    version: "104.44.40",
    date: "Feb 17, 2026",
    title: "v104.44.40 — 📤 Sale Book WhatsApp/Group + Filter-Aware Export",
    items: [
      { type: "feature", text: "📤 **Sale Book me 4-icon export pattern** — Pakka Govt Rice / Pvt Rice (Sale Voucher tab) me ab Excel + PDF + WhatsApp + Group icons. WhatsApp icon: filtered vouchers ka summary text clipboard pe copy (Total Vouchers, Gross Sale, Advance, Balance + top-10 list). Group icon: SendToGroupDialog + filtered PDF attach for WhatsApp groups." },
      { type: "fix", text: "🐛 **Sale Book Excel/PDF filter sync** — Pehle export sirf `kms_year` + `search` query param leta tha. Ab pure top-bar filters (date_from, date_to, party_name, season) + category + searchQuery sab merge hote hain. Aap top-bar me 'date 1-15 May' aur 'party MBOPL' aur category 'Govt Rice / DC' set karenge → Excel/PDF unhi entries ka aayega." },
      { type: "feature", text: "🔧 **Backend filter support extended** — `/api/sale-book/export/excel` aur `/pdf` endpoints me 4 naye query params: date_from, date_to, item_category, party_name. Triple-backend parity: Python + Node Desktop + Node LAN." },
      { type: "improvement", text: "🎨 **Icon-only consistency restored** — Old generic 'Share via WhatsApp' button hata diya — replace ki with summary-style WhatsApp + Group icons (matches Transit Pass + Payments + BP Sale tabs)." },
    ],
  },
  {
    version: "104.44.39",
    date: "Feb 17, 2026",
    title: "v104.44.39 — 🐛 BP Sale Register Filter Fix + WhatsApp/Group Icons",
    items: [
      { type: "fix", text: "🐛 **Filter ke hisab se Excel/PDF download fix** — By-Product Sale Register me top-bar ke parent filters (date_from, date_to, party_name) export me **NAHI ja rahe the** — sirf local filter values jaate the. Ab parent + local merge hota hai (local always wins). Aapne agar top-bar me 'date 1-15 May' aur 'party MBOPL' choose kiya hai, ab Excel/PDF unhi entries ka aayega." },
      { type: "feature", text: "📤 **4-Icon export pattern** — Har product (Rice Bran, Husk, Phak, Awan, Broken etc) me Excel + PDF + WhatsApp + Group icons ab side by side. WhatsApp icon → summary text clipboard me copy (Total Entries, Amount, Balance + top-10 entries list). Group icon → SendToGroupDialog with PDF attach for WhatsApp groups." },
      { type: "improvement", text: "🎨 **Icon-only consistency** — Excel/PDF buttons ab icon-only h-8 w-8 style with color borders, matching Transit Pass + Payments tab pattern. Saaf, compact look." },
    ],
  },
  {
    version: "104.44.38",
    date: "Feb 17, 2026",
    title: "v104.44.38 — ⌨️ ESC/Backspace UX + Optional What's New Popup",
    items: [
      { type: "feature", text: "⌨️ **VW RST edit me ESC key** — Auto Vehicle Weight me RST edit karte waqt agar change nahi karna, ab ESC dabane se input revert ho jaata hai aur edit mode close ho jaata hai (auto RST badge wapas dikhta hai). Pehle bahar click karna padta tha." },
      { type: "feature", text: "🔕 **What's New popup ab AUTO nahi khulta** — Pehle har version update pe automatically dialog popup hota tha. Ab v-button (top-right me) pe ek **🔴 red pulse dot** dikhega jab koi nayi update aayegi. Aap chaho to click karke 'See what's new in this update' dekho, nahi to skip — apni marzi se." },
      { type: "feature", text: "⌨️ **Login page Backspace navigation** — Username daal ke Enter dabaaya to password me jaata tha. Ab agar password field empty hai aur Backspace dabaate ho, to wapas username pe focus aa jaayega — keyboard-only navigation smooth." },
    ],
  },
  {
    version: "104.44.37",
    date: "Feb 17, 2026",
    title: "v104.44.37 — 🚫 Mill Entry RST/TP Auto-Fill Hatay (Manual Entry Only)",
    items: [
      { type: "fix", text: "🚫 **Mill Entry me RST + TP fields ab BLANK rehte hain** form khulte hi. User ne kaha 'nayi entry form kholte hi automatic rst and tp no kyu aaraha hai bina type kiye?'. Ab aap manually type karenge, aur jab RST type karenge to existing VW se data autofill ho jaayega (wahi pehle wala flow). Auto-prefill v104.44.29 me add hua tha — confusing tha because user form khulte hi 18 dekha, lekin wo manually 32 dalna chahta tha." },
      { type: "improvement", text: "🎯 **Logic confirmation** — Auto Vehicle Weight ka next-RST badge max+1 logic use karta hai. Aap manually 32 save karenge → next 33, fir 34 aata jaayega. Junk RSTs (>9999 cap) ignored. Same Sale Voucher, Purchase, BP Sale, Paddy — sab me cross-collection scan." },
    ],
  },
  {
    version: "104.44.36",
    date: "Feb 17, 2026",
    title: "v104.44.36 — 🎯 Sahi Next-RST Logic + Tick Mark Block + 'Not Found' Spam Killed",
    items: [
      { type: "fix", text: "🎯 **Next-RST ab max+1 (sahi expectation)** — Aapne kaha 'sale me 15 dala toh VW me next 16 aana chahiye'. Pehle smallest-unused logic se 8 aata tha (gap fill). Ab logic max+1 hai with **outlier cap RST > 9999 ignore** — junk test data (jaise RST 77777) skip ho jaata hai. Aapke DB me sane RSTs: 1-7, 8, 10, 15, 16, 17 → next = 18 ✅" },
      { type: "fix", text: "🛡️ **Green tick mark (RST confirm) bhi block hota hai duplicate pe** — Auto Vehicle Weight me RST input ke saath green ✓ icon click karne par ya Enter key dabane par, agar RST duplicate hai to confirm nahi hota. Toast: '❌ RST 7 duplicate — confirm nahi ho sakta'. Pehle ye sirf 'Save First Weight' click pe block karta tha — ab RST confirm step pe HI block hota hai." },
      { type: "fix", text: "🔇 **'RST not found' spam silenced (3 components)** — DC Tracker (`RST not found in Vehicle Weight`), Oil Premium Register (`Sale nahi mili`) — dono me bhi fresh RST manually type karne par error toast aata tha. Ab 404 silently ignore (only 409 Purchase/Sale conflict + real errors show). v104.44.35 me sirf BP Sale me fix tha — ab teeno me." },
      { type: "feature", text: "🔄 **Triple-backend parity** — Same outlier cap (RST 9999, TP 99999) Python + Node Desktop + Node LAN sab me applied. `getNextRst()` helper consistent across all 3 stacks." },
    ],
  },
  {
    version: "104.44.35",
    date: "Feb 17, 2026",
    title: "v104.44.35 — 🧹 Smart Next-RST Logic + 'RST Not Found' Spam Fix",
    items: [
      { type: "fix", text: "🐛 **Stale High RST poisoning fix** — Aapne pichle test me kahin pe RST 77777 enter kiya tha (probably Mill Entry test data). Iske wajah se Auto Vehicle Weight + Mill Entries ka 'Next RST' badge **77778** dikhane laga tha! Fix: Logic ab `max+1` ke jagah **'smallest unused'** use karta hai — agar RSTs 1-7, 16, 77777 used hain, to next = 8 (pehla unused hole). Stale high values ab next-RST ko poison nahi karte." },
      { type: "fix", text: "🔧 **Collection name fix #2** — `vehicle_weight.py:_next_rst()` me `entries` (galat, exist nahi karta) aur `by_product_sale_vouchers` (galat) check ho rahe the. Fixed: ab `mill_entries` aur `bp_sale_register` correctly check hote hain." },
      { type: "fix", text: "🔇 **'RST not found' toast spam silenced** — By-Product Sale me fresh RST manually type karne pe har baar 'RST not found' error toast aata tha. Logic galat thi: agar RST fresh hai (VW me nahi), wo OK hai — user manually create kar raha hai. Ab 404 silently ignore hota hai (jaise Mill Entry me pehle se hai)." },
      { type: "feature", text: "🔄 **Triple-backend parity** — Same `smallest-unused` logic Python + Node Desktop + Node LAN, sab me applied. `getNextRst()` (vehicle_weight.js) ab cross-collection scan karta hai." },
      { type: "feature", text: "✅ **Verified hard block (v104.44.33+)** — Live test confirmed: VW me RST 7 type karke save karne pe save BLOCK ho jaata hai. Toast me complete details: 'By-Product Sale · MBOPL · 2026-04-29 · ...'. Aage se installed desktop app me bhi same dikhega — bas `yarn build:win` push karein." },
    ],
  },
  {
    version: "104.44.34",
    date: "Feb 17, 2026",
    title: "v104.44.34 — 🐛 React Error Fix + Live RST Sync + Inline VW Warning",
    items: [
      { type: "fix", text: "🐛 **'Objects are not valid as React child' error fix** — Mill Entry / Sale / Purchase me save time crash hota tha jab backend Pydantic validation fail karta tha. Root cause: FastAPI 422 response me `detail = [{type, loc, msg, input, url}, ...]` (array of objects) aata hai, jo toast.error me pass hone par React crash karta tha. Fix: Global axios interceptor ab in arrays ko auto-flatten karta hai readable string me — 'body.date: Field required · body.kg: Input should be a valid number'." },
      { type: "feature", text: "🔄 **VW me Next RST auto-refresh** — Agar aap Sale / Purchase / BP / Paddy / Mill Entry me manually RST 10 daalte hain, VW ka auto-next RST turant sync ho jaayega. Kaise: 1) Global axios interceptor saare RST-using collections ke mutations pe `rst-collection-changed` event fire karta hai, 2) VW form event sun ke `next-rst` endpoint refetch karta hai. Window focus pe bhi auto-refresh." },
      { type: "feature", text: "⚠️ **VW RST Edit me LIVE inline warning** — Auto Vehicle Weight me 'Edit' button click karke RST manually change karte waqt, agar RST kisi aur collection me maujood hai to turant amber/red warning dikh jaayega card header ke niche (without save pe click kiye). 'Duplicate: By-Product Sale (MBOPL · V.No S-002 · 2026-05-02)' jaisi details show hongi." },
    ],
  },
  {
    version: "104.44.33",
    date: "Feb 17, 2026",
    title: "v104.44.33 — 🛡️ GLOBAL Hard Block on Duplicate RST (VW Included)",
    items: [
      { type: "fix", text: "🛡️ **User demand — 'RST kabhi pai b duplicate nahi hona chahiye entire software mai'** — ab GLOBAL HARD BLOCK pura software me. VW Dispatch/Receive entry ko bhi blocker treat kiya (pehle 'natural source' bol ke INFO-only tha)." },
      { type: "feature", text: "🆕 **Auto Vehicle Weight me bhi check** — New VW entry me RST kisi bhi collection (sale, purchase, bp, paddy, mill entry, VW) me ho to toast error + save block. Edit VW dialog me bhi same protection, but edit karte waqt agar RST unchanged hai to skip (natural linked pairs preserve)." },
      { type: "improvement", text: "🔀 **Trans_type aware** — VW me context Dispatch/Sale me 'sale' aur Receive/Purchase me 'purchase' switch hota hai. Cross-type collision bhi detect." },
      { type: "improvement", text: "🔄 **Edit-safe logic** — 5 forms (Sale, Purchase, Paddy, BP Sale, Mill Entry) me edit karte waqt agar RST unchanged rahe to backend check skip — isse existing voucher-VW linked pairs fail nahi hote." },
      { type: "improvement", text: "🎨 **Block message enhanced** — Blocker message me VW trans_type bhi dikhta hai: 'Vehicle Weight (Dispatch(Sale)) · MBOPL · 2026-04-29' — clarity ke liye." },
    ],
  },
  {
    version: "104.44.32",
    date: "Feb 17, 2026",
    title: "v104.44.32 — 🔴 CRITICAL: RST Duplicate Check Collection Name Bug Fix",
    items: [
      { type: "fix", text: "🐛 **Root cause found** (user video): BP Sale me RST 7 save ho gaya bina warning, jabki 2 entries already existing thi (plus VW Dispatch)! Problem: `rst_check.py` galat collection names check kar raha tha — `by_product_sale_vouchers` aur `entries` (ye DB me exist hi nahi karte). Actual names hain `bp_sale_register` aur `mill_entries`. Isliye BP Sale aur Mill Entry duplicates **kabhi bhi** catch nahi hote the — sirf `sale_vouchers`, `purchase_vouchers`, `private_paddy`, `vehicle_weights` check ho rahe the." },
      { type: "fix", text: "✅ **Python backend fix** — `/app/backend/routes/rst_check.py` me `SALE_COLLECTIONS = ['sale_vouchers', 'bp_sale_register']` aur `PURCHASE_COLLECTIONS = ['purchase_vouchers', 'private_paddy', 'mill_entries']`. next-rst bhi same correct list use karta hai." },
      { type: "fix", text: "✅ **Node backend fix** — Desktop + LAN me `bp_sale_register` aur `entries` (Node uses 'entries' naming locally). Additionally fixed broken `require('./_helpers')` import (file doesn't exist) — ab inline `col()` helper use karta hai." },
      { type: "fix", text: "✅ **Frontend label fix** — `useRstCheck.jsx` me collection label map updated: `bp_sale_register: 'By-Product Sale'` aur `mill_entries: 'Mill Entry'` add kiye (legacy keys bhi preserve kiye backward-compat ke liye)." },
      { type: "fix", text: "🧪 **Verified via curl** — `GET /api/rst-check?rst_no=7&context=sale` ab 3 entries return karta hai: 2 bp_sale_register + 1 vehicle_weights. `hasBlocker=true` → save HARD BLOCK. Pehle sirf VW aata tha → hasBlocker=false → save proceed." },
    ],
  },
  {
    version: "104.44.31",
    date: "Feb 17, 2026",
    title: "v104.44.31 — 🛡️ Hard Block Duplicate RST + 📤 Transit Pass WhatsApp/Group Share",
    items: [
      { type: "fix", text: "🛡️ **Duplicate RST ab HARD BLOCK** — pehle confirm dialog tha (user 'Haan' click karke save kar sakta tha), ab save hone hi nahi dega. 5 forms me: Sale Book, Purchase Vouchers, Paddy Purchase, By-Product Sale, Mill Entry. VW (vehicle_weights) ki entries sirf INFO warning rahegi (natural source) — baki sab collision HARD BLOCK." },
      { type: "improvement", text: "📤 **Transit Pass Register me 4-icon export pattern** — Excel + PDF + WhatsApp + Group icons. WhatsApp: summary text clipboard pe copy ho jaayega (Total Entries, Bags, Qty, TP Weight + ≤10 entries list). Group: `SendToGroupDialog` with PDF attach — filter-aware broadcast to WhatsApp group." },
      { type: "fix", text: "🐛 **Transit Pass Excel/PDF filter fix** — Node backend (desktop + LAN) me mandi_name/agent_name query params properly forward ho rahe hain ab. Pehle sirf Python backend me fix tha." },
      { type: "improvement", text: "🎨 **Icon-only consistency** — Transit Pass ke Excel/PDF buttons bhi ab icon-only style me (h-9 w-9, color border) — Payments tab ke layout ke saath consistent." },
    ],
  },
  {
    version: "104.44.30",
    date: "Feb 17, 2026",
    title: "v104.44.30 — 🐛 CRITICAL FIX: Vehicle Weight RST Type Mismatch",
    items: [
      { type: "fix", text: "🐛 **Real root cause mila** — User ne video bheja: RST 7 sale me already tha (Vehicle Weight Dispatch entry MBOPL), fir bhi duplicate alert nahi aaya. 2 bugs the:" },
      { type: "fix", text: "🔴 **Bug 1: RST type mismatch** — `vehicle_weights` collection me `rst_no` INT (7) ke roop me store hota hai, aur mera `rst-check` regex string match (`^7$`) use karta tha. MongoDB regex sirf strings pe kaam karta hai → match fail → warning nahi dikhi. Fix: `$in: ['7', 7]` — dono variants match." },
      { type: "fix", text: "🔴 **Bug 2: vehicle_weights missing** — `vehicle_weights` collection rst-check scope me nahi tha. Core dispatch/receive RST data yahi se aata hai. Fix: Added separate `_search_vw()` with `trans_type` awareness (Dispatch(Sale) → sale bucket, Receive(Purchase) → purchase bucket)." },
      { type: "fix", text: "✅ **Verified** — RST 7 in sale context now correctly returns: `{collection: 'vehicle_weights', party: 'MBOPL', trans_type: 'Dispatch(Sale)', date: '2026-04-29'}`. Warning dikhega + Submit pe confirm dialog block karega." },
      { type: "improvement", text: "🎨 **Warning display enhanced** — Ab trans_type bhi show hota hai: '⚠️ Duplicate: Vehicle Weight (Dispatch(Sale)) — MBOPL · 2026-04-29'. Zyaada clarity kaunsi jagah match hua." },
      { type: "improvement", text: "🔄 **Triple-backend parity** — Python + Node Desktop + Node LAN sab updated. Node bhi dono INT aur string rst_no match karta hai. Same trans_type logic." },
    ],
  },
  {
    version: "104.44.29",
    date: "Feb 17, 2026",
    title: "v104.44.29 — 🔢 Cross-Collection Auto-Increment for RST & TP",
    items: [
      { type: "feature", text: "🔢 **RST auto-increment ab cross-collection** — Jaise user manually kahi (Sale Book / Purchase Voucher / Paddy Purchase) me RST 54 daale, agle Mill Entry ka auto RST 55 aayega (not 31 based on only vehicle_weights). Max scan: vehicle_weights + sale_vouchers + purchase_vouchers + private_paddy + entries + by_product_sale_vouchers." },
      { type: "feature", text: "🔢 **TP auto-increment** — Mill Entry dialog open karte hi next TP number auto-fill ho jaayega (max TP + 1 across entries + vehicle_weights). User 53 kahi dale toh 54 auto-next." },
      { type: "feature", text: "🆕 **New endpoints** (triple-backend parity):\n  • `GET /api/rst-check/next-rst?kms_year=...` → max+1 across 6 collections\n  • `GET /api/rst-check/next-tp?kms_year=...` → max+1 across entries + vehicle_weights" },
      { type: "improvement", text: "🔄 **Existing `/api/vehicle-weight/next-rst` bhi updated** — wo bhi ab cross-collection scan karta hai, isliye Vehicle Weight form me bhi correct next RST aayega." },
      { type: "improvement", text: "⚡ **Mill Entry `openNewEntryDialog()` updated** — Parallel fetch both next-rst + next-tp on dialog open. Edit mode pe no auto-fill (preserves existing values). KMS year-aware filter." },
      { type: "fix", text: "✅ **Verified** (Preview DB): Max RST = 101 (Rajan sale) → next = 102. Max TP = 895 → next = 896. Per-KMS-year filter works: next-rst for 2026-2027 = 8." },
    ],
  },
  {
    version: "104.44.28",
    date: "Feb 17, 2026",
    title: "v104.44.28 — 🛡️ Unified Backend RST Cross-Check (Sale ⇄ Purchase)",
    items: [
      { type: "fix", text: "🐛 **Root cause found** — Pichli duplicate guard (v104.44.25/26) SIRF current page ke loaded vouchers me check karta tha (frontend only). Pagination se dusre page wala RST miss ho jata tha — dupe ban jata tha bina warning ke." },
      { type: "feature", text: "🆕 **Backend endpoint `/api/rst-check`** — Real-time RST lookup across ALL collections (sale_vouchers, by_product_sale_vouchers, purchase_vouchers, private_paddy, mill entries). **Triple-backend parity**: Python + Node Desktop + Node LAN, sab me identical logic." },
      { type: "feature", text: "🚫 **Cross-Type Alert** — Sale voucher me purchase ka RST type kiya toh RED alert: '🚫 Cross-type: Ye RST PURCHASE me hai — Private Paddy · Party X · Date Y'. Purchase me sale ka RST type kiya toh same reverse alert." },
      { type: "feature", text: "🔄 **5 forms updated** with unified RST check via new `useRstCheck()` hook + `<RstWarning />` component:\n  • Sale Book (sale context)\n  • Purchase Vouchers (purchase context)\n  • Paddy Purchase Register (purchase context)\n  • By-Product Sale Register (sale context)\n  • Mill Entry Form (purchase context)" },
      { type: "improvement", text: "⚡ **Live inline check on type** — RST field me type karte hi warning dikh jaati hai (no blur needed). Amber warning for same-context duplicate, red warning for cross-type collision. Submit time par full confirm dialog with detailed message." },
      { type: "improvement", text: "🛡️ **Debounced + AbortController** — Rapid typing me sirf latest request process hoti hai. Stale responses discard. Editing existing entry me apna self-exclusion via `exclude_id` param." },
    ],
  },
  {
    version: "104.44.27",
    date: "Feb 17, 2026",
    title: "v104.44.27 — 🐛 Filename Fix: window.open() Bypass + GovtRegisters/MandiCustody",
    items: [
      { type: "fix", text: "🐛 **Critical bug fixed** — Paddy Purchase Register (mill entries register) me desktop app me filename `mill_entries_<timestamp>.xlsx` aata tha. Root cause: component `window.open()` directly use karta tha `downloadFile()` helper ke bajaye, isliye `?filename=` query param append nahi hota tha aur desktop app backend header ka hardcoded naam use karta tha." },
      { type: "fix", text: "✅ **PaddyPurchaseRegister.jsx fix** — Ab `buildFilename` use karke proper smart name bhejta hai: agent/mandi/truck filter ho toh wo party name ban jata hai. Example: debu filter + April dates → `debu-paddy-purchase-register-apr-2026.xlsx`." },
      { type: "fix", text: "🆕 **New helper `openDownload`** in `filename-format.js` — drop-in replacement for `window.open(url, '_blank')` that auto-appends `?filename=` with smart auto-derived name from URL path. Handles Electron IPC + browser blob paths transparently." },
      { type: "fix", text: "🛠️ **15 more `window.open()` calls replaced** across **GovtRegisters.jsx** (13 forms: Form A/B/E/F, FRK, Gunny Bags, Transit Pass, CMR Delivery, Security Deposit, Paddy Custody) and **MandiCustodyRegister.jsx** (2 calls). Auto-generated filenames: `govt-registers-form-a-report.xlsx`, `govt-registers-transit-pass-report.pdf`, etc." },
      { type: "improvement", text: "🔄 **Triple-backend Node patches** (v104.44.24) + **Frontend openDownload wrapper** (v104.44.27) = complete fix. **Rebuild desktop app required** (`yarn build:win` ya re-install) — old installed version me changes nahi aayenge." },
    ],
  },
  {
    version: "104.44.26",
    date: "Feb 17, 2026",
    title: "v104.44.26 — 🛡️ RST Duplicate Guard Extended to Purchase Vouchers + Paddy Purchase",
    items: [
      { type: "fix", text: "🛒 **Purchase Vouchers (Kharid Voucher)** — Same 2-layer RST duplicate protection jaise Sale Book me hai. RST field ke niche live amber warning + submit time confirm dialog with Voucher No / Party / Date details." },
      { type: "fix", text: "🌾 **Paddy Purchase Register (Niji Dhan)** — Same 2-layer protection. Amber warning shows `RST X pehle se save: Party Y · Date Z · KG A`. Submit confirm dialog me party + agent + mandi + kg sab dikhta hai." },
      { type: "improvement", text: "✅ **Edit-safe** — Apna hi entry edit karte waqt apna hi RST duplicate nahi flag hota (self-exclusion via id comparison)." },
      { type: "improvement", text: "📌 **3/3 Sale-like forms covered**: Sale Book ✓ (v104.44.25), Purchase Vouchers ✓ (v104.44.26), Paddy Purchase ✓ (v104.44.26). Vehicle Weight me RST duplicate check nahi hai kyunki wahan RST auto-generate hota hai (TP duplicate check pehle se hai)." },
    ],
  },
  {
    version: "104.44.25",
    date: "Feb 17, 2026",
    title: "v104.44.25 — 🛡️ Sale Register RST Duplicate Guard",
    items: [
      { type: "fix", text: "🐛 **Bug fixed** — Sale Register (Sale Book) me agar RST number pehle se save ho chuka hai aur user wahi RST fetch karta tha, toh silently duplicate entry ban jaati thi. Ab 2-layer protection hai." },
      { type: "fix", text: "⚠️ **Layer 1 — Live Inline Warning**: RST field ke niche turant chhota amber alert dikhta hai: '⚠️ RST 7 pehle se save: V.No XYZ · Party Name'. Jaise hi user RST type/paste kare, duplicate detect ho jaata hai." },
      { type: "fix", text: "🛑 **Layer 2 — Submit Confirm Dialog**: Agar user fir bhi Save button click kare, toh detailed confirm dialog: 'RST 7 pehle se maujood hai — Voucher No: X, Party: Y, Date: Z — kya aap phir bhi duplicate banana chahte hain?' User 'Cancel' = no save, 'OK' = force save (intentional duplicate allowed)." },
      { type: "improvement", text: "✅ **Edit safe** — Existing voucher ko edit karte time apna hi RST duplicate nahi dikhta (same-id exclusion). Sirf dusre vouchers se compare hota hai." },
      { type: "improvement", text: "🎯 **Coverage** — ye fix sirf Sale Book pe lagu hai. Agar Purchase Voucher / Vehicle Weight / Paddy Purchase me bhi same behavior chahiye toh batao, waha bhi add kar dunga." },
    ],
  },
  {
    version: "104.44.24",
    date: "Feb 17, 2026",
    title: "v104.44.24 — 🖥️ DESKTOP APP Filename Fix (Content-Disposition Override)",
    items: [
      { type: "fix", text: "🐛 **Desktop app me filename kyun nahi aa raha tha** — Root cause: Node backends (Express) har endpoint me hardcoded `Content-Disposition: attachment; filename=XYZ` header send karte the. Electron's `window.open` fallback / browser download handler us header ko frontend ke `a.download` attribute se prefer karta tha. Result: Transit Pass Register, Paddy Purchase Register, Cash Book, etc. saare downloads me generic filenames aate the." },
      { type: "fix", text: "✅ **200+ backend endpoints patched** — Har Node route ab `?filename=...` query param check karta hai. Agar frontend filename bhejta hai, wahi use hota hai. Otherwise fallback to original hardcoded name. **Triple-backend parity**: Desktop (44 files) + LAN (44 files) dono update. Python backend ko change nahi chahiye (web uses blob+a.download)." },
      { type: "fix", text: "🔗 **Frontend `downloadFile` updated** — Automatically appends `?filename=<finalName>` to every download URL so backend knows exact name. Zero breaking changes — existing flows work + desktop me sahi naam aata hai." },
      { type: "improvement", text: "📌 **Rebuild needed** — Aap jab next time desktop app build karenge (`yarn build:win`), `setup-desktop.js` automatically version mismatch detect karke fresh `frontend-build/` banayega with all the new buildFilename logic. Old installed desktop app me changes nahi aayenge until you reinstall." },
      { type: "improvement", text: "🎯 **Coverage**: Transit Pass Register, Paddy Purchase Register, Cash Book, Sale Book, Vehicle Weight, Mill Parts, Hemali, Staff, Purchase Vouchers, Truck Lease, DC Payments, BP Sale, Letter Pad, FY Summary, Oil Premium, Daily Report, Govt Registers — sab desktop me ab party/date-aware filenames output karte hain." },
    ],
  },
  {
    version: "104.44.23",
    date: "Feb 17, 2026",
    title: "v104.44.23 — 📝 Filename Party/Context Names Global Standardization",
    items: [
      { type: "fix", text: "📝 **8 components updated** — Party Ledger, Daily Report, Paddy Purchase Register, Agent Mandi Report, CMR vs DC, Season P&L, Stock Summary, Letter Pad — sab ab party/context name + date range wala smart filename generate karte hain." },
      { type: "fix", text: "🎯 **Real examples after fix:**\n  • Party Ledger (MBOPL, April) → `mbopl-kca-ledger-apr-2026.pdf` (pehle `all_parties_party_ledger.pdf` aata tha)\n  • Paddy Purchase (ABC party, Kharif) → `abc-party-paddy-purchase-register-2026-2027-kharif.xlsx`\n  • Daily Report (April 29) → `daily-report-report-2026-04-29-normal.xlsx`\n  • Letter Pad (Notice to MBOPL, May 1) → `notice-to-mbopl-letter-2026-05-01.pdf`\n  • Agent Mandi (MAHESH, Apr) → `mahesh-agent-mandi-report-apr-2026.xlsx`\n  • CMR vs DC → `cmr-vs-dc-report-2026-2027.pdf`\n  • Season P&L (Rabi) → `season-pnl-report-2026-2027-rabi.pdf`\n  • Stock Summary (Paddy cat) → `stock-summary-report-2026-2027-paddy.xlsx`" },
      { type: "improvement", text: "🔄 **Global helper `buildFilename`** consistent use ab pure software me. No more `report.xlsx` or `stock_summary.pdf` generic names — har download ka naam context se nikalta hai (party/subject/date/KMS year/category)." },
      { type: "improvement", text: "💬 **WhatsApp PDF Backend** pehle se party-aware tha (v104.15+). Naya client filename ke saath perfect match. Note: agar user search box me party type kare tabhi party name filename me aata hai — warna generic 'report' prefix with date range." },
    ],
  },
  {
    version: "104.44.22",
    date: "Feb 17, 2026",
    title: "v104.44.22 — 🔒 Single Instance Lock (Software Already Opened Alert)",
    items: [
      { type: "fix", text: "🔒 **Single Instance Lock added** — Ab desktop app (Electron) ek hi baar open ho sakta hai. Agar user dobara icon pe double-click kare toh naya window nahi khulega — existing window taskbar se focus ho jayega (Windows pe 3 sec flash bhi karega for attention)." },
      { type: "fix", text: "💬 **User-friendly alert** — Dusri instance launch hone par clear message dikhta hai: 'Software already opened! यह software पहले से चल रहा है। कृपया existing window का उपयोग करें। Agar window dikh nahi raha hai toh taskbar check karein ya system tray me dekhein.' Fir 2nd instance automatically quit ho jaata hai." },
      { type: "improvement", text: "🚀 **Behaviour** — Minimized window restore, hidden window visible, focus + flash — 3-step auto recovery. Saare license checks, server startup, dependencies — sab fresh load nahi hote (DB corruption / port conflict risks eliminated). Bigger deployment reliability." },
      { type: "improvement", text: "📌 **Implementation detail** — `app.requestSingleInstanceLock()` + `second-instance` event handler in main.js. Clean quit via `app.quit() + process.exit(0)` to ensure no zombie processes. Web version (browser-based access) par koi asar nahi — wo unchanged hai." },
    ],
  },
  {
    version: "104.44.21",
    date: "Feb 17, 2026",
    title: "v104.44.21 — 📋 Daily Report Full Coverage Documented (21 Sections Live)",
    items: [
      { type: "improvement", text: "📋 **Daily Report ab 21 sections cover karta hai** — Paddy Entries, Milling, Private Trading, Cash Flow, Cash Txns, Payments Summary, Pump, DC Deliveries, Mill Parts, Staff, Hemali, Paddy Chalna, Vehicle Weight (Auto), Per-Trip Bhada, Party Payments Breakdown, Leased Truck, Oil Premium / Lab Test, Sale Vouchers, Purchase Vouchers, By-Product Sales, FRK Purchases." },
      { type: "improvement", text: "🟢 **Normal Mode** me sab sections ka summary (KPI tiles). 🔴 **Detail Mode** me full row-by-row tables (party/vehicle/amount/description har field ke saath)." },
      { type: "improvement", text: "📥 **Frontend + PDF + Excel** teeno formats me same 21 sections dikhte hain — zero-count sections auto-skip ho jate hain. **Triple-backend parity** (Python + Node Desktop + Node LAN) maintained." },
      { type: "improvement", text: "🧭 **Jump-to-Section** dropdown top pe available — sirf non-empty sections dikhata hai, smooth scroll. Power users ke liye Alt+Shift+P/E/W/G keyboard shortcuts bhi kaam karte hain." },
      { type: "improvement", text: "📌 **P2 Backlog (optional)**: Govt Registers (8 sub), Weight Discrepancy flags, Letter Pad, Stock Register daily delta — mostly already indirectly covered. Agar specifically chahiye toh bata dena." },
    ],
  },
  {
    version: "104.44.20",
    date: "Feb 17, 2026",
    title: "v104.44.20 — 🧭 Jump-to-Section Nav + Excel/PDF Export Updated",
    items: [
      { type: "feature", text: "🧭 **Sticky Jump-to-Section Dropdown** — Daily Report page ke top pe ek sticky dropdown add kiya hai (z-20 backdrop-blur) jo sirf un sections ko dikhata hai jinki count > 0. Selected section par `scrollIntoView({behavior:smooth})` fire hota hai. 21 sections supported auto-generated slug IDs se (`section-paddy-entries`, `section-vehicle-weight`, etc)." },
      { type: "feature", text: "📊 **Excel Export Updated** — Daily Report Excel download me ab sare 7 naye sections aate hain: Vehicle Weight (Sale + Purchase details), Per-Trip Bhada, Truck/Agent/Local Party Payments, Leased Truck, Oil Premium. Empty sections skip ho jate hain (count=0 → section hidden). Col widths auto-track. **Python + Node Desktop + Node LAN — triple-backend parity maintained.**" },
      { type: "feature", text: "📄 **PDF Export Updated** — Daily Report PDF me bhi sare 7 naye sections added: Vehicle Weight, Per-Trip Bhada, Party Payments (Truck/Agent/Local), Leased Truck, Oil Premium. Normal mode me sirf summary, Detail mode me poori tables (Purchase details, txn descriptions etc)." },
      { type: "fix", text: "✅ **Tested** — Excel on 2026-04-29: 4/4 visible sections verified (Vehicle Weight, Per-Trip Bhada, Truck Owner Payments, Oil Premium). Browser test: Jump dropdown correctly renders 8 visible sections + auto-scroll works. Triple-backend lint clean." },
    ],
  },
  {
    version: "104.44.19",
    date: "Feb 17, 2026",
    title: "v104.44.19 — 📊 Daily Report P1 Expansion: Leased Truck + Lab Test (Oil Premium)",
    items: [
      { type: "feature", text: "🚚 **Leased Truck section added** — Aaj ke `truck_lease_payments` collection me se sare records. 2 KPI tiles (Total Payments / Total Paid) + detail table with Truck No, Owner, Payment Type, Mode, Amount + Remark (detail mode me). Lease ke primary/secondary payments track karne ke liye perfect." },
      { type: "feature", text: "🧪 **Lab Test / Oil Premium section added** — `oil_premium` (Bran quality tests) ki daily summary. 4 KPI tiles (Total / Positive + / Negative - / Net Premium). Detail table me V.No, RST, Party, Qty(Q), Sauda Amount, Diff %, Premium amount (color-coded emerald/red). 2026-04-29 test: 2 entries total ₹-1,53,282 premium ✓." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Python + Node Desktop + Node LAN me identical. Field mapping `qty_qtl` / `difference_pct` se correct values fetch ho rahe hain (openpyxl-style verified via DB probe)." },
      { type: "improvement", text: "📌 **Remaining (P2 - next iteration)**: Govt Registers (8 sub-registers — computed from mill_entries), Weight Discrepancy, Stock changes, Letter Pad, DC Govt Rice deliveries (already partly covered by existing DC Deliveries section), Mandi Custody (aggregate view — not a 'daily event' concept)." },
    ],
  },
  {
    version: "104.44.18",
    date: "Feb 17, 2026",
    title: "v104.44.18 — 📊 Daily Report P0 Expansion: Vehicle Weight + Per-Trip Bhada + Party Payments",
    items: [
      { type: "feature", text: "🚛 **Vehicle Weight section added** — Daily Report me ab 'Vehicle Weight / ऑटो वज़न' section aata hai jisme Sale (Dispatch) + Purchase (Receive) dono trips dikhte hain. 8 KPI tiles: Sale/Purchase Trips, Net Weight (Q), Total Bhada, Total Bags. Detail mode me RST/Vehicle/Party/Destination (Sale) ya Mandi (Purchase)/Product/Bags/BagType/NetWt/Bhada sab columns." },
      { type: "feature", text: "🛻 **Per-Trip Bhada section added** — Trucks ki aaj ki bhada activity at a glance: 4 tiles (Trucks count / Bhada Total / Paid Today / Pending). Table me har truck ka vehicle_no, trip count, bhada total dikhta hai. Paid = aaj ke truck owner cash txns (party_type=Truck, nikasi)." },
      { type: "feature", text: "💰 **Party Payments Breakdown added** — 3-column card layout me Truck Owner / Agent / Local Party ka aaj ka cash txn summary (count + Jama + Nikasi + Net). Detail mode me poori transaction list per party type — party name, txn_type badge, account, amount, description." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Python (`daily_report.py`) + Node Desktop (`daily_report_logic.js`) + Node LAN — teeno me identical data shape aur field names. API endpoint `/api/reports/daily` ab 5 naye keys return karta hai: `vehicle_weight`, `per_trip_bhada`, `truck_payments`, `agent_payments`, `local_party_payments`." },
      { type: "fix", text: "✅ **Tested via curl** — Preview backend 5/5 new sections properly return karta hai with correct shape. Lint clean (both Node + Frontend)." },
      { type: "improvement", text: "📌 **Upcoming (P1/P2)**: Leased Truck, Lab Test (Oil Premium), DC Delivery (Govt Rice) vouchers, Mandi Custody, Govt Registers (8 sub), Weight Discrepancy, Stock changes, Letter Pad — ye sections next iterations me add honge." },
    ],
  },
  {
    version: "104.44.17",
    date: "Feb 17, 2026",
    title: "v104.44.17 — 📖 Shortcuts Cheat Sheet Updated with Alt+Shift Actions",
    items: [
      { type: "improvement", text: "📖 **Keyboard Shortcuts dialog** (header me Keyboard icon ya `?` press karke khulta hai) me naya section **'Action Shortcuts (Alt+Shift)'** add kiya — 4 entries: `Alt+Shift+P` (PDF), `Alt+Shift+E` (Excel), `Alt+Shift+W` (WhatsApp), `Alt+Shift+G` (Group). Cyan-colored kbd badges taaki Ctrl/Alt sections se visually distinct ho." },
      { type: "improvement", text: "💡 **Helper tip** — Dialog ke niche italic hint: 'Payments (Truck / Owner / Per-Trip Bhada / Agent) aur Local Party panels me active hain. Search box pe focus hone par auto-disable ho jate hain.' Naye users ko scope aur guard behavior samajh me aata hai." },
      { type: "fix", text: "✅ **Tested** — Playwright dialog content check: 5/5 entries verified (4 shortcuts + heading). Keyboard icon button (header) aur `?` key dono se dialog properly khul raha hai." },
    ],
  },
  {
    version: "104.44.16",
    date: "Feb 17, 2026",
    title: "v104.44.16 — ⌨️ Keyboard Shortcuts for Icon Buttons (Alt+Shift+P/E/W/G)",
    items: [
      { type: "feature", text: "⌨️ **Alt+Shift+ shortcuts live** — Payments (Truck / Truck Owner / Per-Trip Bhada / Agent) aur Local Party panels me icon buttons ke liye keyboard shortcuts: `Alt+Shift+P` → PDF Export, `Alt+Shift+E` → Excel Export, `Alt+Shift+W` → WhatsApp text copy, `Alt+Shift+G` → Group dialog open. Mouse-free workflow for power users." },
      { type: "feature", text: "🎯 **Tab-aware routing (Payments)** — Payments tabs me hotkey automatically active sub-tab ke handler ko route karta hai — Truck tab pe Alt+Shift+E → Truck Excel, Agent tab pe Alt+Shift+E → Agent Excel. No re-binding needed when switching." },
      { type: "improvement", text: "💡 **Tooltip hints** — Har icon button ke `title` attribute me shortcut hint append hota hai (e.g. 'PDF Export (Alt+Shift+P)'), screen readers bhi `aria-label` ke through same information read karte hain. Fully accessible." },
      { type: "improvement", text: "🛡️ **Smart guard** — Hook `useActionShortcuts` input/textarea/select focused hone par auto-disable ho jata hai — toh search box me 'e' type karne se Excel trigger nahi hoga. Capture-phase listener se global shortcut conflicts se bachta hai. **Browser-safe** — Alt+Shift+P/E Chrome/Firefox me reserved nahi hain." },
      { type: "fix", text: "✅ **Tested** — 4/4 tooltips verified with shortcut hints. Alt+Shift+W aur Alt+Shift+G pressing se actual handlers fire hote hain (Per-Trip Bhada me 'Koi trips nahi' toast triggered as expected on empty state)." },
    ],
  },
  {
    version: "104.44.15",
    date: "Feb 16, 2026",
    title: "v104.44.15 — 🎯 GLOBAL Icon-only Buttons (Excel/PDF/WhatsApp/Group/Telegram/Refresh/Filter)",
    items: [
      { type: "improvement", text: "🎯 **Pure software me icon-only buttons** — har jagah Excel/PDF/WhatsApp/Group/Telegram/Refresh/Filter buttons ab sirf icon dikhate hain (no text). Hover karne pe tooltip me poora label aata hai (e.g. 'Excel Export', 'PDF Export', 'Send to WhatsApp', 'Send to Group')." },
      { type: "improvement", text: "✅ **109 buttons converted across 31 files**: Mill Entries (AppHeader), Paddy Purchase Register, Sale Book, Cash Book / Ledgers, Payments tabs, Govt Registers (8 sub-tabs), Milling Tracker, Mill Parts Stock, Staff Management, DC Tracker, Daily/Season/CMR Reports, Hemali Payments, FY Summary, Balance Sheet, Vehicle Weight, Auto Weight Entries, Letter Pad, GST Ledger, Stock Summary, Oil Premium, Mandi Custody, Weight Discrepancy, Byproduct Sale Register — sab me consistent icon-only style." },
      { type: "improvement", text: "📐 **Consistent sizing**: 9×9 (h-9 w-9 p-0) icon-only buttons with colored borders (red/emerald/green/cyan/sky/slate per action). Matches Per-Trip Bhada / Truck Owner / Local Party header pattern from previous versions." },
      { type: "fix", text: "✅ **Accessibility preserved** — `title` aur `aria-label` attributes har button pe added hain, screen readers + tooltips dono kaam karte hain." },
    ],
  },
  {
    version: "104.44.14",
    date: "Feb 16, 2026",
    title: "v104.44.14 — 📁 GLOBAL Smart Filename: Hyphen-style across All Excel/PDF/WhatsApp downloads",
    items: [
      { type: "feature", text: "📁 **One filename style across the entire software** — `{name}-report.{ext}` (no filter) ya `{name}-report-{from}-to-{to}.{ext}` (with date filter). E.g. `debujain-report.xlsx`, `debujain-report-Apr-2026.xlsx`, `local-party-report-2026-04-01-to-2026-06-30.pdf`." },
      { type: "improvement", text: "🔤 **Hyphen-style** — Spaces aur underscores ab `-` me convert hote hain. Case lowercase. Special chars stripped (Windows + Linux + WhatsApp safe filenames)." },
      { type: "improvement", text: "📅 **Smart date format** — Single full month range (e.g. 1 Apr to 30 Apr) → `Apr-2026` (compact). Multi-month → full ISO range. Only-from / only-to → `{date}-to-end` / `start-to-{date}`." },
      { type: "feature", text: "🔄 **Updated central helper** `/app/frontend/src/utils/filename-format.js::buildFilename()` — 44 existing callers now auto-inherit hyphen format. Plus 18+ new conversions across: Cash Book, Sale Book, Purchase Vouchers, Truck Owner, Truck Payment, Per-Trip Bhada, Local Party, Hemali Payments, Mill Parts, Diesel, Leased Truck, Staff, Dashboard, Vehicle Weight, Auto Weight, FY Summary, Balance Sheet, Govt Registers, FRK Purchases, Byproduct Sales, DC Tracker." },
      { type: "improvement", text: "🌐 **Group + WhatsApp** flows respect filename: GroupDialog ka `pdfUrl` automatically updated filenames generate karta hai. WhatsApp text shares ke liye copyable summary remains as-is (no filename needed)." },
    ],
  },
  {
    version: "104.44.13",
    date: "Feb 16, 2026",
    title: "v104.44.13 — 📁 Local Party Filename: Date Range Suffix",
    items: [
      { type: "feature", text: "📁 **Date-aware filename**: Local Party me ek party + date filter karke download karne pe ab filename me dates bhi reflect hote hain — e.g. `debujain-report.xlsx` (no dates) → `debujain-report-2026-04-01-to-2026-04-30.xlsx` (with dates)." },
      { type: "improvement", text: "🔤 **Hyphen-style naming**: Spaces aur underscores ab `-` me convert hote hain — e.g. `Hemali Payment` → `hemali-payment-report.xlsx`. All-parties default → `local-party-report.xlsx`." },
      { type: "improvement", text: "📊 **Backend filter**: Excel/PDF endpoints (Python + Node Desktop + Node LAN) ab `date_from` + `date_to` query params accept karte hain — Excel me sirf range ke transactions aate hain. Frontend `handleExport` + Group dialog dono auto-pass karte hain." },
      { type: "improvement", text: "🧪 **5 filename test cases verified**: full filter / no filter / only-from / only-to / all-parties — sab correct output produce karte hain." },
    ],
  },
  {
    version: "104.44.12",
    date: "Feb 16, 2026",
    title: "v104.44.12 — 📁 Local Party Filename: Party Name Restored (Bug Fix)",
    items: [
      { type: "fix", text: "🐛 **Bug**: Local Party me ek specific party (e.g. Debujain) select karke Excel/PDF download karne pe filename `local_party_account.xlsx` aata tha — pehle party name aata tha. User ne report kiya." },
      { type: "fix", text: "✅ **Backend** (`/api/local-party/excel` + `/api/local-party/pdf`): Naya optional query param `party_name` add kiya. Jab pass ho — txns + summary us party par filter ho jate hain, aur filename me bhi party name reflect hota hai (e.g. `debujain.xlsx` / `debujain.pdf`). Triple-backend parity (Python + Node Desktop + Node LAN)." },
      { type: "fix", text: "✅ **Frontend** (`LocalPartyAccount.jsx`): `handleExport` ab `selectedParty` ko query param ke saath bhejta hai aur explicit filename `${safeName}.${ext}` pass karta hai `downloadFile()` me — Browser anchor download + Electron native save dialog dono respect karte hain ye filename." },
      { type: "improvement", text: "📦 **Group dialog** ka PDF URL bhi same `party_name` param respect karta hai — group me bheja gaya PDF bhi sirf selected party ka data leke aata hai." },
    ],
  },
  {
    version: "104.44.11",
    date: "Feb 16, 2026",
    title: "v104.44.11 — 🎯 Excel Filter Row Fix — Real Header Row Detection (Triple-Backend)",
    items: [
      { type: "fix", text: "🐛 **Bug**: Pure software me Excel download me filter arrow branding row (Row 1 — 'NAVKAR AGRO', 'GSTIN:...', 'PHONE:...') ke upar aa rahe the, asli column header (Row 5 — Date/Party/Jama/Nikasi) pe nahi. User ne actual cash_book.xlsx bhej ke confirm kiya." },
      { type: "fix", text: "✅ **Fix — Python** (`/app/backend/utils/export_helpers.py`): 2-pass heuristic. Pass 1: find row with 4+ cells that are BOTH bold + have solid fill (matches `hdr_font + hdr_fill` pattern used across codebase). Pass 2: fallback using value-shape (reject colons, long strings, majority-numeric rows)." },
      { type: "fix", text: "✅ **Fix — Node Desktop + LAN** (`pdf_helpers.js` both): Same 2-pass heuristic, PLUS special handling for ExcelJS merged cells (they return master's value to every cell in range, so uses **UNIQUE values count** instead of non-empty count — ensures merged branding banners with repeated values don't get picked)." },
      { type: "improvement", text: "🧪 **Tests**: Node harness validates both styled-header case (row 5 with branded rows 1-4) and unstyled-fallback case (plain row 2 header) → both PASS. Python curl test validates 4 live endpoints — all correctly detect real header row (Cash Book row 5, Party Summary row 7, Outstanding row 5, Per-Trip Bhada row 5)." },
      { type: "improvement", text: "📦 **Triple-Backend Parity**: All 3 backends (Python / Node Desktop / Node LAN) get identical detection logic. No code path can wrongly pick branding row." },
    ],
  },
  {
    version: "104.44.10",
    date: "Feb 16, 2026",
    title: "v104.44.10 — 🎯 Sale Entries: Source/Mandi → Destination (sab jagah)",
    items: [
      { type: "improvement", text: "🎯 **Sale entries me 'Source/Mandi' → 'Destination'** har jagah convert ho gaya (semantically correct kyunki Sale me maal ja raha hai, aa nahi raha):" },
      { type: "improvement", text: "✅ **Frontend** (5 places): Completed Entries header, Auto Weight Entries header, Print receipt HTML (VehicleWeight.jsx), Photo dialog (VehicleWeight.jsx), Print receipt HTML (AutoWeightEntries.jsx), Photo dialog (AutoWeightEntries.jsx), WhatsApp/copy text" },
      { type: "improvement", text: "✅ **Backend Python** (2 places): Single weight slip PDF (canvas + reportlab.platypus versions). Excel/PDF list exports already conditional ✓" },
      { type: "improvement", text: "✅ **Backend Node Desktop + LAN** (3 places each, 6 total): WhatsApp text, drawGridRow PDF, bordered info table PDF" },
      { type: "fix", text: "🛡️ **Logic**: Detects via `trans_type` containing 'sale' OR 'dispatch' (case-insensitive) → 'Destination'. Otherwise → 'Source/Mandi'. Tested 7 test cases including Dispatch(Sale), Sale_Pakka, Receive(Purchase), DC, empty — all correct." },
    ],
  },
  {
    version: "104.44.9",
    date: "Feb 16, 2026",
    title: "v104.44.9 — 📊 GLOBAL Excel Polish: Auto-filter + Freeze Header on EVERY Excel Download",
    items: [
      { type: "feature", text: "🎯 **170+ Excel endpoints upgraded across all 3 backends** — Python (50+) + Node Desktop (60+) + Node LAN (60+). Har Excel download me ab automatic milta hai: ① **Auto-filter dropdown** har column header pe (sort & filter per-column directly inside Excel) ② **Frozen header row** (jab scroll karein to header dikta rahega) ③ **Gridlines off** (cleaner look — borders provide structure)." },
      { type: "feature", text: "📋 **Coverage**: Cash Book / Party Summary, Outstanding Reports, Sale Book / Purchase Book, FRK Purchases, Byproduct Sales, Milling Report, Paddy Custody, Paddy Chalna, Truck Payments, Truck Owner Consolidated, Per-Trip Bhada (single + all-trucks), Hemali Payments, Hemali Monthly Summary, MSP Payments, DC Register (both sheets), Gunny Bags, Gunny Purchase Report, Vehicle Weight Register, Govt Registers (8), Cash Book Daily, Trial Balance, Diesel, Mill Parts, Oil Premium, Staff, Private Trading — sab me." },
      { type: "improvement", text: "🛡️ **Idempotent helper** — `apply_consolidated_excel_polish(ws)` (Python) / `applyConsolidatedExcelPolish(ws)` (Node). Agar route ne explicitly correct header row set kar rakha hai (jaise Per-Trip Bhada me row 5), helper usse override nahi karta — sirf gridlines disable kar deta hai. Otherwise auto-detects header row (4+ non-empty cells in first 5 columns)." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Same helper teeno backends me identical signature + behavior. `/app/backend/utils/export_helpers.py`, `/app/desktop-app/routes/pdf_helpers.js`, `/app/local-server/routes/pdf_helpers.js` — all in sync." },
      { type: "fix", text: "✅ Auto-injection scripts handle 5 different Excel write patterns: `await wb.xlsx.write(res); res.end()`, `await wb.xlsx.writeBuffer()`, `wb.xlsx.write().then()`, `wb.xlsx.writeBuffer().then()`, plus standalone `await wb.xlsx.write()`. 100% Excel endpoint coverage in Node." },
    ],
  },
  {
    version: "104.44.8",
    date: "Feb 16, 2026",
    title: "v104.44.8 — 🎯 Agent Payments + Local Party — Same Unified Header (Search + 4 Icons)",
    items: [
      { type: "feature", text: "🔎 **Agent Payments search filter** — pehle search nahi tha, ab 'Search mandi / agent...' search box header me available hai. Live filters table + agent totals." },
      { type: "improvement", text: "📦 **Agent Payments unified Card** — same Truck Payment / Truck Owner / Per-Trip Bhada jaise structure: title + tagline + search + 4 icon buttons (PDF/Excel/WhatsApp/Group) sab single Card header me." },
      { type: "feature", text: "💬 **Local Party — WhatsApp + Group icons** — pehle sirf Excel/PDF text buttons the. Ab icon-only style: PDF (red) · Excel (emerald) · WhatsApp (green Send) · Group (cyan Users → SendToGroupDialog with text + PDF link). Top toolbar (party dropdown + date range) untouched kyuki ye party-drilldown hai, alag UX." },
      { type: "improvement", text: "🤝 **Group dialog text format** — Agent Payments aur Local Party me bhi same WhatsApp-friendly markdown format: emoji + bold + truck/party-wise mini-list (≤10 items)." },
    ],
  },
  {
    version: "104.44.7",
    date: "Feb 16, 2026",
    title: "v104.44.7 — 🎯 Truck Payments / Owner / Per-Trip Bhada — Unified Header (Search + Icon Exports + WhatsApp + Group)",
    items: [
      { type: "improvement", text: "🧹 **Stat lines hata di** — Truck Payment ke 3 colored Total/Paid/Balance cards, Truck Owner ka 4-column Total Trucks/Net Payable/Paid/Balance summary, aur Per-Trip Bhada ka bottom stat strip — sab hata diye. Cleaner table view." },
      { type: "feature", text: "🔎 **Truck Owner me search filter** — pehle search box sirf Truck Payment me tha, ab Truck Owner me bhi 'Search truck no...' search box header me available hai. Live filter applies to both table aur summary calculations." },
      { type: "improvement", text: "📦 **Single-card unified layout** — Truck Payment panel ka filter/export bar pehle Card ke bahar tha (alag block). Ab Per-Trip Bhada jaisa hi single Card me sab kuch (header me title + search + icons, content me table). Truck Owner pehle se single Card me tha — uski header ko bhi same icon-style update kiya." },
      { type: "feature", text: "💬 **WhatsApp + Group icons header me** — Teeno panels (Truck Payment, Truck Owner, Per-Trip Bhada) me ab 4 icon buttons hain: PDF (red) / Excel (emerald) / WhatsApp (green Send icon) / Group (cyan Users icon). WhatsApp = quick text copy. Group = SendToGroupDialog with consolidated summary text + PDF link attached." },
      { type: "fix", text: "🧽 **Demo data cleared** — `OD-15-DEMO-1234` aur `OD-21-DEMO-5678` mock trucks DB se hata diye gaye (deployment-ready cleanup)." },
    ],
  },
  {
    version: "104.44.6",
    date: "Feb 16, 2026",
    title: "v104.44.6 — 📊 Per-Trip Bhada Polish: Banner Below + Professional Excel + Node Single-Truck Parity",
    items: [
      { type: "improvement", text: "🔄 **KPI Summary Banner moved BELOW the table** — pehle PDF upper me navy summary banner aata tha (jisme Hindi text bhi vertical bars `||||||` jaise dikha tha font issue se). Ab banner table ke **niche** aata hai, with 5 colored tiles: TOTAL TRIPS (navy), TOTAL BHADA (orange), SETTLED (green), PARTIAL (amber), PENDING (red). English-only labels — koi font issue nahi." },
      { type: "improvement", text: "📊 **Professional Excel** — `Per-Trip Bhada (All)` sheet ab production-ready hai: dark navy branded header (company name 18pt) + subtitle row + filter info strip (light blue) + table with auto-filter dropdown + frozen header row (top stays visible while scrolling) + alternating row colors + bold colored fonts (RST navy, Truck No sky, Bhada orange, Pending red) + ₹ currency formatting (`₹4,000`) + 5-tile KPI banner BELOW data + composition strip + footer. Border lines softer (#D5DBE5)." },
      { type: "feature", text: "✅ **Node Single-Truck Parity** — `GET /api/truck-owner/{vehicle_no}/per-trip-pdf`, `/per-trip-excel`, `/whatsapp-text` endpoints ab Node Desktop + LAN dono me available hain (pehle sirf Python me the). Same shared renderer as all-trucks → consistency guaranteed. Filename includes truck no (e.g. `OD-15-DEMO-1234_per_trip_bhada_pending.pdf`)." },
      { type: "feature", text: "🔁 **Shared Renderers** — Backend me `_renderPerTripPdf` + `_renderPerTripExcel` shared helpers banaye — both single-truck aur all-trucks endpoints ek hi rendering function use karte hain. Maintenance asaan, regressions kam." },
      { type: "fix", text: "🔧 PDF row height 13→14, header height 16→18, font sizes refined for crisp rendering. Subtle column separators (#D5DBE5)." },
    ],
  },
  {
    version: "104.44.5",
    date: "Feb 16, 2026",
    title: "v104.44.5 — 📑 All-Trucks Per-Trip Bhada PDF/Excel Exports (with Filters)",
    items: [
      { type: "feature", text: "📑 **All-Trucks PDF Export** — `Payments → Per-Trip Bhada` me ab `PDF` button click pe **saare trucks ka combined PDF** download hota hai (landscape, with Truck No column). Filters automatically respected hote hain — agar user ne `Pending` filter laga rakha hai ya `Sale` only select kiya hai ya search box me kuch likha hai, sirf woh trips PDF me aate hain." },
      { type: "feature", text: "📥 **All-Trucks Excel Export** — Excel button bhi same combined behavior — sab trucks ka data ek single sheet me, color-coded status cells (Settled green, Partial amber, Pending red), summary banner top pe (Total Bhada / Settled / Pending / Trips count)." },
      { type: "feature", text: "🔎 **Filter-Aware Filenames** — `per_trip_bhada_all_trucks.pdf` (no filter) ya `per_trip_bhada_all_trucks_pending.pdf` (filter applied) — auto-naming reflects current view." },
      { type: "improvement", text: "✅ **Triple-Backend Parity** — Naye endpoints `GET /api/truck-owner/per-trip-all/pdf` aur `/per-trip-all/excel` teeno backends me identical hain (Python FastAPI + Node Desktop Electron + Node LAN Express). Query params: `kms_year`, `season`, `filter_status`, `trans_type`, `search`. In-process Express harness me 6/6 tests pass." },
      { type: "fix", text: "🔧 Pehle 'All Trucks' view me PDF/Excel buttons sirf single-truck filter karne pe hi kaam karte the. Ab seedha sab trucks ke saath, with ya without filters, dono kaam karte hain. WhatsApp text endpoint abhi single-truck only hai (search se filter karna hoga)." },
    ],
  },
  {
    version: "104.44.4",
    date: "Feb 16, 2026",
    title: "v104.44.4 — 🛻 Truck Owner Per-Trip Bhada (Production Ready)",
    items: [
      { type: "feature", text: "🛻 **Per-Trip Bhada Tab in Payments** — Naya subtab `Payments → Per-Trip Bhada` jo har truck ka trip-wise (RST-wise) bhada breakdown dikhata hai. Sale + Purchase dono trips, Settled / Partial / Pending status, summary KPIs (Total Trips, Bhada, Settled, Pending), Sale/Purchase count split. Truck dropdown se asaani se switch kar sakte hain." },
      { type: "feature", text: "💰 **One-Click Settle (Pay button)** — Pending ya Partial trip pe `Pay ₹X` button click karte hi backend automatic NIKASI entry banata hai (`account=ledger, party_type=Truck, txn_type=nikasi`) — table refresh hoke status `Settled` ho jata hai. FIFO pool-based settlement (oldest trip pehle settle hoti hai)." },
      { type: "feature", text: "📑 **Pending PDF Export** — `Pending PDF` button click pe sirf unpaid/partial trips ka PDF generate hota hai with color-coded status cells (red/amber/green). Truck owner ko WhatsApp pe forward karne ke liye perfect." },
      { type: "feature", text: "📥 **Excel Export** — All trips ka Excel with color-coded status cells aur summary banner." },
      { type: "feature", text: "💬 **WhatsApp Share** — Pending trips ka formatted text auto-clipboard pe copy hota hai (RST + date + party + amount + status emoji). Ek click se driver/owner ko forward kar sakte hain." },
      { type: "feature", text: "📊 **FIFO Settlement Algorithm** — Existing Cash Book NIKASI payments ko chronologically oldest trip pe pool-apply karta hai (settled → partial → pending logic). Manual + auto NIKASI dono count hote hain." },
      { type: "improvement", text: "✅ Triple-backend (Python + Node Desktop + Node LAN) parity. 3 endpoints in sync: `GET /api/truck-owner/per-trip-trucks`, `GET /api/truck-owner/{vno}/per-trip`, `POST /api/truck-owner/{vno}/settle/{rst}`. Plus Python-only export endpoints: `/per-trip-pdf`, `/per-trip-excel`, `/whatsapp-text` (Node parity in next release)." },
    ],
  },
  {
    version: "104.44.3",
    date: "Feb 16, 2026",
    title: "v104.44.3 — 🚛 Bhada (Lumpsum) Across All Sale/Purchase Forms",
    items: [
      { type: "feature", text: "🚛 **Bhada (Lumpsum) field added to 4 forms** — `BP Sale Register` (Rice Bran/Broken/Kanki/Husk), `Sale Voucher / बिक्री वाउचर`, `DC Delivery (Govt Rice)`, aur `Pvt Purchase Vouchers` — sab me ab `Cash (Truck ko)` + `Diesel (Pump se)` ki jagah ek hi **Bhada (Lumpsum) ₹** field hai. Mill ne truck owner ko fix lump-sum freight dena hota hai." },
      { type: "feature", text: "🔁 **RST se Auto-Fetch** — Form me RST number daalte hi Bhada automatically fetch ho jata hai uss RST ki Vehicle Weight entry se. User chahe to override kar sakta hai (form bhi save karega aur VW ki value bhi update karega)." },
      { type: "feature", text: "📒 **Single Source of Truth = `vehicle_weights.bhada`** — Saare forms (BP Sale, Sale Voucher, DC, Purchase) RST ke through canonical VW entry me bhada update karte hain. **Sirf 1 ledger entry per RST trip** — koi duplicate nahi, Truck Owner ko sahi clean ledger." },
      { type: "feature", text: "🚜 **Purchase Trip Bhada Support** — Vehicle Weight ke Purchase trips (`Receive(Purchase)`) me bhi ab Bhada se auto-jama banta hai (reference: `vw_purchase_bhada:{rst}`). Inbound paddy ke truck owner ko alag se Sale wala mismatch nahi hota." },
      { type: "feature", text: "🛻 **DC Delivery Per-Truck Bhada** — DC Delivery form me multi-truck setup hai → ab har truck ki apni separate Bhada field hai (delivery-level Cash/Diesel summary hata diya). Bottom me 'Total Bhada' ka summary tile dikhata hai." },
      { type: "improvement", text: "✅ Triple-backend (Python + Node Desktop + Node LAN) sync. `_sync_sale_bhada_ledger` helper ab Sale aur Purchase dono trans_types handle karta hai. DELETE pe sale + purchase dono refs cascade-clean hote hain." },
      { type: "fix", text: "🔧 Bhada=0 set karne se ya VW entry delete karne se truck owner ledger entry automatically remove ho jati hai (kept idempotent across all 3 backends)." },
    ],
  },
  {
    version: "104.44.2",
    date: "Feb 16, 2026",
    title: "v104.44.2 — 🚛 Sale Truck Lumpsum Bhada (Triple-Backend Parity)",
    items: [
      { type: "feature", text: "🚛 **Sale Truck Lumpsum Bhada (Freight)** — Vehicle Weight ke 'Dispatch (Sale)' entries me ab single **'Bhada (Lumpsum) ₹'** field hai (purane Cash/Diesel separate fields ki jagah). Mill ne truck owner ko fix lump-sum freight dena hota hai (e.g. ₹4,000) — yahi amount automatically truck-owner ke ledger me **JAMA (CR)** create karta hai." },
      { type: "feature", text: "📒 **Auto Truck Owner Ledger Sync** — `cash_transactions` me auto-entry: `account=ledger, party_type=Truck, category=<vehicle_no>, txn_type=jama` with reference `vw_sale_bhada:{rst_no}`. Idempotent — edit pe update, bhada=0 ya delete pe auto-cleanup." },
      { type: "fix", text: "🔄 **Triple-Backend Parity Fixed** — Pichli session me sirf Python backend (`vehicle_weight.py`) update hua tha. Ab Node.js backends (`desktop-app/routes/vehicle_weight.js` + `local-server/routes/vehicle_weight.js`) bhi sync hain — ye production desktop app aur LAN server me Bhada feature ko complete karta hai." },
      { type: "fix", text: "📑 **Sale Excel/PDF: Bhada Column** — Sale-mode exports me ab 'Cash' aur 'Diesel' columns ki jagah ek **'Bhada'** column hai (Python + Node teeno me). Summary banner me `Total Bhada` orange tile dikhata hai. Purchase view unchanged." },
      { type: "fix", text: "🗑️ **DELETE Cascade** — Vehicle Weight entry delete karne par associated `vw_sale_bhada:{rst_no}` ledger entry bhi auto-remove hoti hai (no orphan records)." },
      { type: "improvement", text: "✅ Synced across all 3 backends (Python FastAPI + Electron Desktop + LAN Express). Node syntax + lint clean." },
    ],
  },
  {
    version: "104.44.1",
    date: "Feb 16, 2026",
    title: "v104.44.1 — 🔄 Auto-sync Sale/Purchase Toggle + Sale Excel/PDF Columns",
    items: [
      { type: "feature", text: "🔄 **Auto-sync Toggle** — Vehicle Weight ke 'New Entry' form me jab user 'Trans Type' me **Dispatch(Sale)** select karta hai, dono niche wali tables — **Completed Entries** aur **Auto Weight Entries (Last 7 Days)** — automatically Sale view me switch ho jaati hain. Receive(Purchase) select karne par dono Purchase view me. Toggle state localStorage me persist hoti hai (`vw_view_mode` key) aur cross-component storage events ke through instant sync hoti hai." },
      { type: "fix", text: "📑 **Sale-mode Excel/PDF Column Layout Fix** — Reported: 'Sale toggle me PDF/Excel ab b purane purchase columns me aata hai, sale ke hisab se nahi.' Fix: Backend `/vehicle-weight/export/excel` aur `/vehicle-weight/export/pdf` endpoints ab `trans_type=sale` query param recognize karte hain aur **sale-specific 12 column layout** generate karte hain:" },
      { type: "fix", text: "&nbsp;&nbsp;**Sale columns:** RST, Date, Vehicle, Party, Destination, Product, Bags, **Bag Type**, Net Wt, Cash, Diesel, Remark" },
      { type: "fix", text: "&nbsp;&nbsp;**Purchase columns** (purane jaisa): RST, Date, Vehicle, Party, Source/Mandi, Product, Trans Type, Bags, 1st Wt, 2nd Wt, Net Wt, TP Wt, G.Issued, Cash, Diesel" },
      { type: "fix", text: "&nbsp;&nbsp;Color-coding bhi sale-aware: Net Wt (green bold), Cash (green), Diesel (orange), Bag Type (info column). Summary banner sale me 5 cards (Total Entries, Total Bags, Net Wt, Cash, Diesel) — purchase me 7 cards (additional 1st/2nd Wt)." },
      { type: "improvement", text: "📁 **Smart Filename** — Sale exports `vehicle_weight_sales_Apr-2026.pdf` / `auto_weight_sales.xlsx` ke naam se save hote hain — purchase ke `vehicle_weight.pdf` se separate." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Sale-aware Excel/PDF export Python (web) + Electron desktop-app + local-server teeno backends me applied. `trans_type` param dono routes par dynamically column layout switch karta hai." },
    ],
  },
  {
    version: "104.44.0",
    date: "Feb 16, 2026",
    title: "v104.44.0 — 📁 Global Smart Filenames + Date Range Embedding",
    items: [
      { type: "feature", text: "📁 **Global Smart Filename Builder** — Naya helper `/app/frontend/src/utils/filename-format.js` (`buildFilename({base, party, subType, dateFrom, dateTo, kmsYear, ext})`). Saare PDF/Excel/WhatsApp downloads ab is centralized helper se filename banate hain — consistent naming pattern ke saath." },
      { type: "feature", text: "📅 **Date Range Embedding** — Date filter ke saath export karne par filename me date range embed hota hai:" },
      { type: "feature", text: "&nbsp;&nbsp;• Same day: `Titu_owner_ledger_2026-04-15.pdf`" },
      { type: "feature", text: "&nbsp;&nbsp;• Full month coverage (1st to last day): `Titu_owner_ledger_Apr-2026.pdf`" },
      { type: "feature", text: "&nbsp;&nbsp;• Custom range: `cash_book_2026-04-01_to_2026-06-30.pdf`" },
      { type: "feature", text: "🌐 **Globally Applied** — Smart naming ab in 10+ jagah enabled:" },
      { type: "feature", text: "&nbsp;&nbsp;• **Cash Book** (Excel/PDF) — `Titu_owner_ledger.xlsx`, `MBOPL_KCA_party_ledger_Apr-2026.pdf`" },
      { type: "feature", text: "&nbsp;&nbsp;• **Paddy Purchase + Party Summary** — `Acme_Traders_pvt_paddy.xlsx`, `party_summary_Apr-2026.pdf`" },
      { type: "feature", text: "&nbsp;&nbsp;• **Sale Book + Purchase Vouchers** — `sale_book_2026-2027.pdf`, `purchase_book.xlsx`" },
      { type: "feature", text: "&nbsp;&nbsp;• **Vehicle Weight + Auto Weight Entries** — `MBOPL_vehicle_weight_sales_Apr-2026.pdf`, `auto_weight_entries.xlsx`" },
      { type: "feature", text: "&nbsp;&nbsp;• **Truck/Agent/Owner Payments** — `MH-12-AB-1234_truck_payments.xlsx`, `agent_payments.pdf`, `truck_owner.pdf`" },
      { type: "feature", text: "&nbsp;&nbsp;• **BP Sales (Rice Bran/Broken/Kanki/Husk)** — `Rice Bran_sales_Apr-2026.xlsx`" },
      { type: "feature", text: "&nbsp;&nbsp;• **Oil Premium Lab Test** — `oil_premium_2026-04-15_to_2026-04-30.pdf`" },
      { type: "feature", text: "&nbsp;&nbsp;• **Mill Parts Stock** — `mill_parts_txns_Apr-2026.xlsx`" },
      { type: "feature", text: "💬 **WhatsApp PDF Filename Smart** — Backend `/app/backend/routes/whatsapp.py` me extended URL inference: `Titu_owner_ledger_Apr-2026.pdf` aata hai apne aap. Date_from/date_to URL params se nikaala jaata hai." },
      { type: "improvement", text: "🔍 **Special Char Sanitization** — Party names me `()`, slashes, spaces ko underscore se replace karte hain (Windows + Linux + WhatsApp file system safe)." },
    ],
  },
  {
    version: "104.43.4",
    date: "Feb 16, 2026",
    title: "v104.43.4 — 📁 Smart Party-aware Filenames in Cash Book Excel/PDF/WhatsApp",
    items: [
      { type: "improvement", text: "📁 **Smart Filename Embedding** — Cash Book Excel/PDF download buttons aur WhatsApp PDF share teeno ab party-specific filenames generate karte hain — generic `cash_book_<timestamp>.xlsx` ki jagah:" },
      { type: "improvement", text: "&nbsp;&nbsp;• **Owner ledger** (Titu, etc.) → `Titu_owner_ledger.pdf` / `Titu_owner_ledger.xlsx`" },
      { type: "improvement", text: "&nbsp;&nbsp;• **Party ledger** (MBOPL (KCA), Cash Test Agent (PKA), etc.) → `MBOPL_KCA__party_ledger.pdf`" },
      { type: "improvement", text: "&nbsp;&nbsp;• **Cash Book transactions tab** → `cash_transactions.xlsx`" },
      { type: "improvement", text: "&nbsp;&nbsp;• **Generic Cash Book** (no filter) → `cash_book.pdf`" },
      { type: "improvement", text: "🔍 **Special chars sanitized** — `()`, spaces, slashes etc. ko `_` se replace karte hain (`MBOPL (KCA)` → `MBOPL_KCA_`) taaki Windows + Linux + WhatsApp file system friendly bane." },
      { type: "improvement", text: "💬 **WhatsApp PDF Backend Updated** — `/app/backend/routes/whatsapp.py` me `party_type=Owner` URL param read karta hai aur `Titu_owner_ledger.pdf` ya `MBOPL_party_ledger.pdf` accordingly bheij ta hai. Audit aur file management me bahut handy." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Python whatsapp.py update + Frontend smart naming jo desktop-app + local-server dono Node backends ko transparent hai (frontend filename pass karta hai)." },
    ],
  },
  {
    version: "104.43.3",
    date: "Feb 16, 2026",
    title: "v104.43.3 — 🧹 Cash Book Exports: Removed Useless Summary Table",
    items: [
      { type: "improvement", text: "🧹 **Summary Table Removed** — Reported: 'Excel/PDF/WhatsApp PDF me Summary table aata hai (Cash/Bank breakdown), iska koi kaam nahi hai aur columns me `######` overflow bhi dikhta tha.' Fix: Cash Book ke saare exports (Python web + Electron + local-server) me top par jo 'Summary / सारांश' section tha (Cash/Bank ke Jama/Nikasi/Balance + closing/net banner cards) — wo poora hata diya gaya. Ab exports directly **'Transactions / लेनदेन'** se shuru hote hain, table ke last row par TOTAL automatic dikhta hai (jo enough hai)." },
      { type: "improvement", text: "📐 **Column Width Fix** — Account/Type columns ki width 10/8 → 12/13 ki, aur amount columns 14 → 16/17 ki — Indian-style currency `1,00,000.00` cleanly fit ho jaata hai bina ###### ke." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Removal Python web backend + Electron desktop-app + local-server teeno me applied. Excel + PDF + WhatsApp PDF (jo PDF endpoint share karta hai) — sab clean exports." },
    ],
  },
  {
    version: "104.43.2",
    date: "Feb 16, 2026",
    title: "v104.43.2 — 📑 Cash Book PDF / Excel / WhatsApp PDF: Same Order as Desktop UI",
    items: [
      { type: "fix", text: "📑 **Sort Order Fix** — Reported issue: 'PDF, WhatsApp PDF, aur Excel exports me transactions desktop UI ke jaisa order me nahi aate, galat aata hai.' Cause: Cash Book ke export endpoints (`/cash-book/pdf`, `/cash-book/excel`, WhatsApp PDF jo `_generate_cash_book_pdf_bytes` use karta hai) sirf `date` se ASC sort karte the. Ek hi date par multiple txns the (e.g. 29-04-2026 par Titu ke 5 txns), aur unka order MongoDB ke insertion order par random tha — desktop UI me jo chronological dikhta hai (oldest first → newest last by `created_at`) wo PDF/Excel me match nahi karta tha." },
      { type: "fix", text: "🔧 **Fix Applied** — Ab exports `[(date, ASC), (created_at, ASC)]` se compound sort karte hain — bilkul desktop UI ke jaisa exact same order. Verification (Titu owner ledger): UI me 1L Jama → 1k Tractor Jama → 50k Jama → 1L Nikasi → 27k Trahikara Jama → balance ₹78,000 CR. **PDF aur Excel ab bhi exactly yahi order me aate hain** with same running balance. WhatsApp PDF bhi same logic share karta hai (uses same generator function)." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Sort fix Python (web) + Electron desktop-app + local-server teeno me applied: `txns.sort((a,b) => date_ASC || created_at_ASC)` JS me, MongoDB compound sort Python me." },
    ],
  },
  {
    version: "104.43.1",
    date: "Feb 16, 2026",
    title: "v104.43.1 — 🎫 Sale Book + Purchase Voucher: S-001 / P-001 Auto Prefix (Editable)",
    items: [
      { type: "feature", text: "🎫 **Sale Voucher Auto Number `S-001`** — GST Sale Book me ab New Sale form khulte hi 'Voucher No.' field auto-fill ho jaata hai next serial ke saath: `S-001`, `S-002`, `S-003`. Backend integer voucher_no internal sequence rakhta hai (sorting/queries ke liye); display label `voucher_no_label` field me alag store hota hai. User chahe toh `S-050` se start kar sakta hai ya `CUSTOM-XYZ` likh sakta hai — full edit allowed." },
      { type: "feature", text: "🎫 **Purchase Voucher Auto Number `P-001`** — Same flow Purchase Book me bhi: form khulte hi `P-001` pre-fill, editable. PDF, table, WhatsApp message — sab jagah `P-001` format. Backend bhi `P-NNN` format hi PDF aur Excel exports me bhejta hai." },
      { type: "feature", text: "🔍 **2 New Endpoints** — `GET /api/sale-book/next-voucher-label` aur `GET /api/purchase-book/next-voucher-label` — front-end form open karte time call karta hai aur next serial preview milta hai (e.g. `{voucher_no_label: 'S-005', voucher_no: 5}`)." },
      { type: "improvement", text: "📄 **Display Standardized** — Sab jagah `#1, #2` ki jagah `S-001, P-001` dikhne laga hai: GST Sale Book table, Purchase Voucher table, voucher PDF (top right + summary), GST Summary dialog (header), WhatsApp message text, PDF filename (`sale_invoice_S-001.pdf` instead of `sale_invoice_1.pdf`)." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Voucher prefix logic Python (web) + Electron desktop-app + local-server teeno me parallel applied. Node Backends bhi ab voucher_no auto-increment karte hain (pehle req.body se directly leta tha)." },
      { type: "improvement", text: "↩️ **Backward Compat** — Existing vouchers jinka `voucher_no_label` set nahi hai (purane records), unke liye fallback `S-{padStart(voucher_no, 3, '0')}` automatically dikhta hai (helper `formatVoucherNo()`). Koi DB migration ki zarurat nahi." },
    ],
  },
  {
    version: "104.43.0",
    date: "Feb 16, 2026",
    title: "v104.43.0 — 🚛 Auto Vehicle Weight: Purchase / Sale Toggle + BP-Sale Green Tick",
    items: [
      { type: "feature", text: "🚛 **Purchase / Sale Toggle Tab** — Auto Vehicle Weight aur Auto Weight Entries section me ab `Purchase` aur `Sale` ka toggle button group hai (top right). Default `Purchase` view me Receive(Purchase) entries dikhti hain (purane jaisa). `Sale` button click karne par sirf Dispatch(Sale) entries dikhti hain — alag table layout ke saath Sale-specific columns: **RST, Date, Vehicle, Party, Destination, Product, Bags, Bag Type, Net Wt, Cash Paid, Diesel Paid, Remark**. Purane Mandi/Source field, 1st/2nd Wt, G.Issued, TP No., TP Wt — ye sab Sale view me **hide ho jaate hain** kyunki Sale me relevant nahi hote." },
      { type: "feature", text: "🟢 **BP Sale Linked Green Tick** — Jab user kisi RST ka BP Sale voucher bana leta hai (Rice Bran / Broken / Kanki / Husk register me), us RST ki edit aur delete buttons **Auto Weight Entries Sale view** me automatically hide ho jaati hain, aur green ✓ checkmark dikhta hai — Paddy entries ke jaisa flow. New endpoint `/api/vehicle-weight/linked-rst-bp-sale` `bp_sale_register` se RSTs nikaalta hai (slash-joined multi-truck `123/124` bhi handle karta hai)." },
      { type: "feature", text: "🔍 **Filters Sale-aware** — Sale view me 'Mandi' filter ka label automatically '**Destination**' ho jaata hai aur placeholder bhi (`Destination...`). Date From, Date To, RST, Vehicle, Party — sab filters dono modes me kaam karte hain. Excel + PDF export bhi current trans_type filter respect karte hain." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Naya `trans_type` query parameter (`/api/vehicle-weight`) aur naya `/api/vehicle-weight/linked-rst-bp-sale` endpoint Python (web), Electron desktop-app aur local-server teeno me applied. Sequence: `linked-rst` (mill_entries) for Purchase, `linked-rst-bp-sale` (bp_sale_register) for Sale." },
    ],
  },
  {
    version: "104.42.0",
    date: "Feb 16, 2026",
    title: "v104.42.0 — 🎫 BP Sale Auto Voucher Number (S-001) + Oil Premium Bi-Directional Lookup",
    items: [
      { type: "feature", text: "🎫 **Auto Voucher Number for BP Sales** — Jab user 'New Sale' (Rice Bran / Broken / Kanki / Husk) form kholta hai, **Voucher No** field automatically pre-fill ho jaata hai next serial ke saath: `S-001`, `S-002`, `S-003`, ... System existing `S-NNN` pattern scan karke next number assign karta hai. User chahe toh edit kar sakta hai (strict validation nahi — aap `CUSTOM-XYZ` bhi likh sakte ho)." },
      { type: "feature", text: "🔍 **Oil Premium (Lab Test) Bi-Directional Autofill Verified** — Oil Premium entry form me aap `Voucher No` ya `RST No` dono me se koi bhi daalo — onBlur pe `/oil-premium/lookup-sale` endpoint fetch hoke party name, rate (sauda amount ya rate/qtl), qty, date sab auto-fill ho jaata hai. Backend verified: `S-001` voucher → RST-TEST-01 sale mila; `RST-TEST-01` → S-001 sale mila. Doosra field bhi (non-entered) auto-fill ho jaata hai." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Feature Python (web), Electron desktop-app aur local-server teeno me parallel me apply hai. Node backends me bhi naya endpoint `GET /api/bp-sale-register/next-voucher-no` + POST auto-gen same `S-NNN` sequence logic with lowDB scan." },
      { type: "improvement", text: "💡 **Workflow speedup** — Pichle saath din data entry me user ko manually 'voucher_no' guess karna padta tha (aur Oil Premium me match kara ke Lab Test calculate karna). Ab: form khulte hi ready `S-NNN` — bas party + weight + rate daal do." },
    ],
  },
  {
    version: "104.41.3",
    date: "Feb 16, 2026",
    title: "v104.41.3 — 🔍 Cash Book Filter Dropdowns Always Populated",
    items: [
      { type: "fix", text: "🔍 **Party Type dropdown empty fix** — Reported: 'Party Type me kuch nahi aata, sirf All Types dikhta hai.' Cause: Cash Book ke Party Ledgers view me jab tak user filter nahi lagata, backend se `allTxns` fetch nahi hota tha (performance ke liye), lekin **dropdowns ko `allTxns` chahiye party_type aur party names list karne ke liye**. Fix: ab `allTxns` lightweight call hamesha hota hai (page=0 lightweight list), lekin filtered txn fetch + summary tabhi hota hai jab user filter daale. Heavy ledger view fast bhi rahegi aur dropdowns turant populated honge." },
      { type: "fix", text: "🔍 **Select Party — All parties suggestion on focus** — Reported: 'Select Party pe click karte hi sab parties dikhna chahiye, search karne par hi nahi.' Fix: ab Select Party input pe click/focus karte hi (kuch type karne se pehle bhi) **complete party list dikhti hai** (Owner badge, Truck/Agent/Local Party badge ke saath). Type karne par filtered list. Search clear karne par wapas full list." },
    ],
  },
  {
    version: "104.41.2",
    date: "Feb 16, 2026",
    title: "v104.41.2 — 🚨 Owner Expense Payment Ledger Fix (Titu's JAMA)",
    items: [
      { type: "fix", text: "🚨 **Owner Expense Ledger Fix** — Reported issue: 'Titu ne 1000 pay kiya Rakhad Fikai ko, par Titu ke ledger me JAMA nahi hua.' Cause: backend tha returning `txn_type='nikasi'` (mill perspective) when querying Titu's owner ledger. Fix: jab Cash Book me Owner ledger filter (party_type=Owner + Titu) lagta hai, ab automatically direction flip hoti hai sirf account=owner entries ke liye — **Owner ne mill ke liye paisa diya = JAMA (CR, green)**, **Owner ne mill se paisa liya = NIKASI (DR, red)**. Running balance bhi sahi compute hota hai (mill ka karz Owner ki taraf = positive CR)." },
      { type: "fix", text: "🚨 **Combined Owner Ledger View** — Pichle fix ke baad Owner ledger me sirf `account=owner` wali entries dikhti thi, aur **Cash/Bank se Titu ko diya/liya 1,00,000 jama nahi dikha raha tha**. Fix: ab Owner ledger me dono sources combine hote hain — (1) `account=owner` (Titu ne mill expense paid) jo flip ke saath dikhta hai, aur (2) `account=cash/bank` jisme `category=Titu, party_type=Owner` ho (mill ne Titu se cash liya / Titu ko diya), jo direct dikhta hai. **Auto-ledger duplicates exclude** kiye taaki double-counting na ho." },
      { type: "fix", text: "🔄 **Select Party Clear Bug Fix** — Pichle fix me jab user 'Titu' ke X button par click karta tha, sirf party name clear hota tha par **'Party Type: Owner' filter lock reh jaata tha** — uske baad doosri party (e.g. MBOPL) search nahi dikhti thi dropdown me. Fix: X click karne par OR fresh text type karne par dono `category` aur `party_type` clear ho jaate hain — koi bhi party search ho sakta hai." },
      { type: "improvement", text: "📄 **PDF + Excel + WhatsApp PDF bhi sahi** — Titu ke owner ledger ka PDF/Excel export bhi same combined+flipped view dikhata hai (Cash Book ke saath consistent)." },
      { type: "improvement", text: "🎨 **Owner Account Badge** — Cash Book transactions table me owner txns ka 'Account' column ab green '**Owner (Titu)**' badge dikhata hai (pehle 'Ledger' purple dikhata tha)." },
      { type: "improvement", text: "🔄 **Triple-Backend Parity** — Fix Python (web), Electron desktop-app aur local-server teeno backends me apply kiya gaya hai (cash-book GET + Excel + PDF endpoints)." },
    ],
  },
  {
    version: "104.41.1",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.41.1 — 🚨 Owner Ledger (Titu) Party Search me Visible Fix",
    items: [
      { type: "fix", text: "🚨 **Owner Ledger Search Fix** — Cash Book → Party Ledgers ke search dropdown me Owner accounts (Titu, etc.) nahi dikh rahe the. Reason: backend search sirf `category` field aggregate karta tha, par owner txns ka name `owner_name` field me hota hai (category me 'Rakhad Fikai' hota hai jo wo owner ne pay kiya). Fix: dropdown me ab owner_name bhi shaamil hai, **purple 'Owner' badge** ke saath. Click karne par automatic `party_type='Owner'` filter set ho jata hai aur Titu ka complete ledger dikhata hai." },
      { type: "improvement", text: "💡 **Tip** — Titu ne kisi vendor ko 1000 pay kiya mill ke liye → Titu ke ledger me yeh entry **JAMA (CR)** show karega (mill ne Titu se 1000 le liya — owe karta hai). Search 'Titu' karke confirm kar sakte ho." },
    ],
  },
  {
    version: "104.41.0",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.41.0 — 🎨 DR=Red, CR=Green + PDF/Excel/WhatsApp Order Confirm",
    items: [
      { type: "improvement", text: "🎨 **Color Convention Update** — User feedback ke according:\n  - **DR (lena hai, pending receivable)** → **RED** (chinta — paisa pending hai chase karna hai)\n  - **CR (dena hai ya advance received)** → **GREEN** (settled / safe)\n  Cash Book + Reports → Party Ledger dono jagah lagu." },
      { type: "fix", text: "📅 **PDF + Excel + WhatsApp PDF Chronological Verified** — Backend `cash-book/pdf`, `cash-book/excel`, `party-ledger/pdf`, `party-ledger/excel` saare endpoints `sort('date', 1)` use karte hain (oldest top → newest bottom). WhatsApp pe bheja PDF bhi same backend se aata hai — agar aapko abhi bhi ulta dikha, toh purana cached PDF hoga, refresh karke check karein." },
    ],
  },
  {
    version: "104.40.9",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.40.9 — 🚨 DR/CR Inverted Fix (Lena=DR, Dena=CR)",
    items: [
      { type: "fix", text: "🚨 **DR/CR Convention Sahi Kiya** — Pichli release me galti se invert ho gaya tha. Sahi accounting standard:\n  - **Lena hai (party owes us / receivable)** → **DR** (Debit)\n  - **Dena hai (we owe party / payable)** → **CR** (Credit)\n  - Settled (₹0) → no suffix\n\nExample: MBOPL ka balance ₹1,07,804.55 jisme aapne maal becha aur party ne pura nahi diya — yeh **DR** hai (lena hai). Pehle galti se 'CR' dikha raha tha, ab 'DR' dikhayega." },
      { type: "improvement", text: "🎨 **Color Convention** — DR (lena hai, paisa aane wala) → emerald/green (good news), CR (dena hai, paisa jaane wala) → amber (caution). Cash Book + Reports → Party Ledger dono jagah uniform." },
    ],
  },
  {
    version: "104.40.8",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.40.8 — 💼 Professional DR/CR Balance Display (Indian Accounting Standard)",
    items: [
      { type: "improvement", text: "💼 **Negative Balance → DR/CR Format** — Pehle balance column me '₹-1,07,804.55' minus sign ke saath dikhta tha (galat-galat lagta tha). Ab Indian accounting standard ke according:\n  - Positive balance → **'₹1,07,804.55 DR'** (Debit — party owes us, amber color)\n  - Negative balance → **'₹1,07,804.55 CR'** (Credit — we owe them, emerald color)\n  - Zero → **'₹0.00'** (settled, slate color)" },
      { type: "improvement", text: "🎨 **Color Coding Update** — Color sirf positive/negative ke according nahi, ab DR amber + CR emerald (green) hai. Professional accountant-style instant readability." },
      { type: "improvement", text: "📋 **Cash Book + Reports → Party Ledger** — Dono jagah running balance + final balance DR/CR format me dikhte hain. Reports me '(Dr)/(Cr)' lowercase tha → ab uppercase 'DR/CR' standard." },
      { type: "improvement", text: "🛠️ **Reusable Helper** — Naya `formatBalanceDrCr()` utility — future me kahin bhi balance dikhana ho toh consistent format ke liye use ho sakta hai." },
    ],
  },
  {
    version: "104.40.7",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.40.7 — 📎 Smart PDF Filenames (Context-Aware) for WhatsApp + Downloads",
    items: [
      { type: "improvement", text: "📎 **WhatsApp PDF ka naam Context-Aware** — Pehle har PDF 'cashbook.pdf' ya 'report.pdf' jata tha. Ab jis context se bhej rahe ho us ke according naam ata hai:\n  - Cash Book pe Party 'MBOPL' ke ledger ka PDF → **`MBOPL_party_ledger.pdf`**\n  - Reports → Party Ledger 'Gayatri Agro' → **`Gayatri_Agro_party_ledger.pdf`**\n  - Stock Register → **`stock_register.pdf`**\n  - Lab Test → **`labtest_report.pdf`**\n  - Hemali, Staff, BP Sale, VW etc. — sab apne descriptive naam ke saath" },
      { type: "improvement", text: "🧹 **Filename Auto-Sanitization** — Special characters, spaces, slashes safe characters me convert hote hain (underscore). Example: 'Cash Test Agent (KCA)' → 'Cash_Test_Agent_KCA.pdf'. WhatsApp + filesystem dono pe valid filenames." },
      { type: "improvement", text: "🌐 **Backend Auto-Detect** — Agar frontend filename na bheje toh backend khud `pdf_url` se context detect karke proper naam set karta hai. /api/cash-book → cash_book, /party-ledger → party_ledger, /bp-sale → rice_bran_sale, etc." },
    ],
  },
  {
    version: "104.40.6",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.40.6 — 📅 Transactions Chronological Order (Oldest Top, Newest Bottom)",
    items: [
      { type: "improvement", text: "📅 **Cash Book Transactions Order Fixed** — Pehle latest transaction sabse upar dikhta tha, ab **chronological order** me dikhta hai: pehla hua transaction sabse upar, latest sabse niche. Example: Pehle Sale (₹3,15,000 nikasi) hua → fir Payment (₹3,15,000 jama) aaya — ab usi order me dikhega aur balance running calculate hoga." },
      { type: "improvement", text: "📊 **Reports → Party Ledger bhi same** — Party Ledger report me bhi entries chronologically dikhti hain (oldest first → latest bottom). Running balance correctly compute hota hai." },
      { type: "fix", text: "🧮 **Running Balance Sahi** — Har row me dikhne wala 'Balance' ab cumulative balance hai us point tak ki saari transactions ka. Last row me final balance dikhta hai." },
    ],
  },
  {
    version: "104.40.5",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.40.5 — 🐛 TOTAL Row Balance Fix (Sale + Payment = ₹0)",
    items: [
      { type: "fix", text: "🐛 **Critical TOTAL Row Fix** — Cash Book transactions table me TOTAL galat dikha raha tha. Example: ₹3,15,000 ka sale + ₹3,15,000 ka payment hone par balance ₹0 ana chahiye, lekin TOTAL row sirf Nikasi ₹3,15,000 dikha raha tha (Jama auto-pair ke naam pe galat exclude ho raha tha). Fixed: ab TOTAL all visible transactions sum karta hai — net balance correctly aata hai." },
      { type: "improvement", text: "🧹 **Cleaner Label** — Pehla 'auto-pair excluded' label hata diya — har transaction sahi count hota hai." },
    ],
  },
  {
    version: "104.40.4",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.40.4 — 🏷️ 'Lab Test Penalty' → 'Lab Test Premium' + 'All Parties' Hata Diya",
    items: [
      { type: "improvement", text: "🏷️ **Description Rename** — Ledger me jab oil-premium negative aata tha (lower quality), description 'Lab Test Penalty (-3.00%)' likhta tha — ab **'Lab Test Premium (-3.00%)'** likhta hai. Existing 3 entries automatically migrate ho gayi." },
      { type: "fix", text: "🗑️ **'All Parties' Option Removed** — Cash Book → Party Ledgers view ke party search dropdown me 'All Parties' option tha jo abhi koi kaam nahi karta tha. Hata diya — dropdown ab clean hai, sirf actual parties dikhti hain." },
    ],
  },
  {
    version: "104.40.3",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.40.3 — 💼 Sauda Amount Field + Lab Test Use",
    items: [
      { type: "new", text: "💼 **'Sauda Amount (per Qtl)' Field** — Rice Bran (BP Sale) form me ek naya **info-only** field. Aap yahan apna sauda amount likh sakte ho (e.g. 3700/Qtl) — kisi calculation me use nahi hota, sirf record ke liye. View Detail dialog me bhi cyan color me dikhta hai." },
      { type: "new", text: "🧪 **Lab Test ab Sauda Amount par calculate** — Oil Premium / Lab Test Report me Rate field ka label ab **'Sauda Amount (per Qtl)'** hai. Voucher select karte hi automatic Sauda Amount fill ho jata hai (agar sale me daala ho), warna fallback rate se. Premium amount ab sauda par calculate hota hai — exact business logic." },
      { type: "improvement", text: "📋 **Table Header Update** — Lab Test Report ki table me 'Rate' column ka heading ab **'Sauda Amt'** hai." },
    ],
  },
  {
    version: "104.40.2",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.40.2 — 🎯 Smart PKA/KCA Filter in Party Dropdown",
    items: [
      { type: "new", text: "🎯 **Account-Based Smart Filter** — New Transaction dialog me Party / Category dropdown ab payment Account ke according filter karta hai:\n  - **Cash / Owner Account** select hai → sirf **(KCA)** sub-ledgers dikhte hain (Pakka filter ho jata hai)\n  - **Bank** select hai → sirf **(PKA)** sub-ledgers dikhte hain (Kaccha filter ho jata hai)\n  - Plain (non-split) parties hamesha dikhti hain dono cases me\n  Galti se galat sub-ledger me record hone ka chance khatam." },
    ],
  },
  {
    version: "104.40.1",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.40.1 — 🚨 Cash Book Party Ledgers me bhi PKA/KCA Split (Critical Fix)",
    items: [
      { type: "fix", text: "🚨 **Cash Book → Party Ledgers View Fix** — Pichli release me sirf 'Reports → Party Ledger' me PKA/KCA split dikh raha tha, par actual **Cash Book → Party Ledgers** dropdown ek hi ledger dikha raha tha (jaise 'MBOPL' ek hi). Reason: yeh view `cash_transactions` se aata hai, jise main update karna bhool gaya tha. Ab bp_sale_register dono jagah split ledger entries banata hai." },
      { type: "new", text: "📋 **Naming Convention** — User ki request ke according: **'(PKA)'** = Pakka (capital), **'(KCA)'** = Kaccha (capital). Jaise 'MBOPL (PKA)', 'MBOPL (KCA)'. Stable naming — same party agar dobara sell ho, toh same ledger me transactions add honge, naye nahi banenge." },
      { type: "new", text: "🧪 **Lab Test Adjustment Cash Book me bhi** — Oil Premium (Lab Test) ab cash_transactions me bhi ledger entry banata hai:\n  - **+** premium → KCA me **NIKASI** (party owes more)\n  - **-** premium → KCA me **JAMA** (party owes less)\n  Cash Book ke Party Ledgers view me clearly dikhega entries ke saath." },
      { type: "fix", text: "🔄 **Migration Done** — Existing 2 split-billing sales (Cash Test Agent + MBOPL) ke ledger entries automatic re-create ho gaye PKA/KCA format me. Existing oil premiums bhi re-sync ho gaye." },
    ],
  },
  {
    version: "104.40.0",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.40.0 — 📚 Pakka/Kaccha Sub-Ledger (Keshav-Style)",
    items: [
      { type: "new", text: "📚 **Auto Sub-Ledger Creation** — BP Sale (Rice Bran etc.) me Split Billing ON ho toh ek hi party ke 2 alag ledger banenge: **'Gayatri Agro (Pka)'** + **'Gayatri Agro (Ka)'**. Pakka amount Pakka ledger me, Kaccha amount Kaccha ledger me. Same party agar dobara sell hua, toh existing same ledger me transactions add honge — naye ledger nahi banenge. ✨" },
      { type: "new", text: "🧪 **Lab Test Auto-Adjustment in Kaccha Ledger** — Oil Premium (Lab Test) me agar **+** premium aaya (better quality), toh Kaccha ledger me extra **debit** entry (party owes more). Agar **-** premium aaya (lower quality), toh Kaccha ledger me **credit** entry (party owes less). Party ka effective balance automatic maintain rahega." },
      { type: "new", text: "💳 **Voucher Payment Smart Routing** — Cash Book → Sale Voucher Payment me jab payment record karte hain split-billing voucher ka:\n  - **Bank** select → 'X (Pka)' ledger me payment go karta hai\n  - **Cash / Owner** select → 'X (Ka)' ledger me payment go karta hai\n  Ledger balance correct rehta hai automatically." },
      { type: "improvement", text: "📋 **Reports/Party Ledger** — Party Ledger report me ab `Pka` aur `Ka` sub-ledgers alag-alag party ke roop me dikhte hain. Filter karke dekho ya All Parties dropdown me dono entries dikhayi denge. Total Debit/Credit dono ledger ka separately dikhega." },
      { type: "fix", text: "🔄 **Existing Data Migration** — Already-saved split-billing sales aur oil premiums ke ledger entries automatic re-organize ho gaye Pka/Ka format me. Sample test sale (Cash Test Agent ₹6,21,463) ka:\n  - Pka ledger: ₹3,25,500\n  - Ka ledger: ₹2,95,963 - ₹76,086.68 (Lab Test) = ₹2,19,876.32 effective" },
    ],
  },
  {
    version: "104.39.8",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.39.8 — 🚨 Cash Book Helper Restored",
    items: [
      { type: "fix", text: "🚨 **`getVoucherOilAdj is not defined` Fix** — Pichli iteration me helper function search-replace galti se delete ho gaya tha, par usage 2 jagah baki tha. Helper restored at top of CashBook component. Page properly load ho raha hai." },
    ],
  },
  {
    version: "104.39.7",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.39.7 — 🚨 Cash Book Crash Fix (TDZ Error)",
    items: [
      { type: "fix", text: "🚨 **Crash Fix** — Cash Book page open karte hi error aa raha tha: `Can't access lexical declaration 'getVoucherOilAdj' before initialization`. Reason: helper function declaration partySplitInfo ke baad thi. Ab function partySplitInfo se pehle declared hai — page properly load hota hai." },
    ],
  },
  {
    version: "104.39.6",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.39.6 — 🔗 Lab Test Adjustment Cash Book Payment Dialogs me bhi",
    items: [
      { type: "fix", text: "🔗 **Sale Voucher Payment me Lab Test Adj.** — Cash Book → 'Sale Voucher Payment' dialog ab Lab Test (Oil Premium) adjustment automatically pull karta hai. Voucher select karne par: Original Total (strikethrough) → Lab Test Adj. ±X → **Effective Total** + adjusted **Pakka/Kaccha balances** dikhata hai." },
      { type: "fix", text: "🔗 **New Transaction me bhi same** — Manual transaction dialog me party type karne par jo Pakka/Kaccha hint dikhta hai, woh bhi Lab Test adjustment honor karta hai. Cash/Owner select karne par effective Kaccha balance dikhta hai." },
      { type: "improvement", text: "🌐 **CashBook ab oil-premium fetch karta** hai mount par — `oilPremiumMap` build hota hai (rst_no aur voucher_no se lookup possible)." },
    ],
  },
  {
    version: "104.39.5",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.39.5 — 🧪 Lab Test Adjustment Kaccha se Minus Hoga",
    items: [
      { type: "new", text: "🧪 **Lab Test Adjustment in Sale Detail** — Rice Bran Sale Detail dialog me agar uss sale ka **Lab Test Report** (Oil Premium) hai aur Diff% se premium amount aaya hai (positive ya negative), toh ye amount ab **Kaccha portion se adjust** hota hai. Pakka + GST safe rahta hai (govt bill pe asar nahi)." },
      { type: "improvement", text: "📋 **Effective Kaccha Display** — Original Kaccha amount dikhega, fir ek line 'Lab Test Adj.' jo ±X dikhati hai (red if minus, green if plus), aur fir **Effective Kaccha** highlight me. Total bhi original strikethrough + Effective Total dikhega." },
      { type: "improvement", text: "💰 **Effective Balance** — 'Balance (Party par baki)' me ab Lab Test adjustment shaamil hota hai. E.g. Total ₹6,21,463 - Lab Test ₹76,086 = **Effective Balance ₹5,45,376** Party par." },
      { type: "improvement", text: "🟢🔴 **Smart Color Coding** — Negative adjustment red me (kaccha kam ho raha), positive adjustment green me (bonus due to better quality)." },
    ],
  },
  {
    version: "104.39.4",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.39.4 — 🏷️ Rice Bran: 'Oil Premium' Tab → 'Labtest Report'",
    items: [
      { type: "improvement", text: "🏷️ **Tab Rename** — Rice Bran section me 'Oil Premium' tab ka naam badal ke **'Labtest Report'** kar diya. Functionality wahi rahegi — sirf label clearer hai (lab oil/quality test reports yahan store hote hain)." },
    ],
  },
  {
    version: "104.39.3",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.39.3 — 🟢🟡 New Transaction me Pakka/Kaccha Live Hint",
    items: [
      { type: "fix", text: "🐛 **Prop Wiring Bug Fix** — Pichle release me `partySplitInfo` prop New Transaction dialog ko pass nahi ho raha tha. Logic compute hota tha but UI render nahi karta tha. Ab properly wired — split billing card show ho raha hai." },
      { type: "new", text: "🟢🟡 **Cash Book → New Transaction me Split Hint** — Manual transaction add karne par jab aap Party / Category mein kisi BP Sale split-billing party (e.g. Cash Test Agent) ka naam type/select karte ho, ek **Split Billing Pending** card automatic dikhta hai with Pakka (Bank) + Kaccha (Cash/Owner) balance breakdown." },
      { type: "improvement", text: "💡 **Smart Tip** — Card ke neeche tip dikhta hai: 'Bank account select hai → ye Pakka portion ka payment hai' ya 'Cash → Kaccha'. Galti se galat channel me record karne ka chance kam." },
    ],
  },
  {
    version: "104.39.2",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.39.2 — 🟢🟡 New Transaction Dialog: Pakka/Kaccha Split Display",
    items: [
      { type: "new", text: "🟢🟡 **Cash Book → New Transaction me Split Hint** — Manual transaction add karne par jab aap Party / Category mein koi naam (e.g. 'Cash Test Agent') type karte ho, agar uss party ke split-billing BP Sale vouchers pending hain, toh **'Split Billing Pending'** card automatic dikhta hai with Pakka (Bank) + Kaccha (Cash/Owner) balance breakdown." },
      { type: "improvement", text: "💡 **Smart Tip** — Card ke neeche tip dikhta hai jo aapke selected Account ke hisaab se guidance deta hai: 'Bank account select hai → ye Pakka portion ka payment hai' ya 'Cash → Kaccha'. Galti se galat channel me record karne ka chance kam." },
    ],
  },
  {
    version: "104.39.1",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.39.1 — 🪟 Voucher Payment Dialog Width Fix (Overflow)",
    items: [
      { type: "fix", text: "🪟 **Dialog Overflow Fix** — Sale & Purchase Voucher Payment dialogs me long voucher names (e.g. '[Rice Bran] Cash Test Agent - #e5bf48 | Bal: Rs.6,21,463') select karne par dialog right side se overflow ho rahi thi. Width responsive kiya — `max-w-md`, `w-[calc(100vw-2rem)]`, `overflow-hidden` ke saath. Ab desktop/tablet/mobile sab pe properly fit hota hai." },
    ],
  },
  {
    version: "104.39.0",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.39.0 — 💳 Sale/Purchase Voucher Payment: Owner Account + Pakka/Kaccha Auto Split",
    items: [
      { type: "new", text: "💳 **Owner Account** option ab Sale aur Purchase Voucher Payment dropdown me. Cash + Bank ke baad teesra option — jab koi owner (e.g. Gayatri Agro) apne pocket se payment kare/le, toh ye select karke owner ledger me record kar sakte ho." },
      { type: "new", text: "🟢🟡 **Auto Pakka/Kaccha Split Display** — Split-billing ke voucher (BP Sale) ke liye payment dialog me 2 alag balance dikhte hain: 'Pakka (Bank): Rs X' aur 'Kaccha (Cash/Owner): Rs Y'. Total balance ke saath-saath dono channels alag-alag dikhte hain." },
      { type: "new", text: "🎯 **Smart Max Hint** — Jab **Cash** ya **Owner Account** select karte ho, Amount field ka 'Max' placeholder Kaccha balance dikhata hai. **Bank** select karne par Max Pakka+GST balance dikhata hai. Galti se zyada amount nahi dalega." },
      { type: "improvement", text: "🏷️ **Mode Indicators** — Payment Mode dropdown me dikhega 'Cash → Kaccha', 'Bank → Pakka+GST', 'Owner Account → Kaccha' (sirf split vouchers ke liye). Workflow obvious." },
      { type: "improvement", text: "🌐 **Backend Owner Support** — Web backend ka `/api/voucher-payment` endpoint ab `account: 'owner'` + `owner_account: 'Gayatri Agro'` accept karta hai. Cash transactions me proper owner field record hota hai." },
    ],
  },
  {
    version: "104.38.0",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.38.0 — 🛍️ VW Sale me Bag Type Selector + Auto Stock Out",
    items: [
      { type: "new", text: "🛍️ **Bag Type Dropdown (VW Sale)** — Vehicle Weight form me jab Trans Type **Dispatch(Sale)** select karte ho, ek **Bag Type** dropdown aata hai jisme har category ka current stock dikhta hai: New (Govt), Old (Market), Bran P.Pkt, Broken P.Pkt." },
      { type: "new", text: "📉 **Auto Stock Out** — Sale entry save karte hi selected bag type ke stock se bags automatically ghatte hain. E.g. Bran P.Pkt me 500 stock tha, sale me 100 bags use kiya — stock turant 400 ho jayega. DCTracker / Bag Stock register me bhi turant reflect hoga." },
      { type: "new", text: "📊 **Live Stock Indicator** — Bags field ke saath chosen bag type ka **remaining stock** dikhega (jaise 'Stock: 25'). Agar bags > stock toh red warning '⚠ Bag stock se zyada use ho raha hai'." },
      { type: "fix", text: "🔄 **Cascade Sync** — Edit / Second-weight / Delete sab paths me linked bag entry update/delete hota hai. Bag count ya bag type change karne par turant stock recompute hota hai." },
      { type: "improvement", text: "🌐 **Triple-Backend Parity** — Same logic Python web + Electron Desktop + LAN Local Server teeno me. Reference key `vw_sale_bag:{rst_no}` ke through linked." },
    ],
  },
  {
    version: "104.37.9",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.37.9 — 🚨 CRITICAL FIX: Split Billing ka Hisab Galat Aa Raha Tha (Web Backend)",
    items: [
      { type: "fix", text: "🚨 **Split Billing Math Fix (Critical)** — Web/Cloud backend (Python) me Split Billing ki logic missing thi. Pakka ₹0 dikhata tha, Kaccha ₹0 dikhata tha, lekin Total kuch aur tha. Yeh sirf desktop app me thik tha. Ab teeno backends (web/desktop/LAN) me **same exact split logic** hai." },
      { type: "fix", text: "✅ **Sahi Calculations** — Test verified: Pakka 100Q × ₹3100 = ₹3,10,000, Kaccha 79.99Q × ₹3700 = ₹2,95,963, GST 5% on Pakka = ₹15,500, **Total = ₹6,21,463**. Sab fields properly compute hote hain aur ledger entries bhi sahi banti hain." },
      { type: "improvement", text: "🛠️ **Purani galat entries fix karein** — Agar pehle se koi split sale ka hisab galat dikha raha tha, toh use **Edit karke save** kar do — backend automatically recompute karega aur sahi values save kar lega." },
    ],
  },
  {
    version: "104.37.8",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.37.8 — 🤖 Split Billing me RST Auto-Fill (Pakka 100% Default)",
    items: [
      { type: "improvement", text: "🤖 **RST Fetch in Split Mode** — Jab Split Billing ON ho aur RST number daalein, ab Total N/W ke saath-saath **Pakka Wt automatic full weight** se pre-fill ho jata hai (100% billed default), Kaccha Wt = 0. User chahe toh Kaccha me kuch shift kar de — auto-balance turant Pakka kam kar dega." },
      { type: "improvement", text: "💡 **Smart Default** — Most common scenario me poora dispatch GST bill pe jata hai (Pakka). Agar customer Kaccha slip chahiye, toh user manually Kaccha me amount shift karega — 1-2 click me ho jayega bina manual division ke." },
    ],
  },
  {
    version: "104.37.7",
    date: "Apr 29, 2026 (Late Night)",
    title: "v104.37.7 — 🐛 RST Auto-Fetch Bug Fix in By-Product Sale",
    items: [
      { type: "fix", text: "🐛 **RST Auto-Fetch Fix** — By-Product Sale form me RST number daalne par weight auto-fill nahi ho raha tha. Backend `vehicle_weights` me field name `net_wt` hai, jabki frontend `net_weight` dhoondh raha tha — typo fix kiya. Ab RST se Party Name, Vehicle, Destination, **N/W (Kg) + N/W (Qtl)**, Bags sab auto-fill hote hain." },
      { type: "improvement", text: "🛡️ **Backward Compat** — Frontend ab dono field names support karta hai (`net_wt` aur legacy `net_weight`) — koi bhi backend variant ho, kaam karega." },
    ],
  },
  {
    version: "104.37.6",
    date: "Apr 29, 2026 (Night)",
    title: "v104.37.6 — ⚖️ Split Billing — Total N/W + Smart Auto-Divide (Pakka↔Kaccha)",
    items: [
      { type: "new", text: "⚖️ **Total N/W Field (Top of Split)** — Split Billing ON karne par sabse upar ek **Total N/W (Qtl + Kg)** field hai. RST se fetch karne par total weight yahan auto-fill hota hai (e.g. 100 Qtl). Yahi truck ka actual dispatch weight hai." },
      { type: "new", text: "🤖 **Auto-Divide Pakka ↔ Kaccha** — Total 100 Qtl me Pakka 60 Qtl daalo, **Kaccha automatic 40 Qtl** ho jayega. Aur vice-versa: Kaccha 30 daalo toh Pakka 70 ho jayega. Manual calculator ki zaroorat nahi." },
      { type: "new", text: "📐 **Pakka + Kaccha dono mein Qtl Field** — Pehle sirf Kg fields the. Ab dono section me **Qtl primary input** hai aur Kg auto-calculated read-only. Pakka Wt (Qtl) + Kg, Kaccha Wt (Qtl) + Kg." },
      { type: "improvement", text: "📋 **RST Auto-Fetch Sync** — RST number daalne par jab data fetch hota hai (e.g. 4250 Kg = 42.5 Qtl), agar Split Billing ON hai toh Total N/W me weight aa jayega. User fir Pakka/Kaccha me divide karega." },
      { type: "fix", text: "⚠️ **Mismatch Warning** — Agar Pakka + Kaccha ka total Total N/W se match nahi karta, toh small amber warning dikhta hai. Auto-balance se yeh kabhi nahi hoga, lekin manual edit pe safety net rahega." },
    ],
  },
  {
    version: "104.37.5",
    date: "Apr 29, 2026 (Night)",
    title: "v104.37.5 — 💰 Kaccha (Slip) ka Alag Rate (per Qtl)",
    items: [
      { type: "new", text: "💰 **Kaccha section me alag Rate field** — By-Product Sale ke Split Billing me Pakka aur Kaccha ka rate alag-alag set kar sakte hain. Pehle dono same rate use karte the. Ab Kaccha (slip) ka rate Pakka se zyada/kam ho sakta hai (e.g. Pakka ₹2200/Qtl + Kaccha ₹2300/Qtl)." },
      { type: "improvement", text: "🧮 **Smart Default** — Kaccha Rate field me agar kuch nahi daala, toh apne aap Pakka ke same rate use ho jayega (`Same as Pakka` placeholder dikhata hai). Aapka old workflow disturb nahi hoga." },
      { type: "improvement", text: "💵 **Kaccha Amount Auto-Update** — Kaccha rate change karte hi 'Kaccha Amount' field tatkaal recalculate ho jata hai. GST sirf Pakka portion par lagega (jaise pehle)." },
    ],
  },
  {
    version: "104.37.4",
    date: "Apr 29, 2026 (Night)",
    title: "v104.37.4 — 🔒 N/W (Kg) Field Locked — Sirf Qtl Editable",
    items: [
      { type: "improvement", text: "🔒 **N/W (Kg) ab Read-Only** — Rice Bran / By-Product Sale form me **N/W (Kg)** field ab locked hai (auto-calculated). User sirf **N/W (Qtl)** me daalega, Kg automatic dikhega. Mistake by accident Kg me typing ka chance zero." },
    ],
  },
  {
    version: "104.37.3",
    date: "Apr 29, 2026 (Night)",
    title: "v104.37.3 — 🔄 By-Product Sale: N/W (Qtl) Field First, Then Kg",
    items: [
      { type: "improvement", text: "🔄 **Field Order Swapped** — Rice Bran / By-Product Sale form me ab **N/W (Qtl)** field pehle aata hai aur **N/W (Kg)** baad me — kyunki workflow me Qtl primary hota hai. Stock indicator + warning bhi ab Qtl field ke saath dikhta hai." },
    ],
  },
  {
    version: "104.37.2",
    date: "Apr 29, 2026 (Night)",
    title: "v104.37.2 — ⚖️ By-Product Sale: Kg ↔ Qtl Auto-Convert Field",
    items: [
      { type: "new", text: "⚖️ **Two-Way Kg ↔ Qtl Field** — Rice Bran / By-Product Sale form me ab **N/W (Kg)** ke saath **N/W (Qtl)** ka alag field hai. Kg me likho toh Qtl auto-fill, Qtl me likho toh Kg auto-fill (1 Qtl = 100 Kg)." },
      { type: "improvement", text: "🚀 **Faster Entry** — Slip pe agar weight Qtl me likha hai (e.g. 42.5 Qtl) toh ab calculator ki zaroorat nahi — sidha Qtl field me daalo, Kg automatic 4250 ho jayega. Aur vice-versa." },
      { type: "improvement", text: "🤖 **RST Auto-Fetch bhi sync** — Jab RST se data fetch hota hai (e.g. 4250 Kg), Qtl field bhi automatically 42.50 dikhata hai. Edit karte time bhi consistent." },
    ],
  },
  {
    version: "104.37.1",
    date: "Apr 29, 2026 (Night)",
    title: "v104.37.1 — 🎨 Light Theme Fix — Settings → Permissions Readable",
    items: [
      { type: "fix", text: "🎨 **Light Theme Bug Fix** — Settings → Permissions tab me 'Edit Window Lock' card light theme me dark grey background ke saath dikh raha tha, jisme text barely visible tha. Fixed: ab card white background pe clean black text dikhata hai. Toggle, duration buttons (2/5/10/30/60 min), custom input — sab clearly visible." },
      { type: "improvement", text: "🌐 **Global CSS Fix** — Light theme me `bg-slate-800/60`, `bg-slate-900/50`, `bg-slate-800/30` ke missing overrides add kiye. Jahan bhi yeh classes use ho rahi thi (saare modules), light theme me automatically clean hue. Future cards bhi safe." },
    ],
  },
  {
    version: "104.37.0",
    date: "Apr 29, 2026 (Evening)",
    title: "v104.37.0 — 🛠️ Internal Stability — Auto-Ledger Logic Centralized",
    items: [
      { type: "improvement", text: "🛠️ **Behind-the-Scenes Cleanup** — Truck rate aur Agent commission ke time jo Cash Book me automatically Jama entry banti hai (auto-ledger), uss code ko ek hi central jagah laaya gaya. Pehle 7 jagah duplicate logic tha — ab sirf 1 helper function. **App ka behaviour bilkul wahi hai** — koi UI/feature change nahi, sirf code zyada reliable hai." },
      { type: "improvement", text: "🧪 **Regression Tests** — Naye `test_truck_rate_refactor.py` me 4 automated tests jo verify karte hain ki: nayi entry banti hai, edit pe duplicate nahi banti, rate=0 pe entry safely delete hoti hai. Future me koi bhi change accidentally is logic ko nahi tod sakega." },
      { type: "fix", text: "📉 **payments.py** — 2146 → 2039 lines (-107 lines, ~5% chhota). Future bug fixes aur improvements ab faster ho sakte hain." },
      { type: "improvement", text: "🌐 **Triple-Backend Parity** — Python web + Electron Desktop + LAN Local Server teeno me API contract bilkul same. Aapke desktop app ka behaviour bhi unchanged." },
    ],
  },
  {
    version: "104.36.0",
    date: "Apr 29, 2026",
    title: "v104.36.0 — 🔔 Mill Parts Low Stock Notification (Header Bell)",
    items: [
      { type: "new", text: "🔔 **Low Stock Bell — Header me Notification Bell** — Header me naya 🔔 Bell icon. Jab koi Mill Part stock low (`current_stock <= min_stock`) ya **out of stock** hota hai, toh red badge me count dikhta hai. Bell pulse karta hai jab alerts hote hain — bina Mill Parts page khole turant pata chal jata hai." },
      { type: "new", text: "📋 **Click Karo, List Dekho** — Bell pe click karne se ek dropdown khulta hai jo har low/out-of-stock part dikhata hai: Part name, current stock vs min stock, unit, store room aur category. **Out of stock** items red highlight + 'OUT' badge ke saath sabse upar dikhte hain. Critical first." },
      { type: "new", text: "🔁 **Auto-Refresh** — Har **60 seconds** me background me refresh hota hai (aur jab dropdown khulta hai). KMS/Season filter respect karta hai — current FY ke alerts hi dikhte hain." },
      { type: "new", text: "🚪 **One-Click Navigate** — Dropdown ke neeche 'Mill Parts Stock kholein' button — sidha Mill Parts tab par jaata hai jahan aap restock kar sakte ho." },
      { type: "improvement", text: "💡 **Smart Filter** — Sirf un parts ke liye alert dikhta hai jinka `min_stock > 0` set hai. Master me min_stock 0 ho toh noise nahi hota — aap khud control karte ho kis part ke liye alert chahiye." },
      { type: "fix", text: "🌐 **Triple-Backend Parity** — Naya `GET /api/mill-parts/low-stock-alerts` endpoint Python web + Electron Desktop + LAN Local Server teeno me synced. Same logic, same response format." },
    ],
  },
  {
    version: "104.35.0",
    date: "Apr 28, 2026 (Night)",
    title: "v104.35.0 — 🔒 Edit Lock Across ALL Modules + Custom Duration",
    items: [
      { type: "new", text: "🔒 **5-Minute Edit Lock Feature** — Pehle yeh sirf Mill Entries me tha, ab **saare modules** me apply hota hai: Cash Book, Vehicle Weight, Hemali Payments, Sale Vouchers, Purchase Vouchers, BP Sale Register, Staff Payments. Ek hi centralized check, ek hi setting." },
      { type: "new", text: "⚙️ **NEW Settings Tab — 'Permissions'** (Settings → Permissions): Edit Window Lock toggle ON/OFF + custom duration. Lock ON hone par non-admin sirf apni entries N min ke andar edit/delete kar sakte hain." },
      { type: "new", text: "⏱️ **Custom Duration** — Preset buttons: **2 / 5 / 10 / 30 / 60 minutes** ya custom number input (1-1440 min = up to 24 hours). Aap apne workflow ke hisaab se set kar sakte ho — tight control ke liye 2 min, comfortable ke liye 30 min, ya OFF kar do test data ke liye." },
      { type: "improvement", text: "🛡️ **Admin Override** — Admin kabhi bhi koi bhi entry edit/delete kar sakte hain — yeh setting unhe affect nahi karti. Sirf non-admin users pe lock apply hota hai." },
      { type: "improvement", text: "📍 **Ownership Check** — Lock OFF hone par bhi non-admin sirf apni entries edit kar sakte hain (dusre user ki entries kabhi nahi). Yeh hamesha active rehta hai." },
      { type: "fix", text: "🌐 **Triple-Backend Parity** — Python web + Electron Desktop + LAN Local Server teeno me synced. Naya `services/edit_lock.py` (Python) aur `edit_lock_helper.js` (Node) ke through centralized check." },
    ],
  },
  {
    version: "104.34.0",
    date: "Apr 28, 2026 (Late)",
    title: "v104.34.0 — 🎯 GLOBAL Hindi PDF Fix + Cash Book Cleanup + Bug Fixes",
    items: [
      { type: "fix", text: "🎯 **GLOBAL Hindi PDF Rendering Fix** — Saare PDFs (Weight Report, Mill Entries, Stock Summary, Sale Book, Cash Book, Hemali, Mill Parts, Daily Report) me Devanagari labels ab properly render hote hain. Pehle 'मिल एंट्री / गाड़ी / पार्टी / बोरे / नकद / डीजल' jaise labels `||||||||` (vertical bars) ke roop me dikh rahe the. **Root cause:** Internal `FreeSans` font alias Inter ko point kar raha tha jisme Devanagari glyphs nahi hain. **Fix:** `FreeSans` ab NotoSansDevanagari ko point karta hai (Latin + Devanagari dono glyphs available). Saare shared PDF helpers (header, table, totals, summary, section bands) auto-detect karte hain Devanagari aur correct font use karte hain. **No caller code change needed** — har PDF automatic correct render karega." },
      { type: "fix", text: "🐛 **TOTAL Row Double-Counting Fix** — Cash Book Transactions table me TOTAL row Jama/Nikasi double dikha rahi thi. Example: 'Titu' ke ₹42,500 ke ek transaction par TOTAL Jama ₹85,000 (real cash txn + auto_ledger pair dono count ho rahe the). Fixed: ab auto_ledger pairs ko TOTAL me skip karta hai. Label transparent: 'TOTAL (N transactions, M auto-pair excluded)'." },
      { type: "fix", text: "🐛 **Auto Weight Pending Badge Fix** — Mill Entries bulk delete ke baad 'Auto Weight Entries' tab ka red badge stale rehta tha (purana count). Fixed: ab har deletion path (single + bulk + VW + Mill Entry) badge refresh trigger karta hai." },
      { type: "improvement", text: "🧹 **Cash Book — Party Summary tab REMOVED** (kaam ka nahi tha)" },
      { type: "improvement", text: "🔍 **Party Ledgers — Search-first** — Tab open karte hi ab default sab parties dump nahi hote (slow tha + bekaar tha). Empty state prompt: 'Pehle party ka naam search karein'. API call skip jab tak user search ya filter nahi lagaye → page load fast." },
      { type: "improvement", text: "🟢 **Entries + Cash Book me WhatsApp + Group icons-only** — sirf icon dikhata hai (text removed) — UI clean. Refresh/Filter/Excel/PDF buttons text+icon ke saath rakhi gayi (jaise pehle they)." },
      { type: "new", text: "🔄 **Ledger → Owner Account Converter** (NEW): Cash Book → Owner Accounts dialog me 'Pehle se Cash/Bank ledger hai? Convert karein' option. Existing party (e.g. Titu) ko ek click me Owner Capital account me migrate kar do — Preview pehle dikhata hai (kitne txns + total amount), confirm pe automatic flip+migrate (txn_type bhi auto-inverted because Owner accounting cash/bank se reversed hoti hai). Triple-backend parity (Python + Desktop + LAN)." },
      { type: "fix", text: "🌐 **Triple-Backend Parity** — Saare changes Python web + Electron Desktop + LAN Express teeno me synced. Hindi PDF fix, Owner converter, badge refresh, double-count skip — ek bhi backend me drift nahi." },
    ],
  },
  {
    version: "104.33.0",
    date: "Apr 28, 2026",
    title: "v104.33.0 — 🚀 wa.9x.design Direct File Upload + 8 New WhatsApp Share Buttons + 4 Critical Bug Fixes + Ledger→Owner Convert",
    items: [
      { type: "new", text: "📤 **Generic File Upload Endpoint** (`POST /api/whatsapp/send-file`): ab koi bhi file (PDF/Excel/Word/Image/Video, max 100 MB) directly WhatsApp pe bhej sakte ho — MIME type auto-detect hoti hai filename se. tmpfiles.org middleman bypass — wa.9x.design pe direct binary upload (~70% faster, 3-5 sec bachte hain per send)." },
      { type: "new", text: "🟢 **8 New 'WhatsApp pe bhejein' icon buttons** add hue inn jagah pe (saare green WhatsApp icon, ek-click share):" },
      { type: "new", text: "   • Daily Report (Group send button)" },
      { type: "new", text: "   • Staff Attendance (monthly Excel)" },
      { type: "new", text: "   • Stock Summary (Excel)" },
      { type: "new", text: "   • Cash Book (PDF — current filters preserved)" },
      { type: "new", text: "   • Agent / Mandi Report (PDF — current filters preserved)" },
      { type: "new", text: "   • Gunny Bags Register (PDF)" },
      { type: "new", text: "   • Hemali Payments + Hemali Monthly Summary (PDF)" },
      { type: "new", text: "   • Mill Parts Stock (PDF)" },
      { type: "new", text: "   • Sale Book + Purchase Vouchers (PDF — search/filter preserved)" },
      { type: "new", text: "🎨 **Sab Excel/PDF action buttons icon-only ho gaye** (text removed, sirf icons + tooltip on hover) — UI clean dikhta hai, har report screen pe consistent layout" },
      { type: "new", text: "🔄 **Ledger → Owner Account Convert** (NEW): Cash Book → Owner Accounts dialog mein 'Pehle se Cash/Bank ledger hai? Convert karein' option. Existing party (e.g. \"Titu\") ko Owner Account me migrate karne ka tool — Preview pehle dikhata hai (kitne txns, total amount), confirm pe automatic flip+migrate. txn_type bhi automatically inverted hota hai (Owner accounting cash/bank se reversed hoti hai)" },
      { type: "fix", text: "🐛 **Bug Fix #1 — Single WhatsApp click → group bhi jaata tha**: Daily Report me 'WhatsApp' button click karne pe group me bhi message chala jaata tha (`send_to_group: true` hardcoded tha). Fixed: ab single button sirf phone/default numbers, alag 'Group' button hai group ke liye." },
      { type: "fix", text: "🐛 **Bug Fix #2 — Weighbridge stuck at last weight**: Truck weighbridge se hatne ke baad bhi UI 'STABLE - LOCKED' state me phasi rehti thi (e.g. 5,850 kg dikhata rahta no truck case me). Fixed: 3-second staleness timeout + periodic checker — bridge idle hote hi auto-reset to 0." },
      { type: "fix", text: "🐛 **Bug Fix #3 — Weight Report PDF Hindi labels `||||||||`**: PDF me \"गाड़ी / पार्टी / माल / बोरे / दिनांक\" vertical bars/boxes ke roop me dikh rahe the (FreeSans font me Devanagari nahi). Fixed: NotoDeva font use ab — saare Hindi labels properly render hote hain." },
      { type: "fix", text: "🐛 **Bug Fix #4 — bp_sale_register CRASH on DELETE** (Desktop/LAN): Operator precedence bug — DELETE par `Cannot read properties of undefined` crash. Fixed `matchRef` guard with proper parens." },
      { type: "fix", text: "🐛 **Bug Fix #5 — Auto Weight pending badge stale**: Bulk delete ke baad red \"1\" badge purana count dikhata rehta tha. Fixed: ab har deletion path (single + bulk + VW + Mill Entry) badge refresh trigger karta hai." },
      { type: "fix", text: "🌐 **wa.9x.design Provider Production-Ready**: New endpoints `getGroupList`, `sendGroup`, `sendMessageFile`, `sendGroupFile` integrate ho gaye. Settings me provider toggle ke saath dynamic footer (\"wa.9x.design API use hota hai\" vs \"360Messenger\")." },
      { type: "fix", text: "🔄 **Triple-Backend Parity**: Python web + Desktop App + LAN Local Server teeno me saare changes synced — koi drift nahi. Multer-based multipart upload, owner conversion endpoint, weighbridge staleness — sab teeno backends me available." },
    ],
  },
  {
    version: "104.28.35",
    date: "Apr 2026",
    title: "v104.28.35 — 📋 Dashboard & Summary PDFs: Govt Target vs Agent Cutting Clarity",
    items: [
      { type: "fix", text: "📋 **Mandi Targets table mein columns rename ho gaye** taaki Govt target aur Agent ka extra cutting clearly distinguish ho jaye:" },
      { type: "fix", text: "   • **Target (Q)** → **Govt Target (Q)** (5000 — yeh govt ka actual target)" },
      { type: "fix", text: "   • **Expected (Q)** → **Agent Cutting (Q)** (250 — yeh sirf cutting amount, NOT target+cutting). Pehle 5250 dikhata tha (combined), ab 250 alag dikhega" },
      { type: "fix", text: "🎯 **Pending aur Progress ab Govt Target ke against count hote hain** (pehle Expected ke against count hote the). Cutting% agent ki extra commission hai, govt ka procurement target nahi — isliye yeh formula sahi hai" },
      { type: "fix", text: "📊 **TOTAL row** + **KPI hero banner** ka 'TARGETS' stat bhi Govt Target dikhata hai (pehle Expected dikhata tha)" },
      { type: "fix", text: "🔄 **Triple-Backend Parity**: Python web + Desktop App + LAN Local Server teeno mein same change. ON-SCREEN Dashboard table aur backend `/api/mandi-targets/progress` endpoint untouched (sirf PDF + Summary Report mein change). User ki dashboard view experience pehle jaisi hi hai" },
    ],
  },
  {
    version: "104.28.34",
    date: "Apr 2026",
    title: "v104.28.34 — 💸 Per-Mandi Default Bhada Rate (Auto-Fill Truck Payments)",
    items: [
      { type: "new", text: "💸 **Mandi Target form mein naya field**: Default Bhada Rate (₹/QNTL). Har Mandi ke liye apna ek default truck rate save kar sakte ho. Optional — empty chhodo toh 0 rahega" },
      { type: "new", text: "⚡ **Auto-fill in Truck Payments**: jab us mandi ki naya truck entry add karte ho, Bhada Rate automatically pre-fill ho jayega is mandi ke saved default se. User per-entry edit kar sakta hai (still flexible). Sabse common case (har mandi ka fixed rate) — bahut time bachega" },
      { type: "fix", text: "🛡️ **Smart fallback**: agar truck payment doc mein rate explicitly set hai (non-zero), woh respect hota hai. Sirf rate=0 / empty hone par mandi ka default lookup hota hai" },
      { type: "fix", text: "🔄 **Triple-Backend Parity**: Python (MandiTarget model + entries.py POST + payments.py rate lookups), Desktop App (`getTruckPayment` + new `_getMandiDefaultBhadaRate` helper in main.js + sqlite-database.js), aur LAN Local Server — sab synced. End-to-end tested via API: entry created → Truck Payment list mein rate=18 auto-filled ✓" },
    ],
  },
  {
    version: "104.28.33",
    date: "Apr 2026",
    title: "v104.28.33 — 💰 Truck Payment Default Rate: 32 → 0",
    items: [
      { type: "fix", text: "💰 **Truck Payments default rate (Bhada) ab 0 hai** — pehle hardcoded 32 Rs/qntl tha. Ab user khud rate dalega entry pe — agar nahi dala toh 0 ke saath save hoga (overcharging risk hat gaya)" },
      { type: "fix", text: "🔄 **Triple-Backend Parity** — saare 3 backends mein same fix: Python (`/app/backend/routes/entries.py, payments.py, exports.py, private_trading.py, fy_summary.py`), Desktop App (`main.js, sqlite-database.js, routes/exports.js, routes/fy_summary.js`), aur LAN Local Server (same files mirrored)" },
      { type: "fix", text: "✅ **JS falsy bug avoided**: `||` ki jagah `??` (nullish coalescing) use kiya — agar user explicitly 0 set kare toh respect ho (pehle `0 || 32` JavaScript me 32 deta tha, ab `0 ?? 0` correctly 0 deta hai)" },
    ],
  },
  {
    version: "104.28.32",
    date: "Apr 2026",
    title: "v104.28.32 — 📊 Excel Auto-Open Fixed (4-Method Robust Cascade)",
    items: [
      { type: "fix", text: "📊 **Excel auto-open ab pakka kaam karega Windows pe**. Pehle `shell.openPath` use ho raha tha jo Windows ka ShellExecute call karta hai — yeh PDF ke liye theek tha but Excel ke liye silently fail ho jaata tha (DDE conflict ya Excel already-running issue)" },
      { type: "fix", text: "🛡️ **4-method cascade** add kiya: (1) `shell.openPath` try karo first → (2) fail hua toh `shell.openExternal('file:///...')` try karo → (3) Windows pe `cmd /c start \"\" \"path\"` spawn karo (most reliable for Office files) → (4) last resort: file's folder open karke file ko select kar do, taaki user one-click pe khol sake" },
      { type: "new", text: "🔍 **Detailed logging** — har attempt ka log Electron DevTools console mein dikhega. Agar future mein koi issue ho toh exact method aur error pinpoint kar sakte hain" },
      { type: "fix", text: "Yeh same fix dono download paths pe apply hua: (a) IPC `download-and-save` (jab `window.electronAPI.downloadAndSave` use hota hai), aur (b) `will-download` event (jab `window.open` se download trigger hota hai). Helper module-scope pe hai so dono paths ek hi reliable code use karte hain" },
    ],
  },
  {
    version: "104.28.31",
    date: "Apr 2026",
    title: "v104.28.31 — 🛟 Saare PDFs ka Bottom Banner Centering Fix + 📑 Section Bookmarks",
    items: [
      { type: "fix", text: "🛟 **GLOBAL FIX**: SAARE PDF reports (Cash Book, Mill Entries, Vehicle Weight, Sale Book, Truck Lease, Diesel, Hemali, Purchase Vouchers, Dashboard, Summary etc) ke bottom Summary Banner ab full page width pe spread hote hain. Pehle banner narrow tableW pe stick tha → page ke left side pe dikhta tha → user complaint 'wo abhi side mai aaraha hai'. Ab `drawSummaryBanner` ek hi jagah pe **auto-expand** karta hai full content width tak — koi bhi caller (10+ files) automatically benefit hua bina file-by-file edit kiye" },
      { type: "new", text: "📑 **Per-Section PDF Bookmarks**: Long reports me ab PDF reader ke side panel se directly section pe jump kar sakte hain. **Summary Report** mein 5 bookmarks (Stock Overview / Mandi Targets / Truck Payments / Agent Mandi Payments / Grand Total). **Dashboard PDF** mein Stock + Targets bookmarks. **Hemali Monthly Summary** mein har Sardar ka apna bookmark (Sardar: Rajesh, Sardar: Vijay, etc) — long Hemali reports mein bahut helpful" },
      { type: "fix", text: "🔄 **Triple-Backend Parity** — Desktop App + LAN Local Server dono mein same fix. PDFKit ka `doc.outline.addItem(title)` use kiya gaya jo native PDF outline standard support karta hai (Acrobat / SumatraPDF / Edge / browser sab supports karte hain)" },
    ],
  },
  {
    version: "104.28.30",
    date: "Apr 2026",
    title: "v104.28.30 — 🐛 Agent / Mandi Payments Calculation Fix + Section Gap Fix",
    items: [
      { type: "fix", text: "🐛 **Agent commission ab TP Weight pe calculate hota hai** (achieved procurement), pehle target_qntl pe hota tha — galat tha. Formula: `Total = TP_Weight × base_rate + (TP_Weight × cutting% / 100) × cutting_rate`. User example: Kesinga ka target 5000 Q tha but actual TP weight 278 Q hua → ab Total = 278 × 10 = Rs.2,780 (sahi), pehle Rs.51,250 dikha raha tha (galat — target × rate)" },
      { type: "fix", text: "🐛 **Cutting rate 0 set karne pe ab 0 hi count hota hai** (pehle JavaScript `||` operator 0 ko falsy mantа thaa aur fallback Rs.5 le leta tha). Ab `??` (nullish coalescing) use karke explicit 0 respect hota hai. Test verified: `cutting_rate=0` → Rates column 'Rs.10/Rs.0' dikhta hai aur cutting commission Rs.0 hi count hoti hai" },
      { type: "fix", text: "🛟 **Section header GAP fix** — pehle agar previous section ka table page ke end pe khatam hota tha aur agle section ka banner page ke neeche fit nahi hota tha, toh banner aur uska table alag-alag pages pe chale jaate the (orphan banner). Ab **`ensureSpace` helper** pre-check karta hai ki banner + at least 3 rows fit ho rahe hain ya nahi — agar nahi, toh full new page se start hota hai" },
      { type: "fix", text: "🔄 **Triple-Backend Parity** — Python (web) + Desktop App + LAN Local Server teeno mein same fix apply. Auto-sync via Python regex extractor + `pdf_helpers.js` shared helpers" },
      { type: "fix", text: "📋 **Agent table column** ab 'Target' ki jagah 'TP Weight' label dikhata hai — clarity ke liye" },
    ],
  },
  {
    version: "104.28.29",
    date: "Apr 2026",
    title: "v104.28.29 — 🛠️ Hemali Monthly Summary PDF & Excel: Desktop App Parity (Sardar Bands + KPI Banner)",
    items: [
      { type: "fix", text: "🛠️ **Hemali Monthly Summary PDF (Desktop App)**: pehle basic version tha — sirf colored Sardar name text + plain table. Ab Python wala full version dikhega → Sardar pill bands (orange full-width with name + Current Advance Balance), per-sardar TOTAL row in amber highlight, aur **bottom mein 7-stat KPI Summary Banner** (TOTAL SARDARS / PAYMENTS / GROSS WORK / TOTAL PAID / ADV GIVEN / ADV DEDUCTED / OUTSTANDING)" },
      { type: "fix", text: "🐛 **Data bug fix**: pehle desktop-app sirf 'paid' payments ka work count karta tha. Ab Python ki tarah work count hota hai REGARDLESS of payment status (unpaid bhi count). Iska matlab Total Work field ab actual gross work dikhata hai (jaise mahine ka actual workload), aur Outstanding (Work - Paid) calculation accurate ho gayi" },
      { type: "fix", text: "🎨 **Hemali Monthly Summary Excel (Desktop App)**: same redesign — Sardar pill rows (orange), header row in navy, per-sardar TOTAL row in amber, aur bottom mein KPI summary banner. Ab Excel + PDF dono identical look denge" },
      { type: "fix", text: "🔄 **LAN Local Server bhi sync** ho gaya — same Hemali Monthly Summary design. Triple-Backend Parity restored" },
    ],
  },
  {
    version: "104.28.28",
    date: "Apr 2026",
    title: "v104.28.28 — 🛠️ Desktop App Dashboard & Summary Report PDFs Professional Redesign (Critical Fix)",
    items: [
      { type: "fix", text: "🛠️ **CRITICAL FIX**: Pichli release (v104.28.27) mein Dashboard + Summary Report PDF redesign sirf web preview (Python backend) pe apply hua tha — Desktop App mein wahi old plain PDF aata tha. Triple-Backend Parity miss ho gaya tha. Ab Desktop App + LAN Local Server dono mein bhi same NEW design dikhega" },
      { type: "fix", text: "🎨 **Desktop App Dashboard PDF**: KPI hero banner with 7 colour-coded stats (PADDY IN/USED/AVAILABLE/RICE PRODUCED/TARGETS/ACHIEVED/PENDING), orange section band for Stock + teal for Targets with informative subtitles, TOTAL row in amber highlight, achievement % auto-coloured (green ≥100%, gold 50-99%, red <50%)" },
      { type: "fix", text: "🎨 **Desktop App Summary Report PDF**: Earlier sirf 3 lines tha ('Total Entries: X', 'Total QNTL: X'). Ab full executive report — KPI hero banner + 5 colour-coded section bands (Stock orange, Targets teal, Truck purple, Agent rose, Grand Total amber) + status badges (Paid green / Pending red) + Grand Total executive emphasis row" },
      { type: "new", text: "🛠️ **New reusable helper** `drawSectionBand()` added to `pdf_helpers.js` — same 8 colour presets as Python backend's `get_pdf_section_band()`. Future report enhancements ke liye consistent visual language available" },
    ],
  },
  {
    version: "104.28.27",
    date: "Apr 2026",
    title: "v104.28.27 — 🎨 Dashboard & Summary Report PDFs ko Professional Redesign",
    items: [
      { type: "fix", text: "🎨 **Dashboard PDF redesigned** — top pe colorful KPI hero banner (PADDY IN / USED / AVAILABLE / RICE PRODUCED / TARGETS / ACHIEVED / PENDING) with color-coded stats. Section header bands (Stock = orange, Targets = teal) with subtitle showing FY/season/achievement. TOTAL row amber-highlighted with bold dark text. Negative values (gunny -455) auto-shown in BOLD RED. Achievement % auto-coloured: green ≥100%, gold 50-99%, red <50%. Zebra row striping for readability. Duplicate tagline removed" },
      { type: "fix", text: "🎨 **Complete Summary Report PDF redesigned** — same hero KPI banner with 7 stats including Grand Total, Paid (with %), Balance Due. Each section gets its own coloured band: orange (Stock), teal (Targets), purple (Truck), rose (Agent/Mandi), amber (Grand Total). Status column shows Paid in green / Pending in red. Grand Total final row in dramatic amber-700 with white text — looks like a financial executive summary now" },
      { type: "fix", text: "📐 **Page-centered layout** — both PDFs use 14pt effective margin both sides (8pt page margin + 6pt frame padding) so content is perfectly centered on A4 page. Same width-percentage based column sizing — no more hardcoded mm values that overflow when data changes" },
      { type: "new", text: "🛠️ **New reusable helper** `get_pdf_section_band(title, subtitle, preset)` added to `export_helpers.py` — 8 colour presets (navy/teal/orange/emerald/rose/purple/amber/slate) with automatic accent stripe on left edge. Future reports can use this for consistent professional section banding" },
    ],
  },
  {
    version: "104.28.26",
    date: "Apr 2026",
    title: "v104.28.26 — 📂 Excel Auto-Open (Same UX as PDF)",
    items: [
      { type: "fix", text: "📂 **Excel files ab PDF ki tarah auto-open hote hain** — Desktop App mein .xlsx download hone ke baad system ke default app (Excel / LibreOffice / etc.) mein automatically open ho jaata hai. Pehle sirf PDF auto-open hoti thi" },
      { type: "fix", text: "🛟 **Smart fallback** — agar user ke system mein .xlsx ka koi default app set nahi hai (jo silent fail karta tha), ab automatically file ka folder open ho jaata hai (showItemInFolder) so user ek-click mein file tak pohonch jaye" },
      { type: "fix", text: "🌐 **Browser preview**: PDF download ke baad ab bhi inline tab mein open hota hai. Excel browser inline render nahi kar sakta — toast notification dikhta hai 'Excel downloaded · Downloads folder mein hai'. Pehle duplicate download issue tha (window.open xlsx blob ko render nahi kar paata tha aur dobara download trigger karta tha) — woh fix" },
    ],
  },
  {
    version: "104.28.25",
    date: "Apr 2026",
    title: "v104.28.25 — 🔐 Backup Encryption (License-Key Derived AES-256-GCM)",
    items: [
      { type: "new", text: "🔐 **Backup Encryption** — Settings → Data tab mein naya toggle. Enable karne par naye saare backups (manual + automatic + logout) AES-256-GCM se encrypt hote hain. Encryption key aapki license key se derive hoti hai (scrypt KDF + 256-bit). Backup file leak hone par bhi data unreadable" },
      { type: "new", text: "🛡️ Backwards compatible — purani plain backups ab bhi normally restore hoti hain. Restore code automatic detect karta hai (encrypted vs plain) aur sahi path follow karta hai" },
      { type: "new", text: "🚨 Wrong license = clear error — agar koi different license wala system pe encrypted backup restore karne ki koshish kare, system clear message deta hai 'license key does not match' (raw crypto error nahi). Tampered files bhi GCM auth tag se detect hoti hain" },
      { type: "new", text: "📊 Settings UI mein live status — kitni backups encrypted hain, kitni plain, license activated hai ya nahi — sab dikhta hai. Toggle disabled rehta hai jab tak license activate na ho" },
      { type: "fix", text: "🔄 Triple-Backend Parity — endpoint surface match karta hai. Desktop App full encryption (real license). LAN Local Server stub returns 'use BitLocker / OS-level encryption' since LAN host pe license nahi hota. Encrypted backup file LAN pe restore karne ki koshish karne par clear error dikhta hai" },
    ],
  },
  {
    version: "104.28.24",
    date: "Apr 2026",
    title: "v104.28.24 — 🎯 Hemali PDF Page-Centered + 🛡️ Backup Management Polish",
    items: [
      { type: "fix", text: "🎯 Hemali Monthly Summary PDF mein content (Sardar bands + tables + summary banner) ab **page pe perfectly centered** dikh raha hai. Pehle entire content block left-shifted tha (left=26pt, right=14pt), banner alag-alag width pe aata tha — ab sab ek hi 802pt content block mein perfectly aligned" },
      { type: "fix", text: "🔧 Root cause fix — ReportLab ka default Frame internal padding (6pt) leftMargin=20 ke saath effective offset 26pt bana raha tha, jisse 802pt content right side overflow karta tha. Margins ko 14pt set kiya (14+6=20 effective) — content ab x=20..822 pe sit hota hai (842pt page pe equal 20pt margin both sides)" },
      { type: "new", text: "📊 Backup UI mein **Total Size display** add — har time pata chalega kitna disk space backups le rahi hain (status banner ke right side)" },
      { type: "new", text: "⚠️ **100MB warning banner** — total backup folder size 100MB cross hote hi red alert dikhta hai jisme cleanup karne ki suggestion hoti hai. Disk space full hone se pehle hi awareness mil jaati hai" },
      { type: "new", text: "🕐 **Daily Auto-Backup Time Picker** — pehle backup random time pe banta tha, ab user khud schedule kar sakta hai (00:00 to 23:00 dropdown). Schedule disable karne ka option bhi hai (sirf logout + manual backup chalegi). Saved setting Desktop App + LAN host dono mein respect hoti hai" },
    ],
  },
  {
    version: "104.28.23",
    date: "Apr 2026",
    title: "v104.28.23 — 🎯 PDF Banner Centered + Hemali Monthly Summary Redesign + Branding Audit",
    items: [
      { type: "fix", text: "🎯 PDF Summary banner ab **horizontally centered** on every page — pehle left-aligned tha. Reusable helper mein `hAlign='CENTER'` set kar diya, sab reports ek saath fix" },
      { type: "new", text: "📊 Hemali Monthly Summary PDF + Excel ab fully professional — branded header (NAVKAR AGRO + address), per-Sardar orange section bands with current advance balance, monthly breakdown tables, aur sab Sardars ka grand summary banner with 7 stats: Total Sardars, Payments, Gross Work, Total Paid, Adv. Given, Adv. Deducted, Outstanding" },
      { type: "fix", text: "🏢 Branding consistency audit — Oil Premium, BP Sale Register, Govt Milling Register etc. mein ab shared `get_pdf_company_header()` use ho raha hai. Sab reports mein company name + address + phone + custom_fields (proprietor name, GST, etc.) ek saath dikhe" },
    ],
  },
  {
    version: "104.28.22",
    date: "Apr 2026",
    title: "v104.28.22 — ⚡ License Auto-Recovery (No Key Re-entry Required)",
    items: [
      { type: "new", text: "⚡ AUTO-RECOVER button — License Settings page mein naya green button. Click karo aur server check karega ki kya aapki machine pehle se activated thi. Agar haan, license **automatically restore** ho jayegi. License key dalne ki bilkul zaroorat nahi" },
      { type: "new", text: "🤖 Startup pe silent recovery — agar app start hote hi cache decrypt fail ho, toh app pehle khud server se 3 fingerprint candidates send karega aur try karega match karne. User ko notice tak nahi hoga" },
      { type: "new", text: "🛡️ Server endpoint `/api/license/recover-by-fingerprint` — accepts fingerprint candidates, returns license key only if a matching active activation exists. Security maintained — kisi random user ko key nahi milegi" },
      { type: "fix", text: "📝 Manual Repair flow improved — Auto-Recover try karne ke baad agar wo fail ho, toh user ko clear option milta hai 'Manual Repair (license key chahiye)' to enter key" },
    ],
  },
  {
    version: "104.28.21",
    date: "Apr 2026",
    title: "v104.28.21 — 🔐 License Cache Auto-Recovery (Fingerprint Drift Fix)",
    items: [
      { type: "fix", text: "🚨 CRITICAL FIX: 'License not activated on this device / Cache not found' — bhale hi cache file 472 bytes mein wahi padi ho. Ye contradiction tab aati thi jab user ka machine fingerprint shift ho jaata tha (USB ethernet plug/unplug, Hyper-V/WSL/Docker install, VPN toggle, Bluetooth, Windows Update CPU model change). Decryption fail hote hi system 'cache not found' bolne lag jaata tha." },
      { type: "new", text: "🛡️ Multi-fingerprint fallback decryption — system ab 3 candidate fingerprints try karta hai (current → minimal → legacy v1). Jab koi bhi succeed ho, cache automatically current fingerprint se re-save ho jaata hai. User ko kuch nahi karna padta — silent recovery" },
      { type: "new", text: "🎯 Stable fingerprint generation — virtual/temporary network adapters ab fingerprint mein nahi count hote: vEthernet, Hyper-V, VirtualBox, VMware, Bluetooth, VPN, Tailscale, Wintun, Docker, WSL — sab filter. CPU model bhi hata diya (Windows Update se badal sakta hai)" },
      { type: "fix", text: "💬 Better error messages — agar genuine decrypt fail ho (different machine), UI ab spasht batata hai 'Cache file present but cannot be decrypted (machine fingerprint shifted)' aur common causes list dikhata hai (USB / Hyper-V / VPN), instead of misleading 'Cache not found'" },
      { type: "fix", text: "🔍 Diagnostic info — `/api/license/status` ab `decrypt_failed`, `load_reason`, `cache_file_size`, `machine_fingerprint` return karta hai. Repair button click karne se pehle hi user ko clear picture milti hai" },
    ],
  },
  {
    version: "104.28.20",
    date: "Apr 2026",
    title: "v104.28.20 — 🎨 Light-Theme Banner deployed to Desktop App + Local Server",
    items: [
      { type: "new", text: "🚀 Pichli release v104.28.19 mein sirf web/Python backend mein banner aaya tha — ab Desktop App (Electron) aur Local Network Server (Express) mein bhi same beautiful light-cream summary banner deploy ho gaya" },
      { type: "new", text: "📊 9 reports cover: Mill Entries (Excel + PDF), Cash Book (Excel + PDF), Vehicle Weight (Excel + PDF), Sale Book (Excel + PDF), Purchase Book (Excel + PDF), Stock Summary (Excel + PDF), Truck Lease (Excel + PDF), Truck Payments (Excel + PDF), Agent Payments (Excel + PDF), Diesel Accounts (Excel + PDF), Hemali Payments (already)" },
      { type: "new", text: "🛠️ Reusable `pdf_helpers.js` mein shared functions — `drawSummaryBanner`, `addExcelSummaryBanner`, `STAT_COLORS` palette, `fmtInr` helper. Future reports mein turant add ho sakta hai" },
      { type: "fix", text: "✅ Triple-backend parity restore — sab teen backends (Python FastAPI, Electron, Local Express) ab identical light-theme banners generate karte hain" },
    ],
  },
  {
    version: "104.28.19",
    date: "Apr 2026",
    title: "v104.28.19 — 🎨 Light-Theme Summary Banner on All Reports",
    items: [
      { type: "new", text: "🎨 Saari major reports ke PDF aur Excel exports ab ek **light cream + gold** themed beautiful summary banner ke saath aate hain — last row mein single-line professional stat strip" },
      { type: "new", text: "📊 9 reports cover hue: Hemali Payments, Mill Entries, Cash Book, Vehicle Weight, Sale Book, Purchase Book, Stock Summary, Truck Lease, Agent Payments, Diesel Accounts" },
      { type: "new", text: "🌈 Har stat apne signature color mein — slate (primary), emerald (paid), red (outstanding), gold (gross), orange (advances), blue (totals), purple (special) — high contrast on light cream background" },
      { type: "new", text: "✨ Pehle dark navy theme tha jo zyada bharkila lagta tha. Ab light cream + gold accent stripe — saaf, professional, print-friendly" },
      { type: "fix", text: "📐 Reusable helper functions (`get_pdf_summary_banner`, `add_excel_summary_banner`, `STAT_COLORS`, `fmt_inr`) banaye gaye `utils/export_helpers.py` mein — future reports mein bhi turant add ho sakta hai" },
      { type: "fix", text: "🔄 Triple-backend parity: Hemali ka light theme banner desktop-app aur local-server (Node.js) mein bhi mirror ho gaya" },
    ],
  },
  {
    version: "104.28.18",
    date: "Apr 2026",
    title: "v104.28.18 — 📊 Hemali Payment Export Redesigned (PDF + Excel)",
    items: [
      { type: "new", text: "📄 PDF export ka summary ab ek beautiful single-line banner mein — 8 stats ek line mein: Total Entries | Paid | Unpaid | Gross Work | Adv Deducted | Payable | Total Paid | Outstanding. Har stat alag color mein (gold/green/red/blue/etc.), gold accent stripe upar" },
      { type: "new", text: "📊 Excel export bilkul professional ban gaya — Company name banner (NAVKAR AGRO), Address subtitle, Gold title bar 'HEMALI PAYMENT REPORT', Filter info row, Generated date row, ladder ke saath bold table headers" },
      { type: "new", text: "✅ Excel mein PAID/UNPAID status ab green/red colored cells (white text + bold). Number columns proper currency formatting (#,##0.00). Frozen pane — scroll karo toh header rows top pe rahti hain" },
      { type: "new", text: "📈 Comprehensive TOTAL row — sab 5 numeric columns (Total/Adv Ded/Payable/Paid/New Adv) ka grand sum. Plus niche ek teal single-line summary banner with all key stats" },
    ],
  },
  {
    version: "104.28.17",
    date: "Apr 2026",
    title: "v104.28.17 — 🔐 Forgot Password (WhatsApp OTP + Recovery Code) + Strength Meter",
    items: [
      { type: "new", text: "🆘 Login screen pe 'Forgot Password?' link — agar admin password bhul jaye toh ab 2 tareeke se reset kar sakte ho: WhatsApp OTP ya Recovery Code" },
      { type: "new", text: "📱 WhatsApp OTP — Settings → Users → Account Recovery se apna recovery WhatsApp number set karo. Forgot password pe 6-digit OTP us number pe aayega via 360Messenger (10 min validity, 5 attempts)" },
      { type: "new", text: "🔑 Recovery Code — admin generate karega ek 16-char code (XXXX-XXXX-XXXX-XXXX). Sirf ek baar dikhega — screenshot/paper pe save karo. Bhulne par code daalo aur naya password set karo (one-time use, fir naya generate karna padega)" },
      { type: "new", text: "📊 Password Strength Meter — change-password aur forgot-password screens pe ab visual strength bar dikhta hai (Weak/Fair/Good/Strong) + rule checklist. Min 6 characters enforced" },
      { type: "fix", text: "🐛 Hashed storage — recovery code aur OTP dono SHA256 hashed save hote hain DB mein. Plain text kahin store nahi hota" },
    ],
  },
  {
    version: "104.28.16",
    date: "Apr 2026",
    title: "v104.28.16 — 🔒 Admin Password Reset Bug FIXED + DataTab White Theme",
    items: [
      { type: "fix", text: "🚨 CRITICAL SECURITY FIX: App restart hone par admin password roz 'admin123' pe reset ho jaata tha. Login route mein DEFAULT_USERS ka backdoor tha jo har baar admin/admin123 accept kar leta tha. Ab woh hata diya — change password ke baad purana admin123 reject ho jata hai (401)" },
      { type: "fix", text: "💾 updateUserPassword ab saveImmediate() use karta hai (debounced save ki bajaye) — naya password turant disk pe flush ho jata hai, app jaldi band hone pe data loss nahi hoga" },
      { type: "new", text: "🎨 Settings → Data → Backup section poori tarah white-theme mein redesigned. Logout / Automatic / Manual — teen alag tables vertically stacked, full-width, proper headers (File Name | Date | Size | Actions). Saaf font, high contrast" },
      { type: "fix", text: "🐛 'Delete All' button ab single click mein kaam karta hai — pehle 2 click maangta tha kyunki custom backup folder skip ho raha tha" },
    ],
  },
  {
    version: "104.28.15",
    date: "Feb 2026",
    title: "v104.28.15 — Backup Section Redesign (3 Categories + Auto-Delete)",
    items: [
      { type: "new", text: "📦 Settings → Data → Backup ab 3 alag-alag sections mein organized: 🔴 Logout backup | 🔵 Automatic backup | 🟢 Manual backup. Har section mein scroll, count, aur 'Delete All' (bulk) button" },
      { type: "new", text: "📅 Sirf last 7 din ki backups dikhayi jaati hain — page chhota aur clean rehta hai. Purani backups disk pe rahti hain (jab tak auto-delete na chal jaye)" },
      { type: "new", text: "🗑️ Auto-Delete toggle + days input — checkbox enable karo, days set karo (default 7). Startup pe automatically purani backups delete ho jayengi. 'Run Cleanup Now' button manual trigger ke liye" },
      { type: "new", text: "🛠️ Bulk-delete API endpoints (POST /api/backups/bulk-delete + cleanup-old) — frontend ke alawa script se bhi cleanup possible" },
    ],
  },
  {
    version: "104.28.14",
    date: "Feb 2026",
    title: "v104.28.14 — Agent Ledger Consolidation (1 row per Mandi)",
    items: [
      { type: "fix", text: "🐛 Pehle har truck/entry pe alag-alag Agent ledger jama ban rahi thi (e.g. Maa Jogamaya - 150Q, fir 150Q, 100Q… 5 alag rows for 5 trucks). Ab ek hi consolidated row banti hai per (Mandi, KMS Year, Season). Jaise jaise nayi entries aati hain, total accumulate hota rehta hai" },
      { type: "new", text: "📊 Description format: 'Agent Entry: Maa Jogamaya - 593.65Q × Rs.10 = Rs.5936.5 (5 entries)' — saaf saaf dikhta hai kitni entries milkar kitna ban gaya" },
      { type: "new", text: "🔄 Auto sync: Mill entry add/update/delete + Mandi target update — har case mein consolidated row turant recompute hoti hai. Mandi/season change kiya to old group bhi update" },
      { type: "fix", text: "🛠️ Startup pe migration — purani per-entry agent_entry: rows clean ho jayengi aur har Mandi ke liye ek consolidated row build ho jayegi" },
    ],
  },
  {
    version: "104.28.13",
    date: "Feb 2026",
    title: "v104.28.13 — Agent Ledger Bugfix + Backfill",
    items: [
      { type: "fix", text: "🐛 Agent ledger entry kuch dikha hi nahi raha tha despite mill entries existing — kyunki calculation tp_weight pe based thi (jo bahut entries mein blank hota hai), lekin dashboard achievement final_w/100 use kar raha tha. Ab dono consistent — Agent ledger achieved QNTL × base_rate use karta hai (e.g. 556.87Q × Rs.10 = Rs.5,569)" },
      { type: "fix", text: "🛠️ Auto Backfill: Startup pe purani mill entries scan ho jaati hain — agar koi entry ka mandi target set hai aur agent ledger missing hai, toh automatically create ho jaati hai. Cash Book > Party Ledgers tab mein 'Agent' type ke entries ab visible" },
    ],
  },
  {
    version: "104.28.12",
    date: "Feb 2026",
    title: "v104.28.12 — 🚨 CRITICAL: Hemali Items Data Loss on Update — ROOT FIX",
    items: [
      { type: "fix", text: "🚨 ROOT CAUSE FIX: Software update ke baad Hemali Items config vanish ho jaa raha tha. Reason — SQLite database mein 'hemali_items' collection registered hi nahi tha (ARRAY_COLLECTIONS list mein missing). Save successful dikhta tha lekin app restart pe load nahi hota tha (silent data loss)" },
      { type: "fix", text: "🛠️ Fix 1 (Recovery): Startup pe automatic recovery — purani JSON backup file se hemali_items aur 15+ baki missing collections (byproduct_categories, opening_stock, telegram_logs, etc.) restore ho jayengi" },
      { type: "fix", text: "🛠️ Fix 2 (Future-proof): Save/Load logic ab dynamic — koi bhi naya collection auto-detect ho jaata hai, hardcoded list pe depend nahi karta. Future updates pe ye bug repeat nahi hoga" },
      { type: "fix", text: "🛡️ Defensive: Save par missing tables auto-create ho jaate hain. Agar koi developer nayi collection introduce kare, bina list update kiye bhi data persist hoga" },
    ],
  },
  {
    version: "104.28.11",
    date: "Feb 2026",
    title: "v104.28.11 — Agent Ledger + Receipt + UX Fixes",
    items: [
      { type: "fix", text: "🐛 Mandi Target create/update karte hi Rs.<full target> ki upfront Ledger Jama entry ban jaati thi (e.g. 5000Q × ₹10 = Rs.50,000) — galat tha. Ab ledger entries TP weight ke saath incrementally accumulate hoti hain — har mill entry pe `tp_weight × base_rate` Jama (e.g. 300Q × ₹10 = Rs.3000). Update/Delete bhi sahi sync. Purani upfront entries startup pe auto cleanup ho jayengi" },
      { type: "fix", text: "🐛 Mandi Target vs Achieved cards mein floating-point junk hata diya — % aur QNTL values 2 decimals tak round, 13.199999 jaisa weird display gaya. 'Agent Payment' wali line bhi remove ho gayi (clutter kam)" },
      { type: "fix", text: "⚙️ Naya target add karte time Cutting Rate ab default 0 — pehle 5 set tha jo galat tha. Edit karte time bhi default 0" },
      { type: "fix", text: "🐛 UNPAID Hemali receipt mein 'AMOUNT PAID' aur 'BALANCE: SETTLED' galat dikh raha tha — bug fix. Ab UNPAID receipt mein Paid = Rs. 0 aur Balance = Net Payable (red colour mein) sahi dikhega" },
      { type: "new", text: "📊 Hemali Monthly Summary PDF/Excel ab fully branded — header mein Settings se company name, tagline aur custom fields, subtitle mein KMS Year/Season/Sardar context. Per-sardar orange band with current advance balance" },
      { type: "new", text: "📄 Hemali Export PDF/Excel ab professional format mein — branded header, subtitle filter context, PAID/UNPAID status colour-coded (green/red), wider columns, UNPAID rows mein '—' dikhayega placeholders ke jagah" },
    ],
  },
  {
    version: "104.28.10",
    date: "Feb 2026",
    title: "v104.28.10 — Hemali UNPAID Receipt Fix + Branded Reports",
    items: [
      { type: "fix", text: "🐛 UNPAID Hemali receipt mein 'AMOUNT PAID' aur 'BALANCE: SETTLED' galat dikh raha tha — bug fix. Ab UNPAID receipt mein Paid = Rs. 0 aur Balance = Net Payable (red colour mein) sahi dikhega" },
      { type: "new", text: "📊 Hemali Monthly Summary PDF/Excel ab fully branded — header mein Settings se company name, tagline aur custom fields, subtitle mein KMS Year/Season/Sardar context. Per-sardar orange band with current advance balance" },
      { type: "new", text: "📄 Hemali Export PDF/Excel ab professional format mein — branded header, subtitle filter context, PAID/UNPAID status colour-coded (green/red), wider columns, UNPAID rows mein '—' dikhayega placeholders ke jagah" },
    ],
  },
  {
    version: "104.28.9",
    date: "Feb 2026",
    title: "v104.28.9 — Keyboard-First UX & Smart Suggestions",
    items: [
      { type: "new", text: "⌨️ Vehicle Weight workflow keyboard-friendly — 1st weight save karte hi focus pending list pe chala jaata hai. Up/Down arrows se vehicle choose karo, Enter dabao → us row ka 2nd weight capture mode active. Mouse click ki zarurat nahi" },
      { type: "new", text: "📝 Mill Entry Form mein RST No. ab sabse pehle hai (auto-focus bhi) — turant RST type karke purani entry ka lookup ho jaaye, phir baaki fields auto-populate" },
      { type: "new", text: "📜 Truck Payment History mein ab Cash aur Diesel advances bhi dikhte hain (date ke saath) — pehle sirf final payment aata tha. Har entry pe colour-coded badge: Cash (blue) / Diesel (amber) / Payment (green)" },
      { type: "new", text: "🔎 Vehicle Weight entry form mein smarter suggestions — Truck / Agent / Mandi mein kahin ka bhi koi word type karo, auto-suggestion turant aayega. Word-start matches top pe, uske baad substring matches" },
      { type: "new", text: "🔗 Agent select karte hi uski related Mandi auto-fill ho jaati hai (agar ek hi related mandi ho). Mandi select karne pe reverse — agent bhi auto-fill (agar unique agent ho)" },
      { type: "new", text: "🔗 T.P Register mein Mandi aur Agent dropdowns linked — Agent select karne par uske related Mandi automatic filter ho jaati hai (ek hi ho to auto-select bhi), aur vice versa" },
    ],
  },
  {
    version: "104.28.8",
    date: "Feb 2026",
    title: "v104.28.8 — Hemali: Professional Receipt + Cash Book Sync + Fixes",
    items: [
      { type: "new", text: "🎨 Hemali Print Receipt ka naya professional design — Title banner, Receipt No. + Status badge (PAID/UNPAID coloured), 2×2 Info Grid (Date / Sardar / Items Count / Qty), items table with dark header, aur 6 colour-coded summary tiles (Gross / Adv. Deducted / Net Payable / Paid / New Advance / Balance)" },
      { type: "new", text: "💰 Hemali payment create karte hi Cash Book > Ledger mein auto 'Jama' entry ban jaati hai (liability dikhti hai turant). Startup pe ek baar ka backfill — purani Hemali payments ke liye bhi missing ledger entries ban jayengi" },
      { type: "fix", text: "🐛 Monthly Summary mein Total Work ab unpaid payments ka bhi count hota hai (work toh ho gaya, payment baad mein). Pehle sirf paid ka dikhta tha = Rs.0 bug" },
      { type: "fix", text: "🐛 Hemali Export PDF aur Excel ab saari payments dikhate hain (paid + unpaid) — pehle sirf paid wale jaate the, isliye blank aata tha. Naya 'Receipt No.' aur 'Status' column bhi add" },
      { type: "fix", text: "↩️ Mark Paid UNDO ab sirf payment entries remove karta hai — 'Work' ledger entry preserve rehti hai (kyunki kaam toh ho gaya tha)" },
    ],
  },
  {
    version: "104.28.7",
    date: "Feb 2026",
    title: "v104.28.7 — T.P Register Fix + Hemali Receipt No.",
    items: [
      { type: "fix", text: "🐛 T.P Register ab entries dikhayega — bug tha ki global date filter (default: aaj ka din) TPR pe blindly apply ho raha tha → historical entries hide ho jaati thi. Ab TPR sirf KMS year + Mandi/Agent scope use karta hai" },
      { type: "new", text: "🧾 Hemali Receipt No. — har payment pe auto sequential number (format: HEM-2026-0001, HEM-2026-0002…). Calendar year per sequence reset hoti hai" },
      { type: "new", text: "📄 PDF receipt ke top pe Receipt No. prominently dikhega (amber colour, bold, centered)" },
      { type: "new", text: "📋 Hemali Payments table mein nayi 'Receipt No.' column add hui — quick identification ke liye" },
      { type: "new", text: "♻️ Purani Hemali payments ke liye one-time backfill — startup pe auto sequential numbers assign ho jayenge chronological order mein" },
      { type: "fix", text: "🖨️ Hemali Print/PDF/Excel 500 error fixed — pichhle release mein `F` font-helper import missing tha jo print receipt + monthly summary PDF crash kar raha tha" },
    ],
  },
  {
    version: "104.28.6",
    date: "Feb 2026",
    title: "v104.28.6 — Diagnostics Panel + CashBook Delete Visible",
    items: [
      { type: "new", text: "🔧 Naya 'Diagnostics' menu item Admin dropdown me — one-click me data folder path, record counts of all collections dikhata hai (Hemali Items, Sardars, Entries sab). Items nahi dikh rahe? Yahan check karo count 0 hai kya" },
      { type: "fix", text: "🎯 CashBook: Actions column (Edit/History/Delete) ab sticky right hai — table scroll karo ya nahi, delete button hamesha dikhega" },
      { type: "fix", text: "🎨 CashBook table layout optimized: narrower Reference column, wider Actions column (90px), min-width 1200px for stability" },
    ],
  },
  {
    version: "104.28.5",
    date: "Feb 2026",
    title: "v104.28.5 — Diagnostic + Silent Error Fix",
    items: [
      { type: "fix", text: "🐛 Hemali Items Config, Sardars list, CashBook categories — ab agar fetch fail ho to console me error log hoga (pehle silent tha, isliye 'data nahi aa raha' ka pata nahi chalta tha)" },
      { type: "new", text: "🔧 Diagnostic endpoint: /api/diagnostics/db-stats — sab collections ka record count + data folder path dikhayega. Browser me kholo: http://localhost:PORT/api/diagnostics/db-stats" },
      { type: "new", text: "🔄 Hemali Items Config ab auto-refresh hoga (item add/delete karne pe list turant update)" },
      { type: "note", text: "Agar items abhi bhi nahi dikhe: Diagnostic endpoint check karo — hemali_items count dikha jayega. Agar 0 hai to data folder galat select hua hai, correct folder select karo Home screen me" },
    ],
  },
  {
    version: "104.28.4",
    date: "Feb 2026",
    title: "v104.28.4 — Hotfix: Data load bug (axios-cache-interceptor removed)",
    items: [
      { type: "fix", text: "🚨 HOTFIX: Data load nahi hua error fixed — axios-cache-interceptor library ne AbortController ke saath conflict kiya tha, removed kar diya hai" },
      { type: "fix", text: "🐛 Headers stripping issue (Pragma interceptor axios v1.x AxiosHeaders ke saath unsafe tha) — hata diya" },
      { type: "note", text: "Auto-refresh + React Query invalidation + server no-store headers abhi bhi active — data freshness guarantee untouched" },
      { type: "note", text: "All 19 screens ka auto-refresh behavior normal rahega" },
    ],
  },
  {
    version: "104.28.3",
    date: "Feb 2026",
    title: "v104.28.3 — Auto-Refresh Every Screen",
    items: [
      { type: "new", text: "🔄 19 hot-path screens ab automatic refresh hote hain — koi bhi entry save/update/delete karne pe saare open tabs turant new data dikhayenge, bina manual refresh ke" },
      { type: "new", text: "💡 Screens migrated: Dashboard, Payments, HemaliPayment, CashBook, PartyLedger, Purchases, Sales, PaddyPurchase, Stock, PL Reports aur 9 aur" },
      { type: "fix", text: "🐛 Cross-tab consistency — dusre browser tab me entry karo, ye tab bhi auto-update ho jayega window focus hote hi" },
      { type: "note", text: "Infrastructure: global 'data-changed' event bus + useAutoRefresh hook, 300ms debounce for safety" },
    ],
  },
  {
    version: "104.28.2",
    date: "Feb 2026",
    title: "v104.28.2 — React Query Foundation + Stronger Freshness",
    items: [
      { type: "new", text: "⚡ React Query infrastructure setup — background refetch on window focus, shared cache, zero stale data" },
      { type: "new", text: "🔄 4-layer cache invalidation on every entry save: axios-cache + react-query + server no-store + pragma header — naya data 100% guaranteed" },
      { type: "new", text: "🛠 Reusable useApiQuery / useApiMutation hooks added for future component migrations" },
      { type: "note", text: "Components abhi purane pattern pe hain (axios-cache + useEffect) — woh bhi fresh data guarantee rakhte hain. Future hot-path migrations will use useApiQuery for extra smoothness" },
    ],
  },
  {
    version: "104.28.1",
    date: "Feb 2026",
    title: "v104.28.1 — Speed Boost + Cache Fix",
    items: [
      { type: "fix", text: "🐛 Fixed: New entries (Hemali payment, Jama/Udhar, etc.) ab turant dikh jaate hain bina browser reload ke — Cloudflare tunnel cache issue resolve" },
      { type: "new", text: "⚡ Tab switching kaafi faster — axios response cache (30s TTL) use kiya, ek baar fetch hua data turant available rahega repeat visit pe" },
      { type: "new", text: "🔄 Auto-invalidation — kisi bhi entry save/update/delete karne pe saara cache turant refresh, stale data kabhi nahi dikhega" },
      { type: "note", text: "Backend: /api/* routes ab Cache-Control: no-store header bhejte hain (desktop + local-server dono)" },
      { type: "note", text: "Frontend: axios-cache-interceptor library + smart invalidation on mutations" },
    ],
  },
  {
    version: "104.28.0",
    date: "Feb 2026",
    title: "v104.28.0 — Offline Activation File (.mlic)",
    items: [
      { type: "new", text: "📄 Naya 'Import Offline File (.mlic)' button activation screen pe — internet ke bina bhi license activate kar sakte ho" },
      { type: "new", text: "🔐 Ed25519 signature verification — .mlic file tamper-proof hai, koi modify kare to app reject kar degi" },
      { type: "new", text: "📲 Admin dashboard se .mlic file directly WhatsApp pe customer ko bhej sakte ho (360Messenger attachment)" },
      { type: "new", text: "🏷️ Bind-on-first-use — .mlic jis PC pe import hogi, wohi bind ho jayegi (automatic machine lock)" },
      { type: "note", text: "Admin dashboard pe License row ke saamne naya orange '.mlic' button — Generate & Download ya Send via WhatsApp" },
    ],
  },
  {
    version: "104.27.0",
    date: "Feb 2026",
    title: "v104.27.0 - Split Billing (Pakka + Kaccha)",
    items: [
      { type: "new", text: "🧾 By-Product Sale Register mein naya 'Split Billing' toggle — ek dispatch mein kuch maal GST bill pe (Pakka) aur kuch slip pe (Kaccha) handle karo single entry se" },
      { type: "new", text: "💰 Tax automatic calculation — GST sirf Pakka portion pe lagegi, Kaccha pe nahi. Total receivable = Pakka + Tax + Kaccha" },
      { type: "new", text: "📦 Stock, GST return, Cashbook, Party ledger sab balance automatic match — ek hi physical dispatch count hota hai" },
      { type: "new", text: "🏷️ Sale Register row pe 'SPLIT' badge dikhega when enabled" },
      { type: "note", text: "Regular (non-split) entries ka behavior 100% same — kuch bhi nahi badla existing dispatches ke liye" },
    ],
  },
  {
    version: "104.26.4",
    date: "Feb 2026",
    title: "v104.26.4 - Rebuild (includes all v104.26.x fixes)",
    items: [
      { type: "new", text: "🌐 Cloud Access section in Settings → License tab (one-click cloudflared tunnel setup)" },
      { type: "new", text: "⚡ Activation screen 9X- prefix + auto-dash insertion" },
      { type: "new", text: "📋 Paste smart-format (any format → 9X-XXXX-XXXX-XXXX-XXXX)" },
      { type: "fix", text: "🎨 Settings tabs overflow fix (13 tabs wrap cleanly)" },
      { type: "fix", text: "🎨 License tab light-theme compatibility" },
      { type: "fix", text: "🔥 electron-builder files[] mein license-manager.js + cloudflared-manager.js + activation-ui/** included" },
      { type: "fix", text: "🔢 APP_VERSION constant ab package.json se sync" },
    ],
  },
  {
    version: "104.26.3",
    date: "Feb 2026",
    title: "v104.26.3 - Cloud Access + Light Theme Polish",
    items: [
      { type: "new", text: "🌐 Settings → License tab mein 'Cloud Access' section add — ek click mein tunnel auto-setup (cloudflared download + Windows service install + Cloudflare tunnel connect). URL format: your-mill.9x.design" },
      { type: "new", text: "⚡ Activation screen pe 9X- prefix auto-fill + auto-dash insertion — customer ko sirf 16 characters type karne padte hain (pehle full 20 including hyphens)" },
      { type: "new", text: "📋 License key paste smart-format — paste karo kisi bhi format mein, auto 9X-XXXX-XXXX-XXXX-XXXX ban jaayega" },
      { type: "new", text: "🛡️ Pre-existing cloudflared detection — agar manually setup tha toh UI 'Pre-Configured' dikhata hai, accidentally overwrite nahi karta" },
      { type: "fix", text: "🎨 Settings tabs overflow fix — 13 tabs ab wrap hote hain 2 lines mein, squish aur distortion khatam" },
      { type: "fix", text: "🎨 License tab light-theme compatibility — cards ab white theme mein proper contrast aur shadow ke saath dikhte hain" },
      { type: "fix", text: "🔥 electron-builder files[] mein license-manager.js, cloudflared-manager.js, activation-ui/** add — pichli v104.26.0/26.1 mein 'Cannot find module' crash fix" },
      { type: "note", text: "Admin Dashboard (admin.9x.design) mein naya Cloudflare Tunnels section — API token paste karke auto-discover + enable" },
    ],
  },
  {
    version: "104.25.0",
    date: "Feb 2026",
    title: "v104.25.0 - License Activation System (Desktop-app Enforcement)",
    items: [
      { type: "new", text: "🔐 Desktop-app ab admin.9x.design ke central license server se validate hoti hai — key format 9X-XXXX-XXXX-XXXX-XXXX" },
      { type: "new", text: "✨ Activation screen pe live key preview — key type karte hi 'Licensed To: Shri Ram Agro · Lifetime' dikh jaata hai, customer confidence badhata hai" },
      { type: "new", text: "🎨 Premium light-theme Activation Window jab license nahi ho ya expired ho — same aesthetic jaise admin dashboard" },
      { type: "new", text: "🖥️ Machine fingerprint (MAC+hostname+CPU hash) based loose binding — ek license ek active PC, naye PC pe activate karne se purane ko auto-kick off" },
      { type: "new", text: "📅 30-day offline grace — agar internet band ho customer ke paas, license 30 din tak kaam karegi locally" },
      { type: "new", text: "❤️ Background heartbeat har 24h — revoke / expire detect hote hi app lock + message dikhata hai" },
      { type: "new", text: "🛡️ AES-256-GCM encrypted local cache (machine-bound) — license file tamper-proof" },
      { type: "note", text: "Tumhare existing install ke liye MASTER license ready: 9X-NVKR-OWNR-MSTR-2099 (permanent, never expires)" },
      { type: "note", text: "Central admin server: admin.9x.design (Cloudflare Tunnel → VPS)" },
    ],
  },
  {
    version: "104.24.0",
    date: "Feb 2026",
    title: "v104.24.0 - Weighbridge OFFLINE Message (No More Demo Confusion)",
    items: [
      { type: "fix", text: "🚫 Simulator (fake demo data 12,924 / 14,329 kg) ab by default DISABLED hai — pehle jab weighbridge off hoti thi toh demo dikhta tha aur user confuse hota tha" },
      { type: "new", text: "🔴 Ab weighbridge OFF hone par clear message dikhega: 'Weighbridge OFF — Machine ON karein aur COM3 connect karein' (red panel + NO SIGNAL badge)" },
      { type: "new", text: "🟢 Header badge: 'Weighbridge OFF' (red) ya 'COM Connected / LAN Live' (green) — instant status clarity" },
      { type: "new", text: "🧪 Demo mode sirf `?demo=1` URL query add karne pe chalega (testing/training ke liye) — accident se kabhi enable nahi hoga" },
      { type: "note", text: "Capture buttons pehle se hi stable weight > 0 check karte hain, so offline me koi fake entry save nahi ho sakti" },
    ],
  },
  {
    version: "104.23.0",
    date: "Feb 2026",
    title: "v104.23.0 - Real-time Weighbridge via WebSocket",
    items: [
      { type: "new", text: "⚡ Weighbridge live weight ab WebSocket push se instant update hota hai — 500ms polling khatam, zero network overhead" },
      { type: "new", text: "🔌 Backend: Desktop-app me naya WS endpoint `/ws/weighbridge` — serial port se jab bhi weight aata hai, saare connected browsers ko turant broadcast hota hai" },
      { type: "new", text: "📡 3 seconds me periodic status beacon — agar serial port disconnect ho jaye to browser turant detect kar leta hai" },
      { type: "new", text: "🔄 Auto-reconnect: tunnel/network hiccup pe 3s me dobara connect ho jata hai" },
      { type: "new", text: "🛡️ HTTP polling fallback rakha hai — agar WS connection fail ho (old backend/proxy), app polling mode me chala jayega automatically" },
      { type: "note", text: "🧑‍🤝‍🧑 Multiple browsers (mill.9x.design pe office + weighbridge PC + owner mobile) simultaneously real-time sync — sab same weight dekhege instantly" },
      { type: "note", text: "Cloudflare Tunnel WebSocket natively support karta hai — extra config nahi chahiye" },
    ],
  },
  {
    version: "104.22.0",
    date: "Feb 2026",
    title: "v104.22.0 - Weighbridge Live Weight Fix (Cloudflare Tunnel)",
    items: [
      { type: "fix", text: "🏋️ Weighbridge LIVE weight ab mill.9x.design (Cloudflare Tunnel) pe sahi dikhega — pehle simulator fake weight (12,924 / 14,329) aa raha tha" },
      { type: "fix", text: "Root cause: 'Weighbridge Host' setting me LAN IP (http://192.168.x.x) set tha — HTTPS page se HTTP URL browser ne mixed-content block kiya → simulator fallback kick in" },
      { type: "fix", text: "Fix: weighbridge_host blank kar diya (backend API call) + VehicleWeight.jsx me mixed-content guard add kiya (HTTPS page hone par HTTP wbHost skip → same-origin use)" },
      { type: "new", text: "⚠️ Settings > Weighbridge tab me amber warning banner add kiya — Cloudflare tunnel users ke liye 'field BLANK chhodein' ka clear note" },
      { type: "note", text: "👉 Truck ab jab weighbridge pe chadhega, mill.9x.design pe bhi real live weight dikhega (desktop-app ke saath sync)" },
    ],
  },
  {
    version: "104.21.0",
    date: "Feb 2026",
    title: "v104.21.0 - Global KMS Setting + VR Save-to-Group + History",
    items: [
      { type: "new", text: "🌾 Global KMS Setting: Ab header mein 'KMS' dropdown hai (pehle 'FY' likha tha). Selected KMS year reload/next-login ke baad bhi persist rehta hai." },
      { type: "new", text: "🎯 Dashboard pe big amber banner: 'ACTIVE KMS · 2025-2026 · Kharif' — ek najar mein pata chalta hai kaunse KMS me kaam ho raha hai" },
      { type: "new", text: "📢 KMS switch karte hi rich toast dikhegi — entries count + paddy Qtl + rice Qtl (5s)" },
      { type: "new", text: "💚 Verification Report → 'Save & Send to Group' button (ek click = meter save + silent 360Messenger group send + history entry)" },
      { type: "new", text: "📜 Verification Report me naya 'History' sub-tab — past saved reports table with Load/Re-send/Delete actions" },
      { type: "new", text: "📱 Verification Report WhatsApp PDF: 360Messenger se directly PDF attach hoke group/number pe silent send (no more wa.me link)" },
      { type: "fix", text: "Auto-reset bug fixed in useFilters.js — KMS selection ab force-reset nahi hoti CURRENT_FY pe" },
      { type: "fix", text: "FY label 13 components mein 'KMS' kar diya (Dashboard, CashBook, Ledgers, Payments, DailyReport, FilterPanel, MillEntryForm, EntryTable, StockTab, ExcelImport, MillingTracker, GSTLedger, FYSummary)" },
      { type: "fix", text: "Verification Report header se Print button + bulky WA number/group inputs remove kar diye" },
      { type: "note", text: "Triple parity maintained: Python + Desktop JS + Local Server JS, all synced via /app/scripts/sync-js-routes.sh" },
    ],
  },
  {
    version: "104.20.0",
    date: "Feb 2026",
    title: "v104.20.0 - WhatsApp Share + Auto-Open Downloads (Global)",
    items: [
      { type: "new", text: "📱 WhatsApp button Verification Report pe — ek click mein default number/group par report share" },
      { type: "new", text: "Settings mein save hote hain: Default WhatsApp number (country code ke saath) + Group invite link" },
      { type: "new", text: "Message auto-generate: Miller info, Meter readings, Paddy/Rice totals, Book balances sab include" },
      { type: "fix", text: "🚀 GLOBAL: Ab sabhi downloads (Excel, PDF) auto-open ho jate hain — browser mein new tab mein, desktop app mein default application (Excel/Adobe Reader) se" },
      { type: "fix", text: "Desktop: Save dialog skip — direct Downloads folder mein save + auto-open (unique filename if exists)" },
      { type: "fix", text: "Excel aur PDF dono mein permanent 2-row header with OSCSC(OWN)=[RRC,FCI] + OSCSC(Koraput)=[RRC FRK,FCI FRK]" },
    ],
  },
  {
    version: "104.19.6",
    date: "Feb 2026",
    title: "v104.19.6 - VR Landscape PDF + Watermark Off + Permanent 2-row Header",
    items: [
      { type: "fix", text: "Verification Report PDF se NAVKAR AGRO watermark hata diya (clean FCI output)" },
      { type: "fix", text: "PDF ab A4 LANDSCAPE orientation mein — 11 columns properly fit" },
      { type: "fix", text: "UI + PDF + Excel sab mein permanent 2-row header: OSCSC(OWN)=[RRC,FCI], OSCSC(Koraput)=[RRC FRK,FCI FRK] — hierarchy ab clearly visible" },
      { type: "fix", text: "Sl No + NAFED/TDCC/Levy/TOTAL columns rowSpan=2 (single merged cells spanning both header rows)" },
      { type: "fix", text: "Excel rebuild: merged cells work properly with 2-row header structure" },
      { type: "note", text: "Global SimpleDocTemplate watermark patch ab document-level skip support karta hai (doc._skip_watermark=True)" },
    ],
  },
  {
    version: "104.19.5",
    date: "Feb 2026",
    title: "v104.19.5 - VR Excel Export + Tab-specific Buttons",
    items: [
      { type: "new", text: "Verification Report ke liye naya dedicated Excel export (exact nested OSCSC format with merged headers)" },
      { type: "new", text: "Annexure-1 PDF ab proper nested layout mein: OSCSC(OWN)=[RRC,FCI] + OSCSC(Koraput)=[RRC FRK,FCI FRK] as colspan=2 merged cols" },
      { type: "fix", text: "Top-right Excel/PDF buttons ab sirf 'Register' tab pe dikhte hain (Verification Report tab pe hide)" },
      { type: "fix", text: "Verification Report ke apne Excel + PDF + Print buttons VR tab ke andar hain" },
      { type: "note", text: "VR PDF mein koi watermark nahi (clean output officer ke liye)" },
    ],
  },
  {
    version: "104.19.4",
    date: "Feb 2026",
    title: "v104.19.4 - OSCSC(OWN)=[RRC,FCI], OSCSC(Koraput)=[RRC FRK,FCI FRK]",
    items: [
      { type: "fix", text: "Verification Report ab bilkul Excel jaisa: OSCSC(OWN) ke 2 sub-cols RRC & FCI, OSCSC(Koraput) ke 2 sub-cols RRC FRK & FCI FRK" },
      { type: "fix", text: "Paddy rows (I-VIII) mein OSCSC(OWN) aur OSCSC(Koraput) dono colSpan=2 merged dikhte hain" },
      { type: "fix", text: "Rice rows (IX-XII) mein 4 separate sub-cells mein RRC/FCI/RRC FRK/FCI FRK values" },
    ],
  },
  {
    version: "104.19.3",
    date: "Feb 2026",
    title: "v104.19.3 - RRC/FCI/RRC FRK/FCI FRK Nested Under OSCSC(OWN)",
    items: [
      { type: "fix", text: "Verification Report ab exact Excel format match karta hai: RRC, FCI, RRC FRK, FCI FRK ye OSCSC(OWN) ke 4 sub-columns hain (pehle independent cols the)" },
      { type: "fix", text: "OSCSC(OWN) header ab colSpan=4 karke wide banata hai; rows I-VIII mein value merged single cell mein dikhti hai" },
      { type: "fix", text: "Rows IX-XII mein 4 alag sub-cells RRC/FCI/RRC FRK/FCI FRK ke saath distribute hota hai" },
      { type: "fix", text: "OSCSC(Koraput), NAFED, TDCC, Levy A/c: paddy section mein data show karte hain, rice section mein blank (as Excel)" },
    ],
  },
  {
    version: "104.19.2",
    date: "Feb 2026",
    title: "v104.19.2 - Annexure-1 Column Alignment Fix",
    items: [
      { type: "fix", text: "Verification Report table ab proper column widths ke saath dikhta hai (Sl No narrow, Particulars wide)" },
      { type: "fix", text: "Vertical 'Paddy' aur 'Rice' row-group labels correctly rowspan handle karte hain ab" },
      { type: "fix", text: "TxtCell component ab rowSpan/colSpan props correctly underlying <td> ko forward karta hai" },
    ],
  },
  {
    version: "104.19.1",
    date: "Feb 2026",
    title: "v104.19.1 - Annexure-1 Layout Fix (Single Unified Table)",
    items: [
      { type: "fix", text: "Verification Report ab exact Excel ki tarah EK HI unified table hai (Paddy + Rice sab ek table mein)" },
      { type: "fix", text: "Bayein taraf 'Paddy' aur 'Rice' vertical row-group labels (I-VI = Paddy, VII-XIV = Rice)" },
      { type: "fix", text: "Sub-header row 'RRC | FCI | RRC FRK | FCI FRK' ab VIII aur IX ke beech mein correctly dikhta hai" },
      { type: "fix", text: "XIII & XIV rows ab match karte hain Excel ke layout ko (value first col mein + TOTAL)" },
      { type: "fix", text: "PDF export bhi same unified layout mein generate hota hai" },
    ],
  },
  {
    version: "104.19.0",
    date: "Feb 2026",
    title: "v104.19.0 - Annexure-1 Verification Report (FCI Official Format)",
    items: [
      { type: "new", text: "Verification Report ab exact FCI Annexure-1 format mein dikhta hai (Miller Name/Code/Address/Capacity header, Electricity KW/KV, Meter Readings 4b/4c/4d)" },
      { type: "new", text: "14 rows (I-XIV): Paddy Procured/Milled/Book Balance x 5 agencies, Rice Received, Rice Delivered x 4 rice types" },
      { type: "new", text: "Agency-wise breakdown: OSCSC(OWN) / OSCSC(Koraput) / NAFED / TDCC / Levy A/c" },
      { type: "new", text: "Rice delivery breakdown: RRC / FCI / RRC FRK / FCI FRK" },
      { type: "new", text: "Paddy Release form mein naya 'Agency' dropdown (OSCSC OWN default)" },
      { type: "new", text: "Settings persisted: Electricity Contract (KW/KV), Milling Capacity (MT), Variety" },
      { type: "new", text: "PDF Export (Annexure-1 button): A4 format, FCI standard, seedha print karke officer ko sign karwayen" },
      { type: "new", text: "Teeno backends (Python + Desktop JS + Local Server) mein parity" },
    ],
  },
  {
    version: "104.18.1",
    date: "Feb 2026",
    title: "v104.18.1 - Fix: Milling Register FCI vs RRC Column",
    items: [
      { type: "fix", text: "Milling Register: DC delivery ab sahi column (FCI ya RRC) mein dikhti hai" },
      { type: "fix", text: "Classification ab dc_entries.delivery_to se hoti hai (pehle sirf godown_name string check hota tha)" },
    ],
  },
  {
    version: "104.18.0",
    date: "Feb 2026",
    title: "v104.18.0 - Milling Register: FCI Verification Report (Weekly)",
    items: [
      { type: "new", text: "Milling Register ke andar naya sub-tab: Verification Report (FCI Weekly format)" },
      { type: "new", text: "Auto-compute: 4b Last Metre → 4c Present Metre → 4d Units Consumed (6 units/Qtl default)" },
      { type: "new", text: "Weekly + Progressive totals: Paddy Released, Milled, Rice Produced, Delivered" },
      { type: "new", text: "Expected Rice cross-check @ 67% recovery (FCI standard)" },
      { type: "new", text: "Book Balance of Paddy & Rice (auto from progressive totals)" },
      { type: "new", text: "Persistent Meter Settings: 'Save as Default' → next week ka Last Reading + Last Date auto-roll" },
      { type: "new", text: "Teeno backends mein parity: /api/govt-registers/verification-report + /api/settings/verification-meter" },
    ],
  },
  {
    version: "104.0.0",
    date: "Apr 2026",
    title: "v104.0.0 - DC Stacks + Lot Management",
    items: [
      { type: "new", text: "Govt Rice / DC > Stacks sub-tab: Stack cards with Depot, TEC, Booking ID, Lot progress" },
      { type: "new", text: "Lot Management: Add/Delete lots per stack with Date, Agency, ACK No, Trucks, Bags, Weight" },
      { type: "new", text: "Lot number buttons: Green=delivered, Yellow=pending (click to toggle)" },
    ],
  },
  {
    version: "103.0.0",
    date: "Apr 2026",
    title: "v103.0.0 - DC Register: Depot + FCI/RRC Fields",
    items: [
      { type: "new", text: "Govt Rice / DC: Depot Name, Depot Code, No. of Lots, FCI/RRC selection add kiya" },
      { type: "new", text: "DC Table mein To (FCI/RRC), Depot, Lots columns" },
      { type: "fix", text: "Govt Links: Data ab properly persist hota hai app update ke baad" },
    ],
  },
  {
    version: "102.3.0",
    date: "Apr 2026",
    title: "v102.3.0 - Govt Links Auto-Fill Login",
    items: [
      { type: "new", text: "Desktop: Govt Link click pe naya window khulta hai — Username + Password auto-fill hota hai!" },
      { type: "new", text: "Common selectors try karta hai (username, userid, password fields) + retry for dynamic pages" },
    ],
  },
  {
    version: "102.0.0",
    date: "Apr 2026",
    title: "v102.0.0 - Govt Useful Links",
    items: [
      { type: "new", text: "Header mein 'Govt Links' dropdown — ek click mein govt portal khulega" },
      { type: "new", text: "Settings > Govt Links — URL + Username + Password save karein" },
      { type: "new", text: "Click pe website khule + username clipboard mein copy" },
      { type: "fix", text: "MSP Payments dcList error fix + Milling Register PDF fix" },
    ],
  },
  {
    version: "101.17.0",
    date: "Apr 2026",
    title: "v101.17.0 - MSP Payments Back to Payments Tab",
    items: [
      { type: "fix", text: "MSP Payments wapas Payments tab mein — Sales Register mein sirf Govt Rice / DC" },
    ],
  },
  {
    version: "101.16.0",
    date: "Apr 2026",
    title: "v101.16.0 - DC Tracker Moved to Sales Register",
    items: [
      { type: "new", text: "Register > Sales Register > Govt Rice / DC — DC Tracker yahan shift hua" },
      { type: "fix", text: "Payments se DC (Payments) tab hataya" },
      { type: "fix", text: "Milling Register PDF NaN fix" },
    ],
  },
  {
    version: "101.15.0",
    date: "Apr 2026",
    title: "v101.15.0 - Milling Register PDF Fix",
    items: [
      { type: "fix", text: "Milling Register PDF: NaN error fix — addPdfHeader galat params se call ho raha tha" },
    ],
  },
  {
    version: "101.14.0",
    date: "Apr 2026",
    title: "v101.14.0 - Smart Search: Frontend Date Skip Fix",
    items: [
      { type: "fix", text: "Mill Entries + Vehicle Weight + Auto Weight: Search karne pe date filter skip — frontend se hi date params nahi jaate" },
    ],
  },
  {
    version: "101.13.0",
    date: "Apr 2026",
    title: "v101.13.0 - Smart Search: Date Filter Auto-Skip",
    items: [
      { type: "new", text: "Search (RST/TP/Truck/Agent/Mandi) karne pe date filter automatically skip — kahi bhi search karo, result milega" },
    ],
  },
  {
    version: "101.12.0",
    date: "Apr 2026",
    title: "v101.12.0 - Transit Pass Auto-Migration Fix",
    items: [
      { type: "fix", text: "Startup migration: Purani entries ka tp_no automatically string normalize — T.P. Register ab turant load" },
    ],
  },
  {
    version: "101.11.0",
    date: "Apr 2026",
    title: "v101.11.0 - Transit Pass TP Filter Fix",
    items: [
      { type: "fix", text: "Transit Pass: tp_no filter improved — number/string dono handle, '0' exclude, debug removed" },
    ],
  },
  {
    version: "101.7.0",
    date: "Apr 2026",
    title: "v101.7.0 - Transit Pass Debug + Improved TP Filter",
    items: [
      { type: "fix", text: "Transit Pass: TP number filter improved — tp_no=0 ko bhi filter out karta hai ab" },
      { type: "fix", text: "Transit Pass: Debug logging added — console mein entry count dikhega for troubleshooting" },
    ],
  },
  {
    version: "101.6.0",
    date: "Apr 2026",
    title: "v101.6.0 - Transit Pass: Only Paddy Purchase Data",
    items: [
      { type: "fix", text: "Transit Pass Register: Sirf Paddy Purchase (Mill Entries) se data — Vehicle Weight hataya" },
    ],
  },
  {
    version: "101.5.0",
    date: "Apr 2026",
    title: "v101.5.0 - Transit Pass Register: Vehicle Weight Data",
    items: [
      { type: "new", text: "Transit Pass Register: Vehicle Weight entries bhi include (jahan TP No. dala hai)" },
      { type: "fix", text: "Desktop: tp-weight-stock + milling-register endpoints fix" },
    ],
  },
  {
    version: "101.4.0",
    date: "Apr 2026",
    title: "v101.4.0 - Milling Register + TP Weight Stock Fix",
    items: [
      { type: "fix", text: "Desktop: /api/govt-registers/tp-weight-stock endpoint add kiya (404 fix)" },
      { type: "fix", text: "Desktop: Milling Register GET + Excel + PDF endpoints add kiye" },
    ],
  },
  {
    version: "101.3.0",
    date: "Apr 2026",
    title: "v101.3.0 - Milling Register Desktop Fix",
    items: [
      { type: "fix", text: "Milling Register: Desktop app mein missing tha — GET + Excel + PDF endpoints add kiye" },
      { type: "fix", text: "Weight Report PDF: Photos center-aligned" },
      { type: "fix", text: "Vehicle Weight Register PDF: Title center-aligned" },
    ],
  },
  {
    version: "101.2.0",
    date: "Apr 2026",
    title: "v101.2.0 - PDF Title Centered",
    items: [
      { type: "fix", text: "Vehicle Weight Register PDF: Title ab center-aligned hai" },
    ],
  },
  {
    version: "101.1.0",
    date: "Apr 2026",
    title: "v101.1.0 - Weight Report PDF Photos Centered",
    items: [
      { type: "fix", text: "Desktop PDF: Photos ab center-aligned hain (1 ya 2 dono case mein)" },
    ],
  },
  {
    version: "100.0.0",
    date: "Apr 2026",
    title: "v101.0.0 - Total Row Fix (White Theme)",
    items: [
      { type: "fix", text: "Total row: White/light theme, Bags + Net Wt + Cash + Diesel totals (1st/2nd Wt hataya)" },
      { type: "fix", text: "Avg/Bag column table se hataya — sirf print slip + view dialog mein" },
    ],
  },
  {
    version: "99.0.0",
    date: "Apr 2026",
    title: "v99.0.0 - Print Slip: Remark + Avg/Bag Fix",
    items: [
      { type: "fix", text: "Print Slip: Remark ab dono copies (Party + Customer) mein dikhta hai" },
      { type: "fix", text: "Print Slip: Avg/Bag (प्रति बोरा) info table row mein add kiya — dono copies" },
    ],
  },
  {
    version: "98.0.0",
    date: "Apr 2026",
    title: "v98.0.0 - Desktop PDF Branding + Watermark + Print Parity",
    items: [
      { type: "fix", text: "Desktop PDF: Header ab Settings Branding se aata hai (Mill Entry System nahi)" },
      { type: "fix", text: "Desktop PDF: Watermark ab vector glyph paths se — text select artifact fix" },
      { type: "fix", text: "Auto Weight Entries Print: Ab Auto Vehicle Weight jaisa — G.Issued, TP No., TP Weight sab same" },
    ],
  },
  {
    version: "97.0.0",
    date: "Apr 2026",
    title: "v97.0.0 - Desktop Watermark Fix + Weight Bar Layout",
    items: [
      { type: "fix", text: "Desktop PDF watermark ab vector path se render hota hai — text select/\\ artifact fix" },
      { type: "fix", text: "Weight Summary Bar: KG values ab ek line mein — whitespace-nowrap applied" },
    ],
  },
  {
    version: "96.0.0",
    date: "Apr 2026",
    title: "v96.0.0 - Auto Weight Entries Parity + PDF Download Fix",
    items: [
      { type: "fix", text: "Weight Report PDF download ab Desktop App mein kaam karta hai (weight-report-pdf endpoint add)" },
      { type: "fix", text: "Auto Weight Entries: Avg/Bag + Remark columns table mein add kiye" },
      { type: "fix", text: "Auto Weight Entries: View Dialog mein Gross/Tare/Avg sahi dikhta hai" },
      { type: "fix", text: "Auto Weight Entries: Edit Dialog mein Remark field add kiya" },
    ],
  },
  {
    version: "95.0.0",
    date: "Apr 2026",
    title: "v95.0.0 - Vehicle Weight View Dialog Fix + LAN Weighbridge",
    items: [
      { type: "fix", text: "View Dialog: Gross Weight, Tare Weight, Remark, Avg/Bag ab properly dikhta hai" },
      { type: "fix", text: "Photos API: gross_wt aur tare_wt fields add kiye (all 3 backends)" },
      { type: "new", text: "LAN Weighbridge: Local-server ab desktop-app se weight data proxy karta hai" },
      { type: "new", text: "Settings > Weighbridge: Desktop App URL config for LAN browsers" },
    ],
  },
  {
    version: "93.0.0",
    date: "Apr 2026",
    title: "v94.0.0 - Professional Weight Report PDF + Branding System",
    items: [
      { type: "new", text: "Weight Report PDF: Professional single-page design with branding header + custom fields from Settings" },
      { type: "new", text: "PDF: Hindi labels (गाड़ी, पार्टी, माल, बोरे), conditional fields (only show if data exists)" },
      { type: "new", text: "PDF: 6 summary boxes - GROSS/कुल, TARE/खाली, NET/शुद्ध, AVG/BAG/प्रति बोरा, CASH/नकद, DIESEL/डीजल" },
      { type: "new", text: "Desktop PDF: Uses addPdfHeader with branding + custom fields from Settings" },
      { type: "new", text: "WhatsApp: PDF via tmpfiles.org upload + bold text caption" },
      { type: "fix", text: "AVG/BAG = Net Weight / Bags (per bag average)" },
      { type: "fix", text: "Time: IST timezone" },
      { type: "fix", text: "Cash/Diesel boxes only show when value > 0" },
    ],
  },
  {
    version: "92.0.0",
    date: "Apr 2026",
    title: "v92.0.0 - Tab Reorganization + Gunny Bag Upgrade + Watermark Fix",
    items: [
      { type: "new", text: "Stock Register - Naya top-level tab: Gunny Bags Register + Stock Summary" },
      { type: "new", text: "Gunny Bags: Bran P.Pkt, Broken P.Pkt bag types added with summary cards" },
      { type: "new", text: "Gunny Bags OUT form: Used For (all stock items), Damaged, Return fields" },
      { type: "new", text: "Gunny Bags: Realtime stock preview in form - quantity type karte hi stock +/- dikhta hai" },
      { type: "new", text: "Register tab: Purchase Register ke sub-tabs (Purchase Vouchers, Pvt Paddy Purchase, Paddy Purchase Register)" },
      { type: "new", text: "Register tab: Paddy Custody Maintenance, T.P Register, Milling Register move kiya" },
      { type: "new", text: "Payments tab: DC (Payments) sub-tab added" },
      { type: "fix", text: "Paddy Custody Register: Released column ab paddy_release se aata hai (milling se nahi)" },
      { type: "fix", text: "Milling Register: Season column hata diya, blank cells mein '-' dikhta hai" },
      { type: "fix", text: "Watermark: PDF click pe backslash nahi aayega (image-based rendering)" },
      { type: "fix", text: "Govt Registers tab removed (sab Register mein move ho gaya)" },
      { type: "fix", text: "Gunny Bags: Reference hata diya, Notes -> Remark rename, table mein new columns" },
      { type: "fix", text: "White theme cards compact design for Gunny Bags summary" },
    ],
  },
  {
    version: "91.0.0",
    date: "Apr 2026",
    title: "v91.0.0 - Oil Premium + Milling Register + Ledger Integration",
    items: [
      { type: "new", text: "Oil Premium Register - Rice Bran ke andar sub-tab, auto-calculate premium (Rate x Diff% x Qty / Standard%)" },
      { type: "new", text: "Oil Premium PDF/Excel export with party-wise summary, date-range filter, bran type filter" },
      { type: "new", text: "Oil%, Diff%, Premium columns Sale Register table + PDF/Excel mein (Rice Bran linked)" },
      { type: "new", text: "Milling Register - Govt Register mein Excel jaisa format, auto-computed from Paddy Release + Milling + DC Delivery" },
      { type: "new", text: "Paddy Release in Milling Register - TP Weight stock se linked, release karne pe stock katega" },
      { type: "new", text: "Milling Entry mein Paddy Source dropdown - Released Paddy ya Overall Stock se milling" },
      { type: "new", text: "Milling Register PDF/Excel export - professional govt format with company header + custom fields" },
      { type: "new", text: "Voucher No field - sabhi By-Product sale entries mein added" },
      { type: "new", text: "Sale Voucher Payment - BP Sale Register entries bhi dropdown mein (payment receive)" },
      { type: "new", text: "BP Sale Register - full cashbook/ledger linked (Party Ledger, Cash, Diesel, Truck, Local Party)" },
      { type: "fix", text: "Ledger direction fix: Sale = Nikasi (maal beche), Diesel = Jama (kharida), correct accounting" },
      { type: "fix", text: "Opening Stock (28000 Qtl paddy) ab har jagah reflect hota hai - Paddy Stock, Milling Register" },
      { type: "fix", text: "Overall stock se released paddy minus hota hai" },
      { type: "fix", text: "Reports mein BP Sale detail - Daily Report, CMR vs DC, Season P&L sab linked" },
      { type: "fix", text: "Party Type dropdown mein custom types persist (manual types wapas dikhte hain)" },
      { type: "fix", text: "Govt Rice hataya Sale Register se (already DC Payments mein), Pvt Rice default" },
      { type: "fix", text: "PDF/Excel single A4 landscape fit, dynamic columns, V.No instead of S.No, Destination full name" },
    ]
  },
  {
    version: "90.9.0",
    date: "Apr 2026",
    title: "v90.9.0 - Sales Register + Vehicle Weight + UI Improvements",
    items: [
      { type: "new", text: "Sales Register mein 9 sub-tabs: Govt Rice, Private Rice, Rice Bran, Mota Kunda, Broken Rice, Rejection Rice, Pin Broken Rice, Poll, Bhusa" },
      { type: "new", text: "By-Product Sale Register - dedicated form with Bill No, RST auto-fetch, N/W(Kg), Rate/Qtl, GST, Cash/Diesel/Advance/Balance" },
      { type: "new", text: "Real-time stock display in sale form - available stock minus hota hai jaise weight dalte ho" },
      { type: "new", text: "View button (eye icon) for sale detail with Cash/Diesel/Advance breakdown" },
      { type: "new", text: "Filters: Date, Billing Date, RST, Vehicle, Bill From, Party, Destination - PDF/Excel bhi filtered" },
      { type: "new", text: "PDF/Excel export mein sirf filled columns dikhte hain (0 wale hidden)" },
      { type: "new", text: "Keyboard Left/Right arrow se menu tabs switch, ESC se filters close" },
      { type: "new", text: "Menu scroll arrows (< >) mouse ke liye" },
      { type: "fix", text: "Vouchers renamed to Register, Sale Vouchers to Sales Register, Purchase Vouchers to Purchase Register" },
      { type: "fix", text: "Vehicle Weight: Dispatch(Sale) pe Source->Destination, TP/G.Issued hidden, product list updated (USNA/RAW)" },
      { type: "fix", text: "Milling edit mein Paddy/FRK stock minus fix - apni entry double count nahi hoti" },
      { type: "fix", text: "Balance = Total - Advance (Cash/Diesel se deduct nahi hota)" },
      { type: "fix", text: "Font size 1 step badhaya poore app mein" },
      { type: "fix", text: "Stock linked: By-Product sale register ka sold data Stock Summary mein reflect hota hai" },
    ]
  },
  {
    version: "90.8.0",
    date: "Apr 2026",
    title: "v90.8.0 - By-Products Renamed + New Products",
    items: [
      { type: "new", text: "3 naye by-products add kiye: Rejection Rice, Pin Broken Rice, Poll" },
      { type: "fix", text: "Bran → Rice Bran, Kunda → Mota Kunda, Broken → Broken Rice, Husk → Bhusa renamed" },
      { type: "fix", text: "Kanki remove kiya (Broken Rice mein merge)" },
      { type: "fix", text: "Saare PDF/Excel exports, Milling CMR, Stock Summary, Opening Stock updated with 7 products" },
    ]
  },
  {
    version: "90.7.3",
    date: "Apr 2026",
    title: "v90.7.3 - Stability Restore",
    items: [
      { type: "fix", text: "By-Product categories wapas stable hardcoded (Bran, Kunda, Broken, Kanki, Husk) - dynamic category feature hata diya" },
      { type: "fix", text: "Settings se By-Products tab remove kiya" },
      { type: "fix", text: "Saare PDF/Excel exports stable - Bran, Kunda, Husk columns hardcoded" },
    ]
  },
  {
    version: "90.7.2",
    date: "Apr 2026",
    title: "v90.7.2 - Category Data Persistence Fix",
    items: [
      { type: "fix", text: "Custom by-product category (Rejection Rice) ab software restart karne pe bhi rahegi - saveImmediate se turant disk pe likhta hai" },
      { type: "fix", text: "App close karne pe pending saves flush hoti hain - data loss nahi hoga" },
      { type: "fix", text: "Purane data files mein missing arrays (byproduct_categories, opening_stock etc.) automatically initialize hoti hain" },
    ]
  },
  {
    version: "90.7.1",
    date: "Apr 2026",
    title: "v90.7.1 - Opening Stock Data Loss Fix",
    items: [
      { type: "fix", text: "Custom by-product (jaise Rejection Rice) ka opening stock save karne pe delete nahi hoga ab - pehle hardcoded list se strip ho jata tha" },
      { type: "fix", text: "Stock Summary crash fix (salebook.js duplicate variable error)" },
      { type: "fix", text: "Carry Forward ab dynamic categories ka closing stock bhi include karta hai" },
    ]
  },
  {
    version: "90.7.0",
    date: "Apr 2026",
    title: "v90.7.0 - Dynamic By-Product Categories Everywhere",
    items: [
      { type: "new", text: "Custom by-product categories (jaise Rejection Rice) ab Milling Report, PDF/Excel exports, Stock Summary, aur By-Product Sales sabhi jagah dikhte hain" },
      { type: "fix", text: "Milling Excel/PDF export mein sirf Bran, Kunda, Husk dikhta tha - ab saari dynamic categories show hoti hain" },
      { type: "fix", text: "By-Product Stock cards aur Sale dropdown ab dynamic categories se populate hote hain" },
    ]
  },
  {
    version: "90.6.2",
    date: "Apr 2026",
    title: "v90.6.2 - Opening Stock Data Loss Fix",
    items: [
      { type: "fix", text: "Opening Stock save karne par existing items delete nahi hote - merge approach use hota hai ab" },
    ]
  },
  {
    version: "90.6.1",
    date: "Apr 2026",
    title: "v90.6.1 - PDF Export Fix",
    items: [
      { type: "fix", text: "Transit Pass aur Form A PDF download fix - pehle stream error aa raha tha (safePdfPipe → doc.pipe)" },
    ]
  },
  {
    version: "90.6.0",
    date: "Apr 2026",
    title: "v90.6.0 - Form A PDF + Transit Pass PDF Fix + Opening Stock Fix",
    items: [
      { type: "new", text: "Form A - Paddy Stock Register ab PDF export bhi support karta hai (professional look)" },
      { type: "fix", text: "Transit Pass Register PDF download ab sahi PDF file download hota hai (pehle json aa raha tha)" },
      { type: "fix", text: "Settings → Opening Stock mai ab custom By-Products (jaise Rejection Rice) bhi dikhte hain" },
    ]
  },
  {
    version: "90.5.0",
    date: "Apr 2026",
    title: "v90.5.0 - Transit Pass Fix + Settings Bug Fix",
    items: [
      { type: "fix", text: "Transit Pass Register mai Mandi aur Agent dropdown ab sahi kaam karta hai (filter_options added)" },
      { type: "fix", text: "Settings page crash fix - ab sab tabs properly khulte hain" },
    ]
  },
  {
    version: "90.4.0",
    date: "Apr 2026",
    title: "v90.4.0 - Code Quality + Performance Overhaul",
    items: [
      { type: "new", text: "Lazy Loading - Heavy tabs (Reports, Settings, Govt Registers, Staff, etc.) ab on-demand load hote hain, app 30% fast khulta hai" },
      { type: "new", text: "Production Logger - Console output production mai suppress hota hai, development mai dikhta hai" },
      { type: "fix", text: "Component Splitting - App.js, Reports.jsx, Payments.jsx, CashBook routes chhote modules mai break kiye" },
      { type: "fix", text: "Security - XSS vulnerabilities, wildcard imports, empty error handlers sab fix kiye" },
      { type: "fix", text: "Performance - useMemo se expensive calculations cached, stable React keys se rendering fast" },
    ]
  },
  {
    version: "90.3.0",
    date: "Apr 2026",
    title: "v90.3.0 - Dynamic By-Products Fix + Opening Stock in FY Summary",
    items: [
      { type: "fix", text: "Custom By-Products (jaise Rejection Rice) ab Milling Entry mein save hoti hain aur Stock Summary/Sale Voucher mein dikhti hain" },
      { type: "fix", text: "Opening Stock (Settings se) ab FY Summary/Balance Sheet mein reflect hoti hai" },
      { type: "fix", text: "Purchase Book aur Sale Book stock items mein bhi dynamic categories sahi se aati hain" },
      { type: "fix", text: "Local Server aur Desktop App mein bhi dynamic by-products fix kiya" },
    ]
  },
  {
    version: "90.0.0",
    date: "Apr 2026",
    title: "v90.0.0 - Dynamic By-Product Categories",
    items: [
      { type: "new", text: "Settings mein 'By-Products' tab add hua - custom categories banao (add/edit/delete/reorder)" },
      { type: "new", text: "Jo categories banao wo Milling Form, Stock Summary, Sale Voucher - sab jagah automatically aayengi" },
      { type: "new", text: "Koi bhi category ko 'Auto' mark kar sakte ho (100% - others = auto%)" },
      { type: "new", text: "Default categories: Bran, Kunda, Broken, Kanki, Husk (Auto) - sab edit/delete ho sakte hain" },
    ]
  },
  {
    version: "89.6.0",
    date: "Apr 2026",
    title: "v89.6.0 - TP Weight Based Payment",
    items: [
      { type: "fix", text: "Agent Payment ab TP Weight ke hisab se hoga (pehle target based tha)" },
      { type: "fix", text: "TP Amount = TP Weight × Rate, Cutting bhi TP Weight based" },
      { type: "fix", text: "Dashboard Mandi Target vs Achieved mein bhi TP Weight based calculation" },
      { type: "fix", text: "Excel, PDF, Print - sab jagah TP Weight based payment" },
    ]
  },
  {
    version: "89.5.0",
    date: "Apr 2026",
    title: "v89.5.0 - Agent Payments: TP Weight & Excess Weight",
    items: [
      { type: "new", text: "Agent Payments mein TP Weight column add hua (tp_weight se total mandi ka)" },
      { type: "new", text: "Excess Weight = Achieved QNTL - TP Weight (positive green, negative red)" },
      { type: "new", text: "Print receipt, Excel aur PDF export mein bhi TP Weight aur Excess Weight aata hai" },
    ]
  },
  {
    version: "89.4.0",
    date: "Apr 2026",
    title: "v89.4.0 - QNTL Fix + Weekly View",
    items: [
      { type: "fix", text: "Government Registers - Sab values ab QNTL mein hain (pehle KG dikha raha tha)" },
      { type: "new", text: "Paddy Custody Register - Weekly view option add hua (Daily/Weekly toggle)" },
      { type: "new", text: "Paddy Stock Register (Form A) - Weekly view option add hua" },
    ]
  },
  {
    version: "89.3.0",
    date: "Apr 2026",
    title: "v89.3.0 - Transit Pass, CMR Delivery & Security Deposit",
    items: [
      { type: "new", text: "Transit Pass Register - Mill Entries se auto-generate (jahan TP No. hai)" },
      { type: "new", text: "CMR Delivery Tracker - OSCSC/RRC ko rice delivery ka record with Outturn Ratio (OTR)" },
      { type: "new", text: "Security Deposit (Bank Guarantee) - SD ratio, validity tracking, auto-expiry check" },
      { type: "new", text: "Government Registers ab 10 sub-tabs ke saath complete compliance system hai" },
    ]
  },
  {
    version: "89.2.0",
    date: "Apr 2026",
    title: "v89.2.0 - Paddy Custody Register Moved",
    items: [
      { type: "fix", text: "Paddy Custody Register + Mandi Wise Custody Register ab Government Registers section mein hai" },
      { type: "new", text: "Government Registers ab default tab Paddy Custody se khulta hai" },
    ]
  },
  {
    version: "89.1.0",
    date: "Apr 2026",
    title: "v89.1.0 - Government Registers (OSCSC Compliance)",
    items: [
      { type: "new", text: "Government Registers - Naya section add hua! Odisha OSCSC KMS 2025-26 compliance ke liye" },
      { type: "new", text: "Form A - Paddy Stock Register (OSCSC se aaya paddy ka daily record, Mill Entries se auto linked)" },
      { type: "new", text: "Form B - CMR Register (Custom Milled Rice produced & delivered, Milling + Sale Book se linked)" },
      { type: "new", text: "Form E - Miller's Own Paddy (Private paddy purchases ka record)" },
      { type: "new", text: "Form F - Miller's Own Rice Sale (Sale Book se linked rice sales)" },
      { type: "new", text: "FRK Blending Register - Fortified Rice Kernel batch tracking (OSCSC 1:100 ratio)" },
      { type: "new", text: "Gunny Bag Stock Register - Bag type wise stock management (New/Old/Plastic)" },
      { type: "new", text: "Sabhi registers ka Excel export government format mein" },
    ]
  },
  {
    version: "89.0.0",
    date: "Apr 2026",
    title: "v89.0.0 - Bags Mandatory Validation",
    items: [
      { type: "new", text: "Mill Entry - Bags field mandatory! Gunny Bags ya Plastic Bags mein se ek toh hona chahiye, warna entry nahi hogi" },
    ]
  },
  {
    version: "88.99.0",
    date: "Apr 2026",
    title: "v88.99.0 - Sale Voucher Enhancements",
    items: [
      { type: "new", text: "Sale Voucher - Destination field add hua (maal kaha jayega)" },
      { type: "new", text: "Sale Voucher - Bill Book field (kaha se bill hua)" },
      { type: "new", text: "Sale Voucher - Oil % option (Bran/Kunda select karne pe dikhega)" },
      { type: "fix", text: "Invoice No. → Bill No. rename kiya" },
      { type: "fix", text: "Quantity ab KG mein default hai" },
    ]
  },
  {
    version: "88.98.0",
    date: "Apr 2026",
    title: "v88.98.0 - Professional Mandi Custody Excel",
    items: [
      { type: "new", text: "Mandi Wise Custody Register Excel - Professional header (Company Name + Tagline), TOTAL (Q) aur PROG. TOTAL (Q) columns, Grand Total row, alternating row colors, frozen header" },
    ]
  },
  {
    version: "88.97.0",
    date: "Apr 2026",
    title: "v88.97.0 - Custody Registers QNTL Fix",
    items: [
      { type: "fix", text: "Mandi Wise Custody Register ab QNTL mein dikhayega (pehle KG mein tha). Final W / 100 = QNTL" },
    ]
  },
  {
    version: "88.96.0",
    date: "Apr 2026",
    title: "v88.96.0 - Final W in Custody Registers",
    items: [
      { type: "fix", text: "Paddy Custody Register aur Mandi Wise Custody Register ab Final W (mill_w ki jagah) use karta hai - moisture/cutting cuts ke baad ka sahi weight" },
    ]
  },
  {
    version: "88.95.0",
    date: "Apr 2026",
    title: "v88.95.0 - Browser CORS Fix",
    items: [
      { type: "fix", text: "Mandi Wise Custody Register ab browser (mill.9x.design) mein bhi data dikhayega - CORS issue fix kiya" },
      { type: "fix", text: "MillEntryForm mein bhi same browser API fix" },
    ]
  },
  {
    version: "88.94.0",
    date: "Apr 2026",
    title: "v88.94.0 - Mandi Custody Register Desktop Fix",
    items: [
      { type: "fix", text: "Desktop/Local - Mandi Wise Custody Register ab data dikhayega (galat collection 'milling_entries' ki jagah sahi 'entries' use ho raha hai)" },
    ]
  },
  {
    version: "88.93.0",
    date: "Apr 2026",
    title: "v88.93.0 - Triple Backend Parity System",
    items: [
      { type: "new", text: "Parity Checker Script - Ab ek command se pata chalega ki Python aur JS mein kaunse routes missing hain" },
      { type: "new", text: "Route Sync Script - Desktop → Local Server routes ek click mein sync" },
      { type: "fix", text: "Desktop ↔ Local Server routes 100% sync kiye (milling, reports, vehicle_weight)" },
    ]
  },
  {
    version: "88.92.0",
    date: "Apr 2026",
    title: "v88.92.0 - Negative Weight Validation",
    items: [
      { type: "new", text: "Auto Vehicle Weight - Ab 2nd Weight > 1st Weight hone par entry reject hogi (Negative net weight allowed nahi)" },
      { type: "fix", text: "Triple backend (Web + Desktop + Local) sab mein validation applied" },
    ]
  },
  {
    version: "88.91.0",
    date: "Apr 2026",
    title: "v88.91.0 - Paddy Chalna Export Fix (Desktop)",
    items: [
      { type: "fix", text: "Desktop App - Paddy Chalna (Cutting) ka Excel aur PDF export ab kaam karega (pehle routes missing the JS backend mein)" },
      { type: "fix", text: "Local Server - Same export routes added for LAN mode" },
    ]
  },
  {
    version: "88.90.0",
    date: "Apr 2026",
    title: "v88.90.0 - Desktop Mandi Custody Register Fix",
    items: [
      { type: "fix", text: "Desktop App - Mandi Wise Custody Register ab data dikhayega (pehle blank aa raha tha - galat collection name tha JS backend mein)" },
      { type: "fix", text: "Local Server - Same fix applied for LAN/network mode" },
    ]
  },
  {
    version: "88.89.0",
    date: "Apr 2026",
    title: "v88.89.0 - Mandi Custody FY Filter Fix",
    items: [
      { type: "fix", text: "Mandi Custody Register - FY year filter ab sahi pass hoga (pehle 'All' dikha raha tha). PDF aur Excel mein bhi correct FY dikhega" },
    ]
  },
  {
    version: "88.88.0",
    date: "Apr 2026",
    title: "v88.88.0 - Mandi Custody Excel Header Fix",
    items: [
      { type: "fix", text: "Mandi Wise Custody Register Excel - Company Name header, title, FY info, Grand Total row aur DD/MM/YYYY date format add kiya" },
      { type: "fix", text: "Mandi Custody Register UI date format fix - ab DD/MM/YYYY dikhega" },
    ]
  },
  {
    version: "88.87.0",
    date: "Apr 2026",
    title: "v88.87.0 - Mandi Wise Custody Register + Watermark Global",
    items: [
      { type: "new", text: "Mandi Wise Custody Register - Milling (CMR) > Paddy Custody Register ke andar, date-wise mandi procurement with TOTAL & PROG.TOTAL" },
      { type: "new", text: "PDF/Excel export with professional layout - company header, color-coded columns, grand total footer" },
      { type: "fix", text: "Watermark ab HAR PDF mein aayega - Mill Parts, Daily Report, Vehicle Weight, Telegram sab mein" },
      { type: "fix", text: "Date format fix - ab DD/MM/YYYY dikhega (pehle year missing tha)" },
      { type: "new", text: "Settings.jsx 11 files mein break - faster loading aur easy maintenance" },
    ]
  },
  {
    version: "88.85.0",
    date: "Apr 2026",
    title: "v88.85.0 - Quick Search + Watermark + Refactoring",
    items: [
      { type: "new", text: "Quick Search - ab entry click karne par sirf uss entry ka detail dialog khulega, pura tab nahi" },
      { type: "fix", text: "PDF Watermark - ab puri page par tiled/repeat hoga (pehle sirf center mein tha)" },
      { type: "fix", text: "Weight Discrepancy page crash fix (Input + Mandi dropdown error)" },
    ]
  },
  {
    version: "88.84.0",
    date: "Apr 2026",
    title: "v88.84.0 - Desktop Critical Fixes",
    items: [
      { type: "fix", text: "EPERM crash fix - watermark upload folder ab User Home mein banega, Program Files mein nahi (Windows permission issue)" },
      { type: "fix", text: "Connected Sessions - ab sirf 1 Browser dikhega (pehle 2 dikha raha tha duplicate tracking ki wajah se)" },
    ]
  },
  {
    version: "88.83.0",
    date: "Apr 2026",
    title: "v88.83.0 - Discrepancy Report Fix + UI Cleanup",
    items: [
      { type: "fix", text: "Weight Discrepancy Report - diff sign fix: TP 253, Mill 50 toh ab -203 dikhega (pehle +203 dikhata tha)" },
      { type: "new", text: "Agent aur Mandi ab dropdown select mein hai (Weight Discrepancy Report)" },
      { type: "fix", text: "TP Weight red indicator hataya (VW Table, Mill Entry Form, Entry Table) - koi kaam ka nahi tha" },
    ]
  },
  {
    version: "88.82.0",
    date: "Apr 2026",
    title: "v88.82.0 - Browser Session Tracking + Fixes",
    items: [
      { type: "fix", text: "Browser session ab Connected panel mein dikhega - same PC pe browser se open karne par bhi track hoga" },
      { type: "fix", text: "Login crash fix - watermark upload dir error handle + getUser() null safety" },
      { type: "fix", text: "Paddy Cutting data ab properly SQLite mein save hoga" },
      { type: "fix", text: "fmtVal string toFixed crash + Weight Discrepancy PDF undefined function fix" },
    ]
  },
  {
    version: "88.81.0",
    date: "Apr 2026",
    title: "v88.81.0 - Critical Fixes",
    items: [
      { type: "fix", text: "Login aur Users list crash fix - watermark upload dir create fail hone par ab error handle hota hai" },
      { type: "fix", text: "Users data null hone par getUser() crash nahi karega (safety check)" },
      { type: "fix", text: "Paddy Cutting data ab SQLite mein properly save hoga (ARRAY_COLLECTIONS mein add hua)" },
      { type: "fix", text: "Agent & Mandi Report - string values pe toFixed crash fix (fmtVal)" },
      { type: "fix", text: "Weight Discrepancy PDF - undefined createPdfDoc function replace hua" },
    ]
  },
  {
    version: "88.80.0",
    date: "Apr 2026",
    title: "v88.80.0 - Bug Fixes (Desktop PDF)",
    items: [
      { type: "fix", text: "Agent & Mandi Report PDF/Excel crash fix - string values pe toFixed error hata diya (Desktop/Local)" },
      { type: "fix", text: "Weight Discrepancy PDF crash fix - undefined functions (createPdfDoc, drawPdfTable) replace kiye (Desktop/Local)" },
      { type: "fix", text: "Watermark Font Size aur Rotation Angle control add hua (20-120px, 0°-90°)" },
    ]
  },
  {
    version: "88.79.0",
    date: "Apr 2026",
    title: "v88.79.0 - Watermark Font & Rotation Control",
    items: [
      { type: "new", text: "Watermark Font Size slider (20px - 120px) - apni marzi ka size set karein" },
      { type: "new", text: "Watermark Rotation Angle slider (0° - 90°) - tircha ya seedha watermark" },
      { type: "fix", text: "Preview box mein font size aur rotation live update hota hai" },
    ]
  },
  {
    version: "88.78.0",
    date: "Apr 2026",
    title: "v88.78.0 - Global PDF Watermark",
    items: [
      { type: "new", text: "PDF Watermark Feature - Settings mein ON/OFF toggle se sabhi PDF exports mein watermark aayega" },
      { type: "new", text: "Text ya Image dono type ka watermark set kar sakte hain" },
      { type: "new", text: "Opacity slider se watermark ka halkapan set karein (2% se 20%)" },
      { type: "new", text: "Live preview dikhta hai Settings > Watermark tab mein" },
    ]
  },
  {
    version: "88.77.0",
    date: "Apr 2026",
    title: "v88.77.0 - PDF Fix & UI Theme Update",
    items: [
      { type: "fix", text: "Agent & Mandi Report PDF mein first row header ke upar overlap hota tha - ab sahi hai (Desktop/Local)" },
      { type: "fix", text: "Agent & Mandi Report PDF mein total rounding fix (2459.8999999 ab nahi aayega)" },
      { type: "fix", text: "Wt Discrepancy page ab white theme mein hai - clean aur readable" },
    ]
  },
  {
    version: "88.76.0",
    date: "Apr 2026",
    title: "v88.76.0 - TP Weight Validation & Discrepancy Report",
    items: [
      { type: "new", text: "TP Weight vs QNTL/Net Wt auto-validation - farak hone par red indicator dikhta hai (VW, Mill Entry, Table)" },
      { type: "new", text: "Weight Discrepancy Report - naya report tab (Reports > Wt Discrepancy)" },
      { type: "new", text: "Discrepancy Report mein date, agent, mandi filter + Excel/PDF export" },
      { type: "fix", text: "Agent & Mandi Report mein TP Wt column aur total add hua (Desktop fix)" },
    ]
  },
  {
    version: "88.75.0",
    date: "Apr 2026",
    title: "v88.75.0 - Export & Report Fixes",
    items: [
      { type: "fix", text: "Agent & Mandi Report PDF/Excel mein TP Wt column aur total add hua" },
      { type: "fix", text: "Daily Report Detail table mein TP Wt column add hua, Diesel overflow fix" },
      { type: "fix", text: "Daily Report PDF/Excel mein Paddy Chalna / छलना section add hua (Desktop)" },
      { type: "fix", text: "PPR TOTAL row alignment fix + TP Wt total dikhta hai" },
      { type: "fix", text: "Eye View Dialog mein TP Weight (Q) dikhta hai" },
      { type: "fix", text: "Desktop getTotals() mein total_tp_weight add hua" },
    ]
  },
  {
    version: "88.74.0",
    date: "Apr 2026",
    title: "v88.74.0 - Export Totals Fix",
    items: [
      { type: "fix", text: "Mill Entries PDF/Excel mein TP Weight ka total ab dikhta hai" },
      { type: "fix", text: "Vehicle Weight Excel mein totals row add hua (Bags, 1st/2nd/Net Wt, TP Wt, G.Issued, Cash, Diesel)" },
      { type: "fix", text: "Vehicle Weight PDF mein TP Wt aur G.Issued totals fix kiya" },
      { type: "fix", text: "Daily Report PDF/Excel mein TP Weight column aur summary add hua" },
      { type: "fix", text: "Eye View Dialog mein ab TP Weight (Q) dikhta hai" },
      { type: "fix", text: "Paddy Purchase Register TOTAL row alignment fix kiya (pehle shift ho raha tha)" },
    ]
  },
  {
    version: "88.73.0",
    date: "Apr 2026",
    title: "v88.73.0 - TP Wt Export + Cascade Edit",
    items: [
      { type: "feature", text: "Vehicle Weight PDF/Excel mein TP Wt column add hua" },
      { type: "feature", text: "Mill Entries PDF/Excel mein TP Wt column add hua" },
      { type: "feature", text: "VW Edit se linked Mill Entry bhi auto-update hota hai (Party, Vehicle, Source, Bags, TP No., TP Wt)" },
    ]
  },
  {
    version: "88.72.0",
    date: "Apr 2026",
    title: "v88.72.0 - Error Message Fix",
    items: [
      { type: "fix", text: "Edit/Delete mein ab proper error message dikhta hai (e.g. TP duplicate warning)" },
    ]
  },
  {
    version: "88.71.0",
    date: "Apr 2026",
    title: "v88.71.0 - VW Create Fix",
    items: [
      { type: "fix", text: "Vehicle Weight create crash fix (weights2 scope error in TP duplicate check)" },
    ]
  },
  {
    version: "88.70.0",
    date: "Apr 2026",
    title: "v88.70.0 - TP Weight & Edit Dialog Fixes",
    items: [
      { type: "fix", text: "TP Weight ab sahi value show karta hai (÷100 hata diya, QNTL mein hi store hota hai)" },
      { type: "fix", text: "Print Slip CUSTOMER COPY mein TP No. / TP Weight nahi dikhega" },
      { type: "fix", text: "Edit Dialog layout fix - Diesel Paid ab sahi row mein dikhta hai (4+2 grid)" },
      { type: "feature", text: "Edit Dialog mein Vehicle No, Party Name, Source mein auto-suggestion" },
    ]
  },
  {
    version: "88.69.0",
    date: "Apr 2026",
    title: "v88.69.0 - Second Weight Unlock Fix",
    items: [
      { type: "fix", text: "Auto VW: Bags aur TP No. ab second weight mode mein editable hain (pehle locked the)" },
    ]
  },
  {
    version: "88.68.0",
    date: "Apr 2026",
    title: "v88.68.0 - Bug Fixes",
    items: [
      { type: "fix", text: "Vehicle Weight create crash fix (weights not defined)" },
      { type: "fix", text: "Daily Report crash fix (kmsYear not defined)" },
    ]
  },
  {
    version: "88.67.0",
    date: "Apr 2026",
    title: "v88.67.0 - TP Weight QNTL Fix + Bug Fixes",
    items: [
      { type: "fix", text: "TP Weight ab QNTL mein display hota hai (pehle KG tha)" },
      { type: "feature", text: "Agent & Mandi Report summary card mein TP Wt column add hua (Final Wt ke baad)" },
      { type: "feature", text: "Grand Summary cards mein TP Weight card add hua" },
      { type: "fix", text: "Auto Weight Entries, Paddy Purchase Register, Agent & Mandi Report mein TP Weight column add hua" },
      { type: "fix", text: "Daily Report crash fix - kmsYear undefined error resolved" },
      { type: "fix", text: "Agent & Mandi Report empty mandi name crash fix" },
    ]
  },
  {
    version: "88.65.0",
    date: "Apr 2026",
    title: "v88.65.0 - VW Cascade Delete + Daily Report Paddy Chalna",
    items: [
      { type: "feature", text: "VW entry delete karne par linked Mill Entry + Cash/Diesel/Gunny transactions automatic delete ho jayenge" },
      { type: "feature", text: "Daily Report UI mein Paddy Chalna section — Aaj Cut, Total Paddy Bags, Total Cut, Remaining dikhega" },
      { type: "fix", text: "Daily Report PDF/Excel mein bhi Paddy Chalna summary + detail (jab cutting ho uss din)" },
    ]
  },
  {
    version: "88.64.0",
    date: "Apr 2026",
    title: "v88.64.0 - Paddy Chalna in Daily Report",
    items: [
      { type: "feature", text: "Daily Report mein Paddy Chalna section — Aaj Cut, Total Paddy Bags, Total Cut (All), Remaining dikhega" },
      { type: "feature", text: "Normal mode mein summary cards + Detail mode mein individual cutting entries (Bags Cut, Remark)" },
      { type: "feature", text: "Daily Report PDF aur Excel mein bhi Paddy Chalna section with cumulative totals" },
    ]
  },
  {
    version: "88.63.0",
    date: "Apr 2026",
    title: "v88.63.0 - PDF Header GST Fix",
    items: [
      { type: "fix", text: "PDF header mein GST number left se cut nahi hoga ab — proper padding set kiya saare PDF exports mein" },
    ]
  },
  {
    version: "88.62.0",
    date: "Apr 2026",
    title: "v88.62.0 - Paddy Chalna Export Fix",
    items: [
      { type: "fix", text: "PDF/Excel mein Mill Bags aur Plastic Bags alag-alag hata diya — sirf Total Paddy Bags, Total Cut, Remaining dikhega" },
    ]
  },
  {
    version: "88.61.0",
    date: "Apr 2026",
    title: "v88.61.0 - Paddy Chalna Export Sundar",
    items: [
      { type: "feature", text: "PDF/Excel exports mein company header, FY/Season/Date filter info, summary cards (Mill Bags, Plastic Bags, Total, Cut, Remaining)" },
      { type: "feature", text: "Running Total + Remaining column add kiya — har entry ke baad kitna bacha dikhega" },
      { type: "feature", text: "Styled summary section, total row, aur proper column widths" },
    ]
  },
  {
    version: "88.60.0",
    date: "Apr 2026",
    title: "v88.60.0 - Paddy Chalna: Date Filter + Export + Daily Report",
    items: [
      { type: "feature", text: "Paddy Chalna mein Date Filter (From/To) aur Excel/PDF export add kiya" },
      { type: "feature", text: "Daily Report (Normal + Detail) mein Paddy Cutting section add hua — kitne bags cut hue aaj dikhega" },
      { type: "fix", text: "Summary cards: Total Paddy Bags (Mill+Plastic combined), Total Cut, Remaining Paddy Bags" },
    ]
  },
  {
    version: "88.59.0",
    date: "Apr 2026",
    title: "v88.59.0 - Paddy Chalna Cards Simplified",
    items: [
      { type: "fix", text: "Paddy Chalna mein ab 3 cards: Total Paddy Bags (Mill+Plastic combined), Total Cut, Remaining Paddy Bags" },
    ]
  },
  {
    version: "88.58.0",
    date: "Apr 2026",
    title: "v88.58.0 - Paddy Chalna (Cutting) Tracker",
    items: [
      { type: "feature", text: "Milling (CMR) tab mein naya sub-tab: Paddy Chalna — daily cutting log rakhein" },
      { type: "feature", text: "Summary cards: Bag Received (Mill + Plastic) se kitna cut hua aur kitna bacha — ek nazar mein" },
      { type: "feature", text: "Date + Bags Cut + Remark entry form — Edit/Delete bhi available" },
    ]
  },
  {
    version: "88.57.0",
    date: "Apr 2026",
    title: "v88.57.0 - VW Linked Edit/Delete Permission",
    items: [
      { type: "feature", text: "Settings mein naya permission: VW Linked Edit — Enable karo toh Mill Entry mein use hui VW entry ko bhi edit/delete kar sakte ho" },
      { type: "feature", text: "Admin ke liye default ON, baaki roles ke liye OFF — full control aapke haath mein" },
    ]
  },
  {
    version: "88.55.0",
    date: "Apr 2026",
    title: "v88.55.0 - TP Duplicate Prevention + Mill Entry RST Lock",
    items: [
      { type: "feature", text: "Mill Entry mein RST fetch hone par Date, Truck No., FY Year, Season, TP No., Agent Name, Mandi Name sab lock ho jayenge" },
      { type: "fix", text: "TP No. duplicate ab server-side check hota hai — paginated data miss hone ka issue khatam" },
      { type: "fix", text: "TP duplicate check teeno backends mein — First Weight, Second Weight, aur Edit mein" },
    ]
  },
  {
    version: "88.54.0",
    date: "Apr 2026",
    title: "v88.54.0 - Sync Status + Mill Entry RST Lock",
    items: [
      { type: "feature", text: "Mill Entry mein RST fetch hone par Date, Truck No., FY Year, Season, TP No., Agent Name, Mandi Name sab lock ho jayenge — sirf RST se aaya data dikhega" },
      { type: "fix", text: "Bahar browser/mobile se open karne pe ab DATA SYNC panel dikhega — Entries, Vehicle Wt, Cash Txns count + Last Save time + Engine info" },
      { type: "fix", text: "Local Server mein /api/sync-status endpoint add kiya — Cloudflare Tunnel se bhi sync info accessible" },
    ]
  },
  {
    version: "88.53.0",
    date: "Apr 2026",
    title: "v88.53.0 - Settings Cross-Device Sync Fix",
    items: [
      { type: "fix", text: "Camera Config ab har device pe sync hoga — mill computer pe save karo, bahar browser/mobile pe bhi wohi settings aayengi" },
      { type: "fix", text: "Mandi Cutting Map bhi auto-migrate hota hai — purana localStorage data backend pe sync hoga" },
      { type: "fix", text: "Auto-migration: agar settings sirf localStorage mein hain toh automatically backend database mein save ho jayengi" },
    ]
  },
  {
    version: "88.52.0",
    date: "Apr 2026",
    title: "v88.52.0 - VW Mandatory Fields + RST Lock",
    items: [
      { type: "feature", text: "Auto Vehicle Weight mein Party Name aur Source ab mandatory hai — bina bhare entry nahi hogi" },
      { type: "feature", text: "Second Weight mode mein sabhi fields locked — RST fetch hone ke baad Vehicle, Party, Source, Product, Trans Type, Bags, TP No, Date change nahi kar sakte" },
    ]
  },
  {
    version: "88.51.0",
    date: "Apr 2026",
    title: "v88.51.0 - RST Duplicate Fix + Date Sorting",
    items: [
      { type: "fix", text: "Auto Vehicle Weight mein RST number ab duplicate nahi hoga — race condition guard added" },
      { type: "fix", text: "Auto Vehicle Weight entries ab date ke hisaab se sort hote hain (pehle creation time se hota tha)" },
      { type: "fix", text: "Date sorting export/PDF mein bhi fix kiya" },
    ]
  },
  {
    version: "88.50.0",
    date: "Apr 2026",
    title: "v88.50.0 - Keyboard Navigation Fix + Date Permission",
    items: [
      { type: "fix", text: "Mill Entry form mein Backspace ab poore form mein kaam karta hai — Save se Disc/Dust/Poll tak bina mouse ke navigate karein" },
      { type: "fix", text: "Readonly/Auto fields (Mill W, Final W, Cutting etc.) ab Backspace se skip hote hain" },
      { type: "fix", text: "Browser back nahi jayega Backspace press karne par" },
      { type: "feature", text: "Date Change ab per-user permission hai — Settings mein Users ke Permissions mein ON/OFF karein" },
    ]
  },
  {
    version: "88.48.0",
    date: "Apr 2026",
    title: "v88.48.0 - TP Duplicate Check + Date Lock + Bug Fixes",
    items: [
      { type: "feature", text: "Auto Vehicle Weight mein duplicate TP Number entry ab nahi hogi — warning dikhega 'TP No. X already RST #Y mein added hai!'" },
      { type: "feature", text: "Settings mein Date Lock toggle — ON karne se Auto Vehicle Weight mein sirf current date dikhegi" },
      { type: "feature", text: "Settings mein Recalculate Entries button — purani entries ka Mill W naye formula se recalculate hoga" },
      { type: "fix", text: "Mill W mein ab P.Pkt Cut bhi minus hota hai (Formula: KG - GBW Cut - P.Pkt Cut)" },
      { type: "fix", text: "Staff Payment PDF export crash fix (_addPdfHdr error)" },
      { type: "fix", text: "SQLite database startup crash fix (pragma compatibility)" },
      { type: "fix", text: "User Permissions save fix — Settings mein user edit karne par ab redirect nahi hoga" },
    ]
  },
  {
    version: "88.45.0",
    date: "Apr 2026",
    title: "v88.45.0 - Dark Theme Fix",
    items: [
      { type: "fix", text: "Dark theme mein Auto Vehicle Weight, Weight Entries, QuickSearch sab ab clearly dikhega" },
      { type: "fix", text: "Input fields, labels, tables, buttons sab dark theme compatible ho gaye" },
    ]
  },
  {
    version: "88.44.0",
    date: "Apr 2026",
    title: "v88.44.0 - Mobile Responsive",
    items: [
      { type: "feature", text: "Mobile se browser mein software kholne par ab app jaisa dikhega — responsive UI" },
      { type: "feature", text: "Mobile mein hamburger menu (3-column icon grid) se tab navigate karo" },
      { type: "fix", text: "Header, buttons, tables, footer sab mobile friendly — desktop pe koi change nahi" },
    ]
  },
  {
    version: "88.43.0",
    date: "Apr 2026",
    title: "v88.43.0 - RST Edit Permission + Logout Close",
    items: [
      { type: "feature", text: "RST Edit ab user permission mein hai — Settings > Users > Permissions mein ON/OFF karo" },
      { type: "feature", text: "Desktop app mein Logout karne par ab software band ho jayega" },
      { type: "fix", text: "Admin ke liye RST Edit default ON, baaki roles ke liye OFF" },
    ]
  },
  {
    version: "88.42.0",
    date: "Apr 2026",
    title: "v88.42.0 - RST Edit Setting + Logout Close",
    items: [
      { type: "feature", text: "Settings > Messaging mein Manual RST Number Edit ka ON/OFF toggle add kiya" },
      { type: "feature", text: "Desktop app mein Logout karne par ab software band ho jayega (login page nahi aayega)" },
      { type: "fix", text: "JSON backup file upload restore endpoint teeno backends mein add kiya" },
    ]
  },
  {
    version: "88.41.0",
    date: "Apr 2026",
    title: "v88.41.0 - PDF & Validation Fixes",
    items: [
      { type: "fix", text: "Paddy Purchase Register PDF mein ab sahi title dikhega — pehle 'Mill Entries Report' aata tha" },
      { type: "fix", text: "Truck number ka last digit ab PDF mein nahi katega — column width badhayi" },
      { type: "fix", text: "Blank Mill Entry ab save nahi hogi — Truck No, Agent ya Mandi mein se kuch bharna zaruri" },
    ]
  },
  {
    version: "88.40.0",
    date: "Apr 2026",
    title: "v88.40.0 - Season vs FY Fix",
    items: [
      { type: "fix", text: "Kharif se Rabi switch karne par Cash Balance, Ledger, Payments ab 0 nahi hoga — poore FY ka data dikhega" },
      { type: "feature", text: "Financial sections (Cash Book, Ledgers, Payments, Staff, Hemali, Vouchers, FY Summary) ab FY-wise hain" },
      { type: "fix", text: "Entries, Milling, DC Tracker season-wise filter pehle jaisa kaam karega" },
    ]
  },
  {
    version: "88.39.0",
    date: "Apr 2026",
    title: "v88.39.0 - Trans Type Fix + JSON Backup",
    items: [
      { type: "fix", text: "Trans → Trans Type rename ab 100% complete — VW PDF slip aur Photo Dialog mein bhi fix ho gaya" },
      { type: "feature", text: "Settings > Data mein ab JSON file bhi upload karke restore kar sakte ho (ZIP ke saath)" },
      { type: "fix", text: "JSON restore endpoint teeno backends mein add kiya — pehle 404 error aata tha" },
    ]
  },
  {
    version: "88.37.0",
    date: "Apr 2026",
    title: "v88.37.0 - Backup Fixes",
    items: [
      { type: "fix", text: "Logout par auto backup ab sahi kaam karega" },
      { type: "fix", text: "Backup folder path restart ke baad bhi yaad rahega (settings persist fix)" },
    ]
  },
  {
    version: "88.36.0",
    date: "Apr 2026",
    title: "v88.36.0 - Auto Backup on Logout + Custom Backup Folder",
    items: [
      { type: "feature", text: "Logout karne par auto backup — din mein 100 baar bhi logout karo, har baar backup banega" },
      { type: "feature", text: "Settings > Data mein backup folder/drive select karne ka option" },
      { type: "feature", text: "Sab backups (manual, daily, logout) custom folder mein bhi copy hote hain" },
      { type: "fix", text: "Trans → Trans Type fix (PDF slip + Excel export)" },
    ]
  },
  {
    version: "88.34.0",
    date: "Apr 2026",
    title: "v88.34.0 - Cash/Diesel Sync Fix + Fast Auto-Sync",
    items: [
      { type: "fix", text: "Mill Entry mein cash/diesel edit karne par ab Vehicle Weight mein bhi turant update hoga" },
      { type: "feature", text: "Fast Auto-Sync: Sync window 30s se 10s, lock release 2s se 0.5s" },
      { type: "fix", text: "Google Drive API code hata diya — ab direct file sync se kaam hoga (no API key needed)" },
    ]
  },
  {
    version: "88.33.0",
    date: "Apr 2026",
    title: "v88.33.0 - Fast Auto-Sync",
    items: [
      { type: "feature", text: "Fast Sync: Har save ke baad file lock release — Google Drive turant sync karega" },
      { type: "feature", text: "Sync Window: 30sec se 10sec — data 3x fast sync" },
      { type: "feature", text: "Lock release: 2sec se 0.5sec — app jyada responsive" },
    ]
  },
  {
    version: "88.31.0",
    date: "Apr 2026",
    title: "v88.31.0 - Google Drive API Direct Sync",
    items: [
      { type: "feature", text: "Google Drive Direct API — Settings > Sync mein Google Drive connect karo, data automatically sync hoga" },
      { type: "feature", text: "Smart Sync — Newer file automatically detect hota hai (upload/download)" },
      { type: "feature", text: "Auto Sync — Data save hone par 3s mein upload + configurable polling (default 10s)" },
      { type: "feature", text: "Header Sync button ab Google Drive se sync karega (agar connected hai)" },
    ]
  },
  {
    version: "88.25.0",
    date: "Apr 2026",
    title: "v88.25.0 - Google Drive Sync + File Watcher",
    items: [
      { type: "feature", text: "File Watcher — Google Drive se data auto-detect hoga jab dusre computer se entry aaye (5 sec polling)" },
      { type: "feature", text: "Manual Sync Button — Header mein 'Sync' button se turant data reload karo" },
      { type: "fix", text: "VW PDF table width full page cover karega — side gap fix kiya" },
    ]
  },
  {
    version: "88.23.0",
    date: "Apr 2026",
    title: "v88.23.0 - RST Sort Fix + VW PDF Redesign",
    items: [
      { type: "fix", text: "RST Number ab 100% sahi ascending order mein aayega — date normalization fix (time component strip)" },
      { type: "fix", text: "Mandi column width badhaya — MEDINIPUR, MAA JOGAMAYA jaisi lambi names ab puri dikhegi PDF/Excel mein" },
      { type: "fix", text: "SABHI route files mein date sort normalize kiya — Desktop + Local + Python teeno backends" },
      { type: "feature", text: "Vehicle Weight PDF sundar banaya — Color-coded columns (Navy/Teal/Orange headers), date separators, version footer" },
    ]
  },
  {
    version: "88.22.0",
    date: "Apr 2026",
    title: "v88.22.0 - KG/QNTL Lock + ESC Key Fix",
    items: [
      { type: "fix", text: "KG & QNTL fields ab edit mode mai bhi locked rahenge - koi manually change nahi kar sakta" },
      { type: "fix", text: "Photo zoom mai ESC dabane par ab sirf photo band hoga, pura dialog nahi" },
    ]
  },
  {
    version: "88.21.0",
    date: "Apr 2026",
    title: "v88.21.0 - Export Preview Removed + Sorting Fixes",
    items: [
      { type: "fix", text: "Export Preview feature hata diya - bekar tha" },
      { type: "fix", text: "RST Number ab serial order mai aayega PDF/Excel mai (date + RST ascending)" },
      { type: "fix", text: "Mandi column width badhaya - MAA JOGAMAYA jaisi lambi mandi names ab puri dikhegi" },
      { type: "fix", text: "SARE PDF/Excel exports ab ascending date order mai (purana upar, naya neeche) - Desktop/Local dono mai" },
      { type: "fix", text: "Desktop/Local app ke sabhi PDF/Excel mai dates ab DD-MM-YYYY format mai" },
    ]
  },
  {
    version: "88.17.0",
    date: "Apr 2026",
    title: "v88.17.0 - Export Sort + Mandi Width Fix",
    items: [
      { type: "fix", text: "Sabhi PDF/Excel exports ab date ascending order mai hain (purani date upar)" },
      { type: "fix", text: "Mandi column width badaya - Maa Jogamaya jaise lambe naam ab nahi katenge" },
    ]
  },
  {
    version: "88.16.0",
    date: "Apr 2026",
    title: "v88.16.0 - Sorting + ESC Photo Fix",
    items: [
      { type: "fix", text: "PPR aur Mill Entries ab Date wise phir RST serial wise sorted hain" },
      { type: "fix", text: "View mai zoomed photo ESC se pehle band hoga - dialog baad mai" },
    ]
  },
  {
    version: "88.15.0",
    date: "Apr 2026",
    title: "v88.15.0 - ESC Photo Priority Fix",
    items: [
      { type: "fix", text: "View mai zoom photo open ho toh ESC pehle photo band karega - dialog nahi" },
      { type: "fix", text: "Photo band hone ke baad ESC se dialog band hoga" },
    ]
  },
  {
    version: "88.14.0",
    date: "Apr 2026",
    title: "v88.14.0 - RST Lock + View Dialog + Season Fix",
    items: [
      { type: "feature", text: "RST se fetch hone par KG aur QNTL fields lock ho jaate hain - koi edit nahi kar sakta" },
      { type: "feature", text: "PPR mai row click ya Eye button se View dialog khulta hai - bina redirect" },
      { type: "fix", text: "Season filter (Kharif/Rabi) ab software restart ke baad bhi yaad rehta hai" },
      { type: "fix", text: "View dialog ESC key se turant band hota hai" },
    ]
  },
  {
    version: "88.13.0",
    date: "Apr 2026",
    title: "v88.13.0 - Stability Fix",
    items: [
      { type: "fix", text: "macOS build hata diya - sirf Windows build hogi (pehle jaisa)" },
      { type: "fix", text: "Electron 28 pe wapas - Windows stability restore" },
      { type: "feature", text: "Google Drive folder open hone mai better error handling" },
      { type: "feature", text: "SQLite WAL checkpoint on close - data sync safe" },
    ]
  },
  {
    version: "88.12.0",
    date: "Apr 2026",
    title: "v88.12.0 - macOS Compatibility + Cross-Platform DB Fix",
    items: [
      { type: "feature", text: "Electron 36 upgrade - macOS Tahoe (26.x) ab fully supported hai" },
      { type: "fix", text: "Google Drive se existing folder open na hone ka issue fix - WAL/SHM cleanup" },
      { type: "fix", text: "App band hone pai database properly checkpoint hota hai - sync safe" },
    ]
  },
  {
    version: "88.11.0",
    date: "Apr 2026",
    title: "v88.11.0 - macOS Build + Season Persist + ESC Fix",
    items: [
      { type: "feature", text: "macOS Apple Silicon (.dmg) build ab GitHub release mai auto-generate hoga" },
      { type: "feature", text: "macOS mai bhi auto-update kaam karega - Windows jaisa" },
      { type: "fix", text: "Season filter (Kharif/Rabi) ab software restart karne pai bhi yaad rahega" },
      { type: "fix", text: "View dialog ab ESC key se turant band hoga - latak nahi raha" },
    ]
  },
  {
    version: "88.10.0",
    date: "Apr 2026",
    title: "v88.10.0 - PPR View Dialog Upgrade",
    items: [
      { type: "feature", text: "Paddy Purchase Register mai ab row click karo toh seedha View dialog khulega - koi redirect nahi" },
      { type: "feature", text: "PPR mai Eye button bhi hai har row mai - dono tarike se dekh sakte ho" },
      { type: "fix", text: "View dialog ab PPR ke andar hi khulta hai - Mill Entries tab mai jaane ki zaroorat nahi" },
    ]
  },
  {
    version: "88.9.0",
    date: "Apr 2026",
    title: "v88.9.0 - View Dialog + Round-off Fix + Date Format",
    items: [
      { type: "feature", text: "Mill Entries mai View button (Eye icon) - click karo toh poori entry dialog mai dikhegi" },
      { type: "feature", text: "Paddy Purchase Register mai row click karo toh Mill Entries mai redirect hoke View dialog khulega - kisi bhi date ki entry ho" },
      { type: "fix", text: "Round-off ab desktop aur LAN dono mai kaam karega - 4000.51 = 4001, 4000.50 = 4000" },
      { type: "fix", text: "Sabhi Excel aur PDF export mai date DD-MM-YYYY format mai aayegi (pehle YYYY-MM-DD tha)" },
      { type: "feature", text: "Google Drive sync detect - 5 second mai dusre PC ka data auto-reload hoga" },
    ]
  },
  {
    version: "88.8.0",
    date: "Apr 2026",
    title: "v88.8.0 - Rice Stock NaN Fix",
    items: [
      { type: "fix", text: "DC form mai Parboiled/Raw stock NaN fix - desktop aur LAN dono mai sahi dikhega" },
    ]
  },
  {
    version: "88.7.0",
    date: "Apr 2026",
    title: "v88.7.0 - Rice Type Stock + Image Fix",
    items: [
      { type: "feature", text: "DC form mai ab Rice Type wise stock dikhega - Parboiled aur Raw alag alag" },
      { type: "fix", text: "Vehicle Weight image save crash fix (Buffer object handle)" },
    ]
  },
  {
    version: "88.6.0",
    date: "Apr 2026",
    title: "v88.6.0 - Global Round Figure System",
    items: [
      { type: "feature", text: "Poore software mai amount round figure hoga - 2296.51 toh 2297, 2296.50 toh 2296" },
      { type: "fix", text: "Toast ab hamesha dikhega - hover ki zaroorat nahi, side mai upar aayega" },
      { type: "fix", text: "TP duplicate toast mai batayega ki kaun se RST mein hai" },
    ]
  },
  {
    version: "88.5.0",
    date: "Apr 2026",
    title: "v88.5.0 - Duplicate RST/TP Warning + Toast Fix",
    items: [
      { type: "feature", text: "RST ya TP number duplicate dalte hi warning toast aayega - RST #X pehle se entry hai" },
      { type: "feature", text: "TP duplicate mai batayega ki kaun se RST mein entry hai - TP No. X pehle se RST #Y mein entry hai" },
      { type: "feature", text: "RST/TP field pe red border + warning text bhi dikhega form mein" },
      { type: "fix", text: "Toast ab hamesha expand rehega - mouse hover ki zaroorat nahi" },
      { type: "fix", text: "Entry edit karte waqt apni RST/TP duplicate nahi manegi" },
    ]
  },
  {
    version: "88.4.0",
    date: "Apr 2026",
    title: "v88.4.0 - Duplicate RST & TP Block",
    items: [
      { type: "feature", text: "Same RST number se dobara mill entry nahi hogi - duplicate RST block" },
      { type: "feature", text: "Same TP number bhi dobara nahi chalega - error batayega ki ye TP kis RST mai already hai" },
    ]
  },
  {
    version: "88.3.0",
    date: "Apr 2026",
    title: "v88.3.0 - Enter Key Save Fix",
    items: [
      { type: "fix", text: "Auto Vehicle Weight mai Enter-Enter karke Save button tak pohchega ab" },
      { type: "fix", text: "AutoSuggest mai Enter key conflict fix - suggestion select na ho toh next field mai jayega" },
    ]
  },
  {
    version: "88.2.0",
    date: "Apr 2026",
    title: "v88.2.0 - Auto Suggestions Fix",
    items: [
      { type: "fix", text: "Party Name aur Source suggestions ab Vehicle Weight entries se bhi aayenge - bina Mill Entry complete kiye" },
    ]
  },
  {
    version: "88.1.0",
    date: "Apr 2026",
    title: "v88.1.0 - Vehicle Suggestions + Edit Fix",
    items: [
      { type: "fix", text: "Vehicle No. suggestions ab mill entries + vehicle weight dono se aayenge - saare gaadi numbers dikhenge" },
      { type: "fix", text: "Auto Weight Entries edit 'Update error' fix - ab entry edit hoke save hoga" },
      { type: "fix", text: "RST auto-fill se back-date wali date sahi aayegi mill entry mai" },
      { type: "feature", text: "Enter key press karne par next field mai jump karega (Tab jaisa) - poore software mai" },
    ]
  },
  {
    version: "87.5.0",
    date: "Apr 2026",
    title: "v87.5.0 - Weighbridge Fixes + LAN Scale",
    items: [
      { type: "fix", text: "G.Issued aur TP No. ab second weight save par bhi save hoga" },
      { type: "fix", text: "TP No. column ab Completed Entries aur Auto Weight Entries dono tables mai dikhega" },
      { type: "fix", text: "Auto Weight Entries edit mai G.Issued aur TP No. fields add kiye" },
      { type: "fix", text: "Pending count badge ab red mai blink karega jab entries pending hon" },
      { type: "feature", text: "LAN browser mai ab REAL weighbridge weight dikhega (API polling se)" },
      { type: "fix", text: "saveImage crash fix - non-string data (object/null) se crash nahi hoga" },
      { type: "fix", text: "Camera image limit 5MB se 50MB kiya + data:image prefix auto-strip" },
    ]
  },
  {
    version: "86.0.0",
    date: "Feb 2026",
    title: "v86.0.0 - Audit Log (Kisne Kya Kiya)",
    items: [
      { type: "feature", text: "Audit Log - Settings mein naya tab, har change ka record rakhta hai (kisne, kab, kya badla)" },
      { type: "feature", text: "Create/Update/Delete teeno track hote hain - Entries, CashBook, Private Trading, Payments sab mein" },
      { type: "feature", text: "Har record ke paas History icon - click karo toh uss record ki poori history dikhegi" },
      { type: "feature", text: "Filters - user wise, action type wise, date wise audit log dekh sakte ho" },
    ]
  },
  {
    version: "85.0.0",
    date: "Feb 2026",
    title: "v85.0.0 - Users & Permissions",
    items: [
      { type: "feature", text: "Settings mein Users tab - naye users banao, unko role assign karo (Admin/Entry Operator/Accountant/Viewer)" },
      { type: "feature", text: "Granular permissions - Edit, Delete, Export, Payments, CashBook, Reports, Settings access on/off karo" },
      { type: "feature", text: "Staff ko user account se link kar sakte ho" },
      { type: "feature", text: "Permission ke hisaab se tabs show/hide hote hain - sirf wahi dikhega jiska access hai" },
    ]
  },
  {
    version: "84.0.0",
    date: "Feb 2026",
    title: "v84.0.0 - UI Polish",
    items: [
      { type: "fix", text: "Heartbeat popover chota aur sundar kiya - white/dark dono theme mein accha dikhega" },
    ]
  },
  {
    version: "83.0.0",
    date: "Feb 2026",
    title: "v83.0.0 - Multi-User Safety + Heartbeat",
    items: [
      { type: "feature", text: "Optimistic Locking: 2 log ek saath kaam karein toh data corrupt nahi hoga - conflict pe auto-refresh" },
      { type: "feature", text: "Heartbeat Indicator: Header mein heart icon - doosra computer connect ho toh dhadkega, click pe list dikhegi" },
      { type: "feature", text: "LAN Network Access: Same WiFi pe doosre computer ke browser se software khol sakte ho" },
      { type: "feature", text: "Header Cleanup: Password/Logout admin dropdown mein, Print button hataya" },
    ]
  },
  {
    version: "82.0.0",
    date: "Feb 2026",
    title: "v82.0.0 - LAN Network Access",
    items: [
      { type: "feature", text: "Same WiFi/LAN network pe doosre computer se browser mein software khol sakte ho - host computer ka IP use karo (e.g. http://192.168.1.100:9876)" },
      { type: "feature", text: "Ek computer mein software open karo, baaki computers mein browser se kaam karo - bilkul same data dikhega" },
      { type: "feature", text: "LAN pe connected computers ka count dikhega header mein (e.g. '2 Connected')" },
      { type: "feature", text: "Header cleanup - Password Change aur Logout ab admin dropdown mein, Print button hataya" },
    ]
  },
  {
    version: "81.0.0",
    date: "Feb 2026",
    title: "v81.0.0 - FY Auto-Switch",
    items: [
      { type: "feature", text: "April mein app automatically naye FY (2026-2027) pe switch ho jayega - manually change karne ki zaroorat nahi" },
    ]
  },
  {
    version: "80.0.0",
    date: "Feb 2026",
    title: "v80.0.0 - Complete Shared Service Layer + Bug Fixes",
    items: [
      { type: "feature", text: "Staff advance/salary logic centralized in shared service layer" },
      { type: "fix", text: "GET /api/hemali/items 404 fix - endpoint restore kiya" },
      { type: "fix", text: "GET /api/gst-company-settings 404 fix - naya endpoint add kiya" },
      { type: "feature", text: "7 shared modules + 37 route files = 44 files 100% identical between desktop aur local-server" },
    ]
  },
  {
    version: "79.0.0",
    date: "Feb 2026",
    title: "v79.0.0 - Staff Service Shared Layer",
    items: [
      { type: "feature", text: "Staff advance/salary logic ab shared service layer mein - code drift risk zero" },
      { type: "feature", text: "calculateAdvanceBalance, createStaffAdvanceCashEntries, createStaffPaymentCashEntry sab centralized" },
    ]
  },
  {
    version: "78.0.0",
    date: "Feb 2026",
    title: "v78.0.0 - Quick Search + Shared Service Layer",
    items: [
      { type: "feature", text: "Quick Search (Ctrl+K) - Sabhi data mein instantly search karo - Entries, Cash Book, Vouchers, Staff, Diesel, Milling sab" },
      { type: "feature", text: "Search results grouped by category dikhte hain with preview panel" },
      { type: "feature", text: "Click se direct tab pe navigate aur Eye icon se quick view" },
      { type: "feature", text: "Shared Service Layer - Payment logic ab centralized hai, desktop aur local-server dono sync mein" },
      { type: "fix", text: "Desktop app dbEngine scope bug fix - storage engine API ab sahi kaam karega" },
      { type: "fix", text: "Hemali integrity check col() function bug fix" },
    ]
  },
  {
    version: "77.0.0",
    date: "Feb 2026",
    title: "v77.0.0 - Image Auto-Cleanup Fix",
    items: [
      { type: "fix", text: "Image Auto-Cleanup 'Abhi Clean Karo' button ab sahi se kaam karega - pehle days save hoga phir cleanup chalega" },
    ]
  },
  {
    version: "76.0.0",
    date: "Feb 2026",
    title: "v76.0.0 - Camera Quality + Performance",
    items: [
      { type: "feature", text: "Camera photo quality improved - 1080p Full HD capture (pehle 480p tha)" },
      { type: "feature", text: "Snapshot capture async - software freeze nahi hoga photo lete waqt" },
      { type: "fix", text: "Canvas memory auto-cleanup - RAM free hota hai capture ke baad" },
      { type: "fix", text: "MJPEG async decoding - live feed smooth rahega" },
    ]
  },
  {
    version: "75.0.0",
    date: "Feb 2026",
    title: "v75.0.0 - App.js Refactoring Complete",
    items: [
      { type: "feature", text: "App.js se 5 components extract kiye - MillEntryForm, EntryTable, TabNavigation, FilterPanel, HeaderDialogs" },
      { type: "feature", text: "App.js 2504 se 1429 lines pe aaya (43% reduction)" },
      { type: "fix", text: "Unused imports aur code cleanup - faster load time" },
    ]
  },
  {
    version: "74.0.0",
    date: "Apr 2026",
    title: "v74.0.0 - Date Format DD-MM-YYYY + Code Refactor",
    items: [
      { type: "feature", text: "Sab jagah date DD-MM-YYYY format mein dikhega (PDFs, Excel, UI)" },
      { type: "feature", text: "Session Indicator - doosre computer pe software active hai toh badge dikhega" },
      { type: "fix", text: "Local Server aur Desktop App ke routes 100% sync kiye" },
      { type: "fix", text: "Code refactor - duplicate code hataya, shared utilities banaye" },
    ]
  },
  {
    version: "73.0.0",
    date: "Apr 2026",
    title: "v73.0.0 - Remark View + Dialog Warnings Fix",
    items: [
      { type: "fix", text: "Auto Weight Entries - View mein Remark / टिप्पणी field ab dikhega" },
      { type: "fix", text: "Console errors fix - DialogTitle missing warnings sab Dialogs se hata diye" },
    ]
  },
  {
    version: "72.0.0",
    date: "Apr 2026",
    title: "v72.0.0 - RST Auto-Increment Fix + Photo ESC",
    items: [
      { type: "fix", text: "RST number ab sahi se auto-increment hota hai - pehle hamesha 1 dikhata tha" },
      { type: "fix", text: "Photo zoom ab ESC key se band hota hai" },
      { type: "fix", text: "What's New mein sirf last 5 updates dikhenge" },
    ]
  },
  {
    version: "70.0.0",
    date: "Apr 2026",
    title: "v70.0.0 - G.Issued Field + Source Label",
    items: [
      { type: "new", text: "G.Issued column added - Vehicle Weight form, table, view, PDF, print, Excel sab jagah" },
      { type: "fix", text: "Farmer → Source rename - view modal, PDF slip, HTML print, WhatsApp, Excel sab jagah" },
      { type: "fix", text: "PDF slip proper bordered table with cell borders - view modal jaisa exact design" },
    ]
  },
  {
    version: "69.0.0",
    date: "Apr 2026",
    title: "v69.0.0 - Camera Image Fix + FY Carry Forward",
    items: [
      { type: "fix", text: "Camera images ab sahi se save ho rahi hain - pehle async captureFrame await nahi hota tha" },
      { type: "fix", text: "WhatsApp auto-notify mein ab individual numbers ko bhi camera images jaayengi" },
      { type: "fix", text: "View Entry modal mein ab camera photos dikhenge (agar capture hue ho)" },
      { type: "new", text: "FY Carry Forward ab Desktop aur Local-Server dono mein kaam karega" },
    ]
  },
  {
    version: "68.0.0",
    date: "Apr 2026",
    title: "v68.0.0 - Entry Save + Tick Mark Fix",
    items: [
      { type: "fix", text: "Entry form ab filter ki kms_year match karta hai - entries sahi FY mein jaayengi" },
      { type: "fix", text: "Auto Weight Entries mein tick mark ab sahi se dikhega jab Mill Entry bane" },
    ]
  },
  {
    version: "65.0.0",
    date: "Apr 2026",
    title: "v65.0.0 - FFmpeg 6.0 Compatibility Fix",
    items: [
      { type: "fix", text: "FFmpeg 6.0 mein -stimeout hata di gayi thi - ab -timeout use hota hai" },
      { type: "fix", text: "Yahi wajah thi camera stream nahi chal raha tha!" },
    ]
  },
  {
    version: "64.0.0",
    date: "Apr 2026",
    title: "v64.0.0 - RTSP Deep Diagnostic Tool",
    items: [
      { type: "new", text: "Test RTSP Stream button - ffmpeg ke saath actual RTSP stream test karo aur exact error dekho" },
      { type: "fix", text: "TCP aur UDP dono automatically try hote hain - jo bhi chale woh use hoga" },
      { type: "fix", text: "ffmpeg ka stderr output ab screen par dikhega - exact wajah pata chalegi" },
    ]
  },
  {
    version: "63.0.0",
    date: "Apr 2026",
    title: "v63.0.0 - RTSP Stream Fix (@ in Password)",
    items: [
      { type: "fix", text: "Password mein @ hone par RTSP stream fail hota tha - ab raw URL ffmpeg ko diya jaata hai (VLC jaisa)" },
      { type: "fix", text: "Fake snapshot reject: 521 bytes wala response ab valid nahi maana jaayega (min 2KB + JPEG check)" },
      { type: "fix", text: "Better ffmpeg error logging: stderr output ab console mein dikhega debugging ke liye" },
    ]
  },
  {
    version: "62.0.0",
    date: "Apr 2026",
    title: "v62.0.0 - FFmpeg Auto-Bundle + Syntax Crash Fix",
    items: [
      { type: "fix", text: "FFmpeg ab software ke andar bundle hota hai - alag se install karne ki zarurat nahi" },
      { type: "fix", text: "Camera RTSP stream ab packaged .exe build mein kaam karega" },
      { type: "fix", text: "Smart FFmpeg path detection: extraResources > ffmpeg-static > system PATH" },
      { type: "fix", text: "SyntaxError crash fix: Sab route files se bare catch blocks hata diye (Electron compatibility)" },
      { type: "fix", text: "Diagnose mein ffmpeg path info dikhai degi debugging ke liye" },
    ]
  },
  {
    version: "60.0.0",
    date: "Apr 2026",
    title: "v60.0.0 - Discovery Timeout + Stability",
    items: [
      { type: "fix", text: "VIGI Discovery ab max 12 second mein complete hoga - app hang nahi hoga" },
      { type: "fix", text: "Electron self-signed certificate bypass for VIGI cameras" },
      { type: "fix", text: "JPEG validation: Sirf valid images accept, fake responses reject" },
    ]
  },
  {
    version: "59.0.0",
    date: "Apr 2026",
    title: "v59.0.0 - Cert Fix + JPEG Validation",
    items: [
      { type: "fix", text: "Electron ab self-signed HTTPS certificates accept karta hai (VIGI camera ke liye zaroori)" },
      { type: "fix", text: "JPEG magic byte validation: Ab sirf real images accept hoti hain, HTML error pages reject" },
      { type: "fix", text: "Minimum snapshot size 2KB: Fake 521-byte responses ab ignore honge" },
      { type: "fix", text: "Better error logging: Camera ka actual response hex mein log hota hai debugging ke liye" },
    ]
  },
  {
    version: "58.0.0",
    date: "Apr 2026",
    title: "v58.0.0 - VIGI OpenAPI Port Fix",
    items: [
      { type: "fix", text: "CRITICAL: VIGI camera ab OpenAPI port 20443 pe snapshot le sakta hai - pehle sirf standard ports (80/443) try hote the" },
      { type: "new", text: "OpenAPI Port field add kiya VIGI Settings mein - camera ki settings se port number daalo" },
      { type: "new", text: "Smart Endpoint Discovery: 20443 → 8443 → 8800 → standard ports automatically try hote hain" },
      { type: "fix", text: "Endpoint cache: Ek baar sahi port mila toh repeat nahi karta - fast streaming" },
    ]
  },
  {
    version: "57.0.0",
    date: "Mar 2026",
    title: "v57.0.0 - VIGI HTTPS Fix + Protocol Cache",
    items: [
      { type: "fix", text: "CRITICAL: VIGI camera ab HTTPS pe kaam karta hai - pehle sirf HTTP try hota tha jo fail hota tha" },
      { type: "fix", text: "Protocol Cache: Ek baar HTTPS kaam kiya toh baaki frames direct HTTPS pe - no retry delay" },
      { type: "fix", text: "Timeout 15s se 5s kiya - faster fallback agar ek protocol fail ho" },
    ]
  },
  {
    version: "56.0.0",
    date: "Mar 2026",
    title: "v56.0.0 - Camera Fix + Diagnostics Tool",
    items: [
      { type: "fix", text: "CRITICAL: Camera module crash fix - camera_proxy.js mein syntax error tha jisse KOI BHI camera route kaam nahi karta tha (stream, snapshot, kill-all sab 404 deta tha)" },
      { type: "new", text: "Camera Diagnose: IP Camera settings mein 'Diagnose Camera' button - network check, port scan, ffmpeg check, snapshot test sab ek click mein" },
      { type: "new", text: "VIGI Diagnose: VIGI NVR settings mein 'Diagnose' button - TCP port scan, HTTP access, Digest Auth check, snapshot path discovery" },
      { type: "fix", text: "Hindi diagnosis messages - 'Network nahi mil raha', 'Password galat hai', 'Camera chal raha hai' jaise clear messages" },
    ]
  },
  {
    version: "55.43.0",
    date: "Mar 2026",
    title: "v55.43.0 - Critical Bug Fix + Branding Exports",
    items: [
      { type: "fix", text: "CRITICAL: Desktop app crash fix - Vehicle Weight, Dashboard, Payments, Exports sab kaam kar rahe hain" },
      { type: "fix", text: "CRITICAL: vw_images folder permission error fix - ab Program Files mai bhi crash nahi hoga" },
      { type: "new", text: "Custom Branding: Settings mai add kiye gaye custom fields (jaise 'ॐ अर्हं नमः', GST) ab Vehicle Weight Print Slip, PDF, Excel sab mai dikhte hain" },
      { type: "fix", text: "Branding fix teeno backends mai - Web, Desktop, Local Server sab sync" },
    ]
  },
  {
    version: "55.42.0",
    date: "Mar 2026",
    title: "v55.42.0 - Smart Filters + Auto Weight Entries + Bags",
    items: [
      { type: "new", text: "Default Today: Mill Entries, Cash Book, Vehicle Weight ab sirf aaj ka data load karte hain - software faster" },
      { type: "new", text: "Auto Weight Entries: Naya subtab - last 7 din ka VW data, 150/page, filters, Excel/PDF export" },
      { type: "new", text: "Pending Badge: Auto Weight Entries tab par red badge dikhata hai kitne VW entries ki Mill Entry pending hai" },
      { type: "new", text: "VW Filters: RST, Date, Vehicle, Party, Mandi se filter karein + Excel/PDF export" },
      { type: "new", text: "Photo Zoom: Photo View dialog mai photo click karke bada photo dekhein" },
      { type: "new", text: "Photo View redesigned - Print Slip jaisa layout with colored weight bars" },
      { type: "fix", text: "Pkts → Bags: Har jagah Bags dikhai deta hai - table, export, WhatsApp, Telegram, print slip" },
      { type: "fix", text: "RST Auto-fill: Bags (tot_pkts) ab bhi Mill Entry form mai auto-fill hota hai" },
      { type: "fix", text: "Linked entries: Mill Entry banne ke baad VW mai Edit + Delete hat ke green tick aata hai" },
    ]
  },
  {
    version: "55.41.0",
    date: "Mar 2026",
    title: "v55.41.0 - Server-Side Pagination (50k Ready)",
    items: [
      { type: "new", text: "Server-side pagination - Mill Entries, Cash Book, Vehicle Weight tables ab 50k+ entries handle kar sakte hain" },
      { type: "new", text: "Page numbers neeche dikhenge (1-200 per page, Next/Prev/First/Last buttons)" },
      { type: "fix", text: "Database queries optimized - sirf current page ka data load hota hai, poora nahi" },
      { type: "fix", text: "Teeno backends (Web, Desktop, Local) mai pagination sync hai" },
    ]
  },
  {
    version: "55.40.0",
    date: "Mar 2026",
    title: "v55.40.0 - Photo View + VW Group + Scalability",
    items: [
      { type: "new", text: "Photo View: Eye icon se entry ki camera photos + saari details dekhein" },
      { type: "new", text: "VW ke liye alag WhatsApp Group aur Telegram Chat IDs set karein Settings mai" },
      { type: "new", text: "WhatsApp mai ab photo bhi jayega media_url se" },
      { type: "new", text: "Table mai Mandi column add hua" },
      { type: "fix", text: "MongoDB indexes - 50k entries par bhi fast queries" },
      { type: "fix", text: "Desktop JSON compact save - 40% smaller file, faster writes" },
    ]
  },
  {
    version: "55.39.0",
    date: "Mar 2026",
    title: "v55.39.0 - Dual Photo WhatsApp + Performance Fix",
    items: [
      { type: "new", text: "1st Weight aur 2nd Weight dono ka photo ab WhatsApp/Telegram mai jayega" },
      { type: "fix", text: "Tab switch karne par software hang fix - AbortController se fast response" },
      { type: "fix", text: "Camera feed cleanup - tab change par MJPEG stream band hota hai" },
      { type: "fix", text: "Desktop + Local Server image save/load parity - teeno backends sync" },
    ]
  },
  {
    version: "55.38.0",
    date: "Mar 2026",
    title: "v55.38.0 - Camera Auto-Start + Download Fix",
    items: [
      { type: "fix", text: "IP Camera ab Auto Vehicle Weight page par auto-start hoga - Start click nahi karna" },
      { type: "fix", text: "Download Slip mai sirf 1 copy (Party Copy) aayegi" },
    ]
  },
  {
    version: "55.37.0",
    date: "Mar 2026",
    title: "v55.37.0 - RTSP Camera + Delete Dialog + WhatsApp Format",
    items: [
      { type: "new", text: "RTSP IP Camera support - ffmpeg bundled, alag install nahi karna" },
      { type: "new", text: "Camera proxy - RTSP stream browser mai VLC jaisa dikhega" },
      { type: "fix", text: "Delete confirmation dialog - ab UI freeze nahi hoga" },
      { type: "fix", text: "WhatsApp message format - RST#, Date, Farmer, separators, Rs symbol" },
    ]
  },
  {
    version: "55.36.0",
    date: "Mar 2026",
    title: "v55.36.0 - IP Camera + PDF Fix + WhatsApp Fix",
    items: [
      { type: "new", text: "IP Camera support - Settings > Camera mai ab IP camera URL se connect karo" },
      { type: "fix", text: "Download Slip PDF fix - ulta layout theek kiya, dono copies + signatures" },
      { type: "fix", text: "WhatsApp toggle OFF fix - ab OFF karne par sahi save hota hai" },
      { type: "fix", text: "PDF fonts bade kiye, gaps improve kiye, Hindi labels add kiye" },
    ]
  },
  {
    version: "55.35.0",
    date: "Mar 2026",
    title: "v55.35.0 - A5 Print Fix + Settings Tab Fix",
    items: [
      { type: "fix", text: "Weight Slip A5 size perfect fit - fonts bade kiye, signature gap hataya" },
      { type: "fix", text: "Settings tabs ek line mai - Error Log tab ab wrap nahi hota" },
    ]
  },
  {
    version: "55.34.0",
    date: "Mar 2026",
    title: "v55.34.0 - Settings Restructure + Camera Setup",
    items: [
      { type: "new", text: "Camera Setup sub-tab - Front aur Side camera select + preview" },
      { type: "new", text: "Weighbridge Configuration ab alag sub-tab mai" },
      { type: "new", text: "Error Log ab alag sub-tab mai" },
    ]
  },
  {
    version: "55.33.0",
    date: "Mar 2026",
    title: "v55.33.0 - Toggle Double-Click Bug Fix",
    items: [
      { type: "fix", text: "WhatsApp/Telegram/VW Messaging toggles ab ek click mai sahi kaam karte hain (double-fire fix)" },
      { type: "fix", text: "WhatsApp toggle save ke baad re-fetch race condition fix" },
    ]
  },
  {
    version: "55.32.0",
    date: "Mar 2026",
    title: "v55.32.0 - Camera Zoom Popup",
    items: [
      { type: "new", text: "Camera click karo toh bada popup khulta hai - full screen live view" },
      { type: "new", text: "ESC ya bahar click karne se popup band ho jata hai" },
    ]
  },
  {
    version: "55.31.0",
    date: "Mar 2026",
    title: "v55.31.0 - Camera Layout Update",
    items: [
      { type: "new", text: "Cameras ab vertical stack - Front View upar, Side View niche, full width" },
    ]
  },
  {
    version: "55.30.0",
    date: "Mar 2026",
    title: "v55.30.0 - Vehicle No Field Fix",
    items: [
      { type: "fix", text: "Vehicle No field position fix - Date ke saath proper alignment" },
      { type: "fix", text: "AutoSuggest component white theme support - label aur input consistent" },
    ]
  },
  {
    version: "55.29.0",
    date: "Mar 2026",
    title: "v55.29.0 - WhatsApp + Weighbridge Toggle Fix",
    items: [
      { type: "fix", text: "WhatsApp toggle OFF/ON ab auto-save hota hai - alag se Save button dabane ki zarurat nahi" },
      { type: "fix", text: "Weighbridge toggle disable ab properly persist hota hai" },
      { type: "fix", text: "WhatsApp Group dropdown Desktop App mai ab load hota hai" },
    ]
  },
  {
    version: "55.28.0",
    date: "Mar 2026",
    title: "v55.28.0 - Weighbridge Toggle Fix",
    items: [
      { type: "fix", text: "Weighbridge disable karne par ab properly save hota hai - toggle change par auto-save" },
    ]
  },
  {
    version: "55.27.0",
    date: "Mar 2026",
    title: "v55.27.0 - WhatsApp Group Fix",
    items: [
      { type: "fix", text: "Desktop App mai WhatsApp Groups ab load ho rahe hain - /api/whatsapp/groups endpoint add kiya" },
      { type: "fix", text: "WhatsApp Group send endpoint (/api/whatsapp/send-group) Desktop mai add kiya" },
      { type: "fix", text: "Settings save mai group fields (default_group_id, schedule) ab properly save hote hain" },
    ]
  },
  {
    version: "55.26.0",
    date: "Mar 2026",
    title: "v55.26.0 - RST Duplicate Check + Download Fix",
    items: [
      { type: "fix", text: "Duplicate RST number check - agar RST pehle se hai toh error dikhata hai" },
      { type: "fix", text: "Download weight slip mai ab sirf Party Copy aayegi (2 copy sirf print mai)" },
      { type: "fix", text: "WhatsApp/Group icons ab setting OFF hone par hide ho jaate hain" },
    ]
  },
  {
    version: "55.25.0",
    date: "Mar 2026",
    title: "v55.25.0 - A5 Weight Slip Redesign",
    items: [
      { type: "new", text: "A5 paper perfect fit - 2 copies (Party + Customer) properly sized for half A4 paper" },
      { type: "new", text: "Weight boxes (Gross/Tare/Net/Cash/Diesel) ek hi row mai compact layout" },
      { type: "new", text: "PDF download bhi 2 copies (Party + Customer) with cut line" },
    ]
  },
  {
    version: "55.24.0",
    date: "Mar 2026",
    title: "v55.24.0 - Desktop Fix + Route Sync CI/CD",
    items: [
      { type: "fix", text: "Desktop App 'Data fetch error' fix - Vehicle Weight JS routes bana diye desktop-app aur local-server dono mai" },
      { type: "new", text: "Route Sync Checker script (scripts/sync_check.py) - Python vs JS endpoint parity auto-detect" },
      { type: "new", text: "GitHub Actions CI/CD - har push par route sync check, PR mai auto comment agar endpoint missing ho" },
    ]
  },
  {
    version: "55.23.0",
    date: "Mar 2026",
    title: "v55.23.0 - Real Weighbridge + Edit + Print + Auto Messaging",
    items: [
      { type: "new", text: "Electron Serial Port - Real weighbridge hardware (Keshav Computer) COM4, 2400 baud" },
      { type: "new", text: "Settings mai Weighbridge Configuration - COM Port, Baud Rate, Auto Connect" },
      { type: "new", text: "Edit button - Vehicle, Party, Product, Pkts, Cash, Diesel edit kar sakte hai" },
      { type: "new", text: "A5 Print - 2 copies: Party Copy + Customer Copy (Driver/Authorized Signature)" },
      { type: "new", text: "Auto Messaging - Weight complete hote hi WhatsApp + Telegram auto message + camera photos" },
      { type: "new", text: "Settings ON/OFF toggle for Auto Vehicle Weight Messaging" },
      { type: "new", text: "Manual WA/Group - Complete text (RST, Vehicle, Party, Gross/Tare/Net, Cash, Diesel) + camera photos, no PDF" },
      { type: "new", text: "2 Cameras - Front View + Side View" },
      { type: "new", text: "White theme - poora Auto Vehicle Weight page white theme match karta hai" },
      { type: "new", text: "Vehicle No AutoSuggest - pehle use kiye hue vehicles suggest hote hai" },
      { type: "new", text: "RST number editable + auto-fill, Delete option pending list mai" },
      { type: "new", text: "Scale auto-connect - Simulate button hataya, weight stable hone par STABLE badge" },
      { type: "fix", text: "Cash/Diesel second weight capture mai save hota hai ab" },
      { type: "fix", text: "Vehicle Weight se truck payment/cash nahi banta - sirf Entries se save karne par" },
    ]
  },
  {
    version: "55.18.0",
    date: "Mar 2026",
    title: "v55.18.0 - Weight Slip PDF + Cash/Diesel",
    items: [
      { type: "new", text: "Cash Paid aur Diesel Paid fields Vehicle Weight mein + Entries auto-fill" },
      { type: "new", text: "Weight Slip PDF sunder: Company header, Gross/Tare/Net, Cash/Diesel section" },
      { type: "fix", text: "PDF se duplicate First/Second rows hataye - sirf Gross, Tare, Net dikhta hai" },
    ]
  },
  {
    version: "55.17.0",
    date: "Mar 2026",
    title: "v55.17.0 - RST Net Weight Auto-fill",
    items: [
      { type: "new", text: "Entries mai RST No. dalte hi Net Weight (KG) b auto aata hai Vehicle Weight se" },
    ]
  },
  {
    version: "55.16.0",
    date: "Mar 2026",
    title: "v55.16.0 - Auto Vehicle Weight AutoSuggest",
    items: [
      { type: "new", text: "Party Name aur Mandi mai AutoSuggest - entries jaisa system, pehle dala hua automatic ata hai" },
      { type: "new", text: "Party select karne par uski mandis automatic aati hain" },
      { type: "new", text: "GOVT PADDY par targets se mandi auto-fill" },
    ]
  },
  {
    version: "55.15.0",
    date: "Mar 2026",
    title: "v55.15.0 - GOVT PADDY Default + Target Auto-fill",
    items: [
      { type: "new", text: "GOVT PADDY default product in Auto Vehicle Weight" },
      { type: "new", text: "GOVT PADDY select karne par Party aur Mandi targets se auto-fill / dropdown" },
      { type: "new", text: "Second Weight dialog mein Live Scale + Auto Capture button" },
    ]
  },
  {
    version: "55.14.0",
    date: "Mar 2026",
    title: "v55.14.0 - Second Weight Auto Capture",
    items: [
      { type: "new", text: "Second Weight dialog mein Live Scale display + Auto Capture button" },
      { type: "fix", text: "Pending Vehicle List compact kiya - columns thoda tight" },
    ]
  },
  {
    version: "55.13.0",
    date: "Mar 2026",
    title: "v55.13.0 - Auto Vehicle Weight UI Redesign",
    items: [
      { type: "new", text: "Auto Vehicle Weight page sunder banaya - 3-column layout (Form | Scale+Camera | Pending List)" },
      { type: "new", text: "Pending Vehicle List: RST No, Date, Vehicle, 1st Wt, Party Name, Product, Action columns" },
      { type: "new", text: "Digital weighbridge display with glow effects" },
    ]
  },
  {
    version: "55.12.0",
    date: "Mar 2026",
    title: "v55.12.0 - Auto Vehicle Weight Redesign",
    items: [
      { type: "new", text: "Vehicle Weight ka naam 'Auto Vehicle Weight' kiya" },
      { type: "new", text: "Keshav Computer jaisa layout: Left (Entry Form + Camera + Scale) | Right (Pending Vehicle List table)" },
      { type: "new", text: "Completed entries alag section mein Show/Hide toggle ke saath" },
    ]
  },
  {
    version: "55.11.0",
    date: "Mar 2026",
    title: "v55.11.0 - Vehicle Weight Sub-tab",
    items: [
      { type: "new", text: "Vehicle Weight ab Entries ke andar sub-tab mein hai (Mill Entries | Vehicle Weight)" },
    ]
  },
  {
    version: "55.10.0",
    date: "Mar 2026",
    title: "v55.10.0 - VW RST Auto-fill + Govt Paddy",
    items: [
      { type: "new", text: "Entries: RST No. dalte hi Vehicle Weight se auto-fill (Truck, Agent, Mandi)" },
      { type: "new", text: "Vehicle Weight: GOVT PADDY option add kiya Product dropdown mein" },
    ]
  },
  {
    version: "55.9.0",
    date: "Mar 2026",
    title: "v55.9.0 - Desktop Export Fix",
    items: [
      { type: "fix", text: "Desktop app PDF/Excel se Cash aur Diesel columns hataye (pehle sirf web fix tha)" },
      { type: "fix", text: "Excel header 'NAVKAR AGRO' cut hone ka issue fix - wrapText enable kiya" },
    ]
  },
  {
    version: "55.8.0",
    date: "Mar 2026",
    title: "v55.8.0 - Entries Export Cleanup",
    items: [
      { type: "fix", text: "Entries Excel/PDF se Cash aur Diesel columns hataye" },
    ]
  },
  {
    version: "55.7.0",
    date: "Mar 2026",
    title: "v55.7.0 - WhatsApp/Telegram ON/OFF in Settings",
    items: [
      { type: "new", text: "Settings mein WhatsApp aur Telegram ka ON/OFF toggle switch - card header mein" },
      { type: "fix", text: "OFF karo aur Save karo → sab jagah se buttons chhup jayenge, ON karo → dikhenge" },
    ]
  },
  {
    version: "55.6.0",
    date: "Mar 2026",
    title: "v55.6.0 - Entries Page Messaging + Footer Fix",
    items: [
      { type: "new", text: "Entries page par WhatsApp, Group aur Telegram buttons - filter ke hisab se PDF attach hota hai" },
      { type: "fix", text: "Footer se formula (1 Quintal = 100 KG) hataya" },
      { type: "new", text: "Telegram: Generic send-custom endpoint - koi bhi PDF Telegram pe bhejo" },
    ]
  },
  {
    version: "55.5.0",
    date: "Mar 2026",
    title: "v55.5.0 - WhatsApp/Telegram ON/OFF Toggle",
    items: [
      { type: "new", text: "WhatsApp OFF karo toh sab WhatsApp + Group buttons chhup jayenge, ON karo toh dikhenge" },
      { type: "new", text: "Telegram OFF karo toh Telegram button bhi chhup jayega" },
      { type: "fix", text: "Settings save karte hi turant sab pages update ho jate hain" },
    ]
  },
  {
    version: "55.4.0",
    date: "Mar 2026",
    title: "v55.4.0 - Auto Daily Report to Group",
    items: [
      { type: "new", text: "WhatsApp Group mein roz automatic daily report - time set karo aur ON karo" },
      { type: "fix", text: "Purana 'Daily Report Group ID' field hataya - ab sirf Default Group dropdown se kaam hoga" },
    ]
  },
  {
    version: "55.3.0",
    date: "Mar 2026",
    title: "v55.3.0 - Default Group Auto-Select",
    items: [
      { type: "new", text: "Settings mein Default WhatsApp Group select karo - har jagah auto-select hoga" },
      { type: "new", text: "Send to Group dialog ab default group automatically dikhata hai" },
    ]
  },
  {
    version: "55.2.0",
    date: "Mar 2026",
    title: "v55.2.0 - WhatsApp Group Send",
    items: [
      { type: "new", text: "Har report/ledger par 'Group' button - WhatsApp group mein directly bhejein" },
      { type: "new", text: "Group select karne ka dialog - sabhi groups ki list aati hai" },
      { type: "fix", text: "WhatsApp Group API fix - ab sahi 360Messenger sendGroup endpoint use hota hai" },
    ]
  },
  {
    version: "55.1.0",
    date: "Mar 2026",
    title: "v55.1.0 - Beautiful Balance Sheet PDF",
    items: [
      { type: "new", text: "Balance Sheet PDF redesign - professional layout with color-coded sections" },
      { type: "fix", text: "FY Summary + Balance Sheet PDF 500 error fix (duplicate stream conflict)" },
    ]
  },
  {
    version: "55.0.0",
    date: "Mar 2026",
    title: "v55.0.0 - All PDF Exports Fixed",
    items: [
      { type: "fix", text: "FY Summary PDF 500 error fix - duplicate stream handler hataya" },
      { type: "fix", text: "Balance Sheet PDF 500 error fix - same issue" },
      { type: "fix", text: "Cash Book, Sale Book, FY Summary, Balance Sheet - sab PDF sahi download hote hain ab" },
    ]
  },
  {
    version: "54.9.0",
    date: "Feb 2026",
    title: "v54.9.0 - All Downloads Fixed + WhatsApp PDF Match",
    items: [
      { type: "fix", text: "FY Summary, Balance Sheet, Leased Truck, Sale Invoice, Purchase Invoice - sab PDF/Excel ab sahi download hota hai" },
      { type: "fix", text: "Sabhi window.open downloads hatake IPC downloadFile se replace kiya" },
      { type: "fix", text: "WhatsApp Cash Book PDF ab direct download jaisa same design aata hai" },
    ]
  },
  {
    version: "54.6.0",
    date: "29 Mar 2026",
    title: "v54.6.0 - Complete PDF Import Fix (All Routes)",
    items: [
      { type: "fix", text: "Hemali, Mill Parts, Season PnL, Staff, CashBook, Exports, Purchase Vouchers, Reports PnL - sab PDF routes fix" },
      { type: "fix", text: "EVERY route file scanned: zero missing function imports across Desktop + Local Server" },
    ]
  },
  {
    version: "54.5.0",
    date: "29 Mar 2026",
    title: "v54.5.0 - Server 500 Error Fix (PDF Routes)",
    items: [
      { type: "fix", text: "Entries PDF, CashBook PDF, Dashboard PDF, Season PnL PDF, Purchase Vouchers PDF, Staff PDF - sab 500 error fix kiya" },
      { type: "fix", text: "Root cause: Missing function imports (addTotalsRow, addSectionTitle, fmtAmt, addSummaryBox) in Desktop/Local routes" },
      { type: "fix", text: "__addPdfHeader typo fix (cashbook.js)" },
      { type: "fix", text: "_addTbl → addPdfTable fix (exports.js)" },
    ]
  },
  {
    version: "54.4.0",
    date: "29 Mar 2026",
    title: "v54.4.0 - Electron Net Module Download",
    items: [
      { type: "fix", text: "Download: Electron net.request (Chromium stack) use kiya - http.get replace kiya jo empty response de raha tha" },
      { type: "fix", text: "Timeout 120s, status code check, detailed logging" },
    ]
  },
  {
    version: "54.3.0",
    date: "29 Mar 2026",
    title: "v54.3.0 - Download Robust Fallback",
    items: [
      { type: "fix", text: "IPC fail hone par window.open fallback guaranteed kaam karega" },
      { type: "fix", text: "Console logging added for debugging download issues" },
    ]
  },
  {
    version: "54.2.0",
    date: "29 Mar 2026",
    title: "v54.2.0 - Direct Server Fetch Download",
    items: [
      { type: "fix", text: "PDF/Excel download: Main process directly server se fetch karke disk par save karta hai - binary data IPC se nahi jaata" },
      { type: "fix", text: "Save dialog guaranteed dikhega aur file valid hogi" },
    ]
  },
  {
    version: "54.1.0",
    date: "29 Mar 2026",
    title: "v54.1.0 - IPC Direct File Save",
    items: [
      { type: "fix", text: "PDF/Excel download ab IPC se directly disk par write hota hai - no more corrupt files" },
      { type: "fix", text: "WhatsApp Party Ledger PDF ab internally generate hota hai (same as download)" },
    ]
  },
  {
    version: "54.0.0",
    date: "29 Mar 2026",
    title: "v54.0.0 - Download & WhatsApp Major Fix",
    items: [
      { type: "fix", text: "Sabhi pages ka PDF/Excel download ab Electron desktop mein sahi save hoga (native save dialog)" },
      { type: "fix", text: "WhatsApp Party Ledger PDF ab download wali PDF jaisi hi hogi (internal generation)" },
      { type: "fix", text: "WhatsApp PDF link HTTPS fix" },
      { type: "imp", text: "8+ components ke download logic ko centralized downloadFile() utility pe migrate kiya" },
    ]
  },
  {
    version: "53.6.0",
    date: "29 Mar 2026",
    title: "v53.6.0 - WhatsApp PDF Parity Fix",
    items: [
      { type: "fix", text: "Party Ledger WhatsApp PDF ab download wali PDF se exactly same hoga" },
      { type: "imp", text: "Python backend mein bhi tmpfiles.org PDF upload add kiya (party ledger)" },
    ]
  },
  {
    version: "53.5.0",
    date: "29 Mar 2026",
    title: "v53.5.0 - PDF Save Fix (Electron)",
    items: [
      { type: "fix", text: "PDF/Excel download ab Electron mein sahi se save hoga" },
      { type: "fix", text: "Cash Book export fix - downloadFile utility se sahi download" },
      { type: "fix", text: "Sabhi components mein blob revoke delay fix (30s timeout)" },
      { type: "fix", text: "24 addPdfHeader calls restore - PDF mein company header wapas aayega" },
    ]
  },
  {
    version: "53.4.0",
    date: "29 Mar 2026",
    title: "v53.4.0 - PDF Fix",
    items: [
      { type: "fix", text: "PDF download ab sahi hoga - Content-Type header add kiya 84 routes mein" },
      { type: "fix", text: "PDF mein company header ab dikhega - 24 addPdfHeader calls restore kiye" },
      { type: "fix", text: "Daily Report PDF gap fix - sections ab tightly fit honge" },
    ]
  },
  {
    version: "53.3.0",
    date: "29 Mar 2026",
    title: "v53.3.0 - Daily Report Gap Fix",
    items: [
      { type: "fix", text: "Daily Report PDF mein bada gap fix kiya - ab sections tightly fit honge" },
      { type: "fix", text: "Detail mode Excel mein title ab 20 columns merge hoga (pehle sirf 6 tha)" },
    ]
  },
  {
    version: "53.2.0",
    date: "29 Mar 2026",
    title: "v53.2.0 - safePdfPipe Import Fix",
    items: [
      { type: "fix", text: "Daily Report PDF download fix - safePdfPipe import sahi jagah move kiya" },
      { type: "fix", text: "Sabhi route files mein import order fix - koi ReferenceError nahi aayega" },
    ]
  },
  {
    version: "53.1.0",
    date: "29 Mar 2026",
    title: "v53.1.0 - Desktop PDF & Route Fix",
    items: [
      { type: "fix", text: "PDF download ab sahi hoga - .json ki jagah .pdf/.xlsx milega" },
      { type: "fix", text: "Cash Book, Diesel, Staff, Hemali, Reports sab routes fix" },
      { type: "fix", text: "156 corrupted headers + 446 async routes fix kiye" },
    ]
  },
  {
    version: "53.0.0",
    date: "29 Mar 2026",
    title: "v53.0.0 - Settings Page Organized",
    items: [
      { type: "imp", text: "Settings page ab 5 sub-tabs mein organized hai: Branding, GST, Stock, Messaging, Data" },
      { type: "imp", text: "App.js 3477 lines se ~2340 lines - faster load aur clean code" },
      { type: "imp", text: "Har setting apne tab mein - zyada easy navigation" },
    ]
  },
  {
    version: "52.0.0",
    date: "29 Mar 2026",
    title: "v52.0.0 - GST Sale Voucher + WhatsApp + Professional PDF",
    items: [
      { type: "new", text: "Sale Voucher mein per-item GST% (5/12/18/28) aur HSN Code auto-fill" },
      { type: "new", text: "CGST+SGST ya IGST select karo, Buyer GSTIN & Address field" },
      { type: "new", text: "WhatsApp se direct Tax Invoice PDF bhejo (green send icon)" },
      { type: "new", text: "GST Summary - HSN-wise CGST/SGST/IGST breakup dialog" },
      { type: "imp", text: "Professional clean PDF - Tax Invoice, Amount in Words, Bank Details, Signatures" },
      { type: "imp", text: "Alag GST Invoice tab hata diya - sab kuch Sale Voucher mein" },
    ]
  },
  {
    version: "51.4.0",
    date: "29 Mar 2026",
    title: "v51.4.0 - GST Invoice Generator",
    items: [
      { type: "new", text: "GST Invoice Generator - Vouchers tab mein naya subtab" },
      { type: "new", text: "Invoice CRUD - Create, Edit, Delete + PDF Download + WhatsApp Send" },
      { type: "new", text: "GST Company Settings - Settings tab mein company details for invoice" },
      { type: "new", text: "Rice + Byproduct items with HSN codes, CGST/SGST/IGST auto-calculation" },
    ]
  },
  {
    version: "51.3.0",
    date: "29 Mar 2026",
    title: "v51.3.0 - PDF Crash Fix + Report Layout",
    items: [
      { type: "fix", text: "PDF/Excel download crash fix - compression() pura hata diya (desktop pe unnecessary)" },
      { type: "fix", text: "Daily Report mein empty sections ka gap hata diya" },
      { type: "fix", text: "WhatsApp PDF attach fix - localhost URL detection" },
      { type: "imp", text: "WhatsApp footer: Thank you / Navkar Agro" },
      { type: "new", text: "GST Invoice Generator demo (Feature Demo tab)" },
    ]
  },
  {
    version: "51.2.0",
    date: "28 Mar 2026",
    title: "v51.2.0 - WhatsApp Footer Fix",
    items: [
      { type: "fix", text: "WhatsApp se ab PDF attach hoke jaayega (tmpfiles.org upload)" },
      { type: "fix", text: "PDF download stream error fix (compression skip for PDF)" },
      { type: "fix", text: "file.io se tmpfiles.org switch - reliable upload" },
    ]
  },
  {
    version: "51.0.0",
    date: "28 Mar 2026",
    title: "v51.0.0 - WhatsApp PDF Attachment + Font Fix",
    items: [
      { type: "new", text: "Truck Payment & Truck Owner mein WhatsApp send with PDF attachment" },
      { type: "new", text: "Leased Truck mein bhi WhatsApp send button" },
      { type: "new", text: "Desktop se bhi PDF attach hoke WhatsApp jaayega (file.io upload)" },
      { type: "fix", text: "PDF header garbled text fix - FreeSans font ab sahi se bundle hota hai" },
      { type: "fix", text: "7 route files mein registerFonts syntax error fix" },
      { type: "fix", text: "WhatsApp error messages ab sahi reason dikhate hain" },
    ]
  },
  {
    version: "50.7.0",
    date: "28 Mar 2026",
    title: "v50.7.0 - Full Route Sync Desktop + Local",
    items: [
      { type: "fix", text: "WhatsApp routes /api prefix fix - Desktop/Local mein sahi kaam karega" },
      { type: "new", text: "ZIP Backup Download/Restore Desktop aur Local Server mein bhi add hua" },
      { type: "imp", text: "Saare routes Python/Desktop/Local Server mein 100% sync verified" },
    ]
  },
  {
    version: "50.6.0",
    date: "28 Mar 2026",
    title: "v50.6.0 - WhatsApp Desktop/Local Sync",
    items: [
      { type: "fix", text: "WhatsApp settings save fix - Desktop aur Local Server mein bhi WhatsApp routes add kiye" },
    ]
  },
  {
    version: "50.5.0",
    date: "28 Mar 2026",
    title: "v50.5.0 - WhatsApp Default Numbers + PDF + Group",
    items: [
      { type: "imp", text: "Default Numbers save karein - ab prompt nahi aayega, directly saved numbers pe jayega" },
      { type: "new", text: "WhatsApp Group ID option - Daily report group mein bhi jayega" },
      { type: "new", text: "Daily Report PDF WhatsApp pe attach hoke jayega" },
    ]
  },
  {
    version: "50.4.0",
    date: "28 Mar 2026",
    title: "v50.4.0 - WhatsApp Integration (360Messenger)",
    items: [
      { type: "new", text: "WhatsApp 360Messenger API integration - Settings mein API key daalein" },
      { type: "new", text: "WhatsApp Payment Reminder - Party ko balance due ka message bhejein" },
      { type: "new", text: "WhatsApp Daily Report - Daily report summary WhatsApp pe share karein" },
      { type: "new", text: "Test Message - Settings se test message bhej ke verify karein" },
    ]
  },
  {
    version: "50.3.0",
    date: "28 Mar 2026",
    title: "v50.3.0 - Full Backup System",
    items: [
      { type: "new", text: "Backup Now - Server folder mein ek click pe backup" },
      { type: "new", text: "Auto Daily Backup - Har din automatic backup banta hai" },
      { type: "new", text: "ZIP Download - Computer mein backup download" },
      { type: "new", text: "ZIP Upload Restore - Kisi bhi backup se data wapas laao" },
      { type: "imp", text: "Backup list with Restore/Delete - Last 7 backups save hote hain" },
    ]
  },
  {
    version: "50.2.0",
    date: "28 Mar 2026",
    title: "v50.2.0 - Backup Download & Restore",
    items: [
      { type: "new", text: "Backup Download - Poora data ZIP mein download karein (Settings > Backup)" },
      { type: "new", text: "Backup Restore - ZIP upload karke data wapas restore karein" },
    ]
  },
  {
    version: "50.1.0",
    date: "28 Mar 2026",
    title: "v50.1.0 - Extra Fields Placement & Optional Label",
    items: [
      { type: "new", text: "Extra Fields mein Placement option - Company Name ke Upar ya Neeche dikhao" },
      { type: "imp", text: "Label ab optional hai - sirf Value daaloge toh bhi dikhega" },
    ]
  },
  {
    version: "50.0.0",
    date: "28 Mar 2026",
    title: "v50.0.0 - KMS Removed, Only FY Now",
    items: [
      { type: "imp", text: "KMS concept poori tarah hata diya - ab sirf FY (Financial Year Apr-Mar) hai" },
      { type: "imp", text: "Saare PDF/Excel exports mein ab 'FY' likha aayega, 'KMS' nahi" },
      { type: "fix", text: "FY year calculation fix - ab April-March ke hisaab se sahi year dikhega" },
    ]
  },
  {
    version: "49.0.0",
    date: "28 Mar 2026",
    title: "v49.0.0 - Settings & Stock Major Update",
    items: [
      { type: "new", text: "Custom Branding Fields - Settings mein GST, Phone, Address jaise 5-6 extra fields add karein (Left/Center/Right alignment)" },
      { type: "new", text: "Financial Year (Apr-Mar) selector - ab sirf FY system hai, KMS hata diya gaya" },
      { type: "new", text: "Opening Stock Balance - 9 items (Paddy, Rice Usna/Raw, Bran, Kunda, Broken, Kanki, Husk, FRK)" },
      { type: "new", text: "Auto Carry Forward - Previous year ka closing stock → next year ka opening stock ek button se" },
      { type: "imp", text: "Stock Summary mein Opening column add (Available = OB + In - Out)" },
      { type: "imp", text: "Custom fields ab saare PDF aur Excel headers mein automatically aayenge" },
      { type: "imp", text: "Stock Calculator centralized - ek jagah se sab calculate" },
      { type: "fix", text: "Sale Voucher mein stock items ab opening stock ke saath dikhenge" },
    ],
  },
  {
    version: "45.2.0",
    date: "27 Mar 2026",
    title: "v45.2.0 - Auto-Fix Enhanced",
    items: [
      { type: "imp", text: "Auto-fix ab 9 steps run karega - paid_amount recalculation, orphan cleanup, duplicate party merge sab" },
      { type: "fix", text: "Orphaned auto_ledger entries automatically clean" },
      { type: "fix", text: "Orphaned private_payments automatically delete" },
      { type: "fix", text: "paid_amount/balance/payment_status auto recalculation" },
    ],
  },
  {
    version: "45.1.0",
    date: "27 Mar 2026",
    title: "v45.1.0 - Complete Payment Cascade Fix",
    items: [
      { type: "fix", text: "Cash Book se manual payment → Paddy Purchase history mein dikhega" },
      { type: "fix", text: "Undo Paid → cash + party ledger dono se entries delete" },
      { type: "fix", text: "cashbook_pvt_linked ab database mein sahi se store hoga" },
      { type: "fix", text: "const ref duplicate error fix (cashbook route load)" },
    ],
  },
  {
    version: "45.0.1",
    date: "27 Mar 2026",
    title: "v45.0.1 - Hotfix",
    items: [
      { type: "fix", text: "Cash book route load error fix (duplicate variable)" },
    ],
  },
  {
    version: "45.0.0",
    date: "27 Mar 2026",
    title: "v45.0.0 - Payment & Cash Book Fixes",
    items: [
      { type: "fix", text: "Cash Book se delete → ledger + paddy purchase auto update" },
      { type: "fix", text: "Undo Paid → cash book se sab transactions auto delete" },
      { type: "fix", text: "Payment History ab advance + mark-paid entries dikhayega" },
      { type: "fix", text: "Duplicate undo button fix" },
      { type: "fix", text: "Auto-update filename fix (hyphens)" },
    ],
  },
  {
    version: "44.1.0",
    date: "27 Mar 2026",
    title: "v44.1.0 - Cash Book Delete Cascade Fix",
    items: [
      { type: "fix", text: "Cash Book se delete karne par ledger entry + paddy paid_amount auto update" },
      { type: "fix", text: "Duplicate arrow button fix - ab ek hi undo button dikhega" },
    ],
  },
  {
    version: "44.0.0",
    date: "27 Mar 2026",
    title: "v44.0.0 - Undo Paid Complete Fix",
    items: [
      { type: "fix", text: "Undo Paid ab cash book se bhi transaction delete karega" },
      { type: "fix", text: "Duplicate arrow buttons fix - ab ek hi undo button dikhega" },
      { type: "fix", text: "Payment History ab advance + mark-paid entries bhi dikhayega" },
      { type: "fix", text: "Payment status ab dynamically calculate hota hai" },
    ],
  },
  {
    version: "43.0.0",
    date: "27 Mar 2026",
    title: "v43.0.0 - Payment Fix + Auto-Update Fix",
    items: [
      { type: "fix", text: "Payment Undo + History fix - advance se paid entries ab sahi dikhegi" },
      { type: "fix", text: "Auto-update fix - ab update sahi se download hoga" },
      { type: "fix", text: "Payment status ab dynamically compute hota hai (paid/pending)" },
    ],
  },
  {
    version: "42.2.1",
    date: "26 Mar 2026",
    title: "v42.2.1 - Auto-Update Fix",
    items: [
      { type: "fix", text: "Auto-update fix - ab update sahi se download hoga" },
      { type: "fix", text: "GitHub Actions build filename mismatch fix (hyphens vs dots)" },
    ],
  },
  {
    version: "42.2.0",
    date: "26 Mar 2026",
    title: "v42.2 - Duplicate Party Fix + Undo Button Restore",
    items: [
      { type: "fix", text: "Duplicate party name fix - 'Kridha (Kesinga) - Kesinga' ab nahi banega" },
      { type: "fix", text: "Payment Undo button ab Paddy Purchase History mein dikh raha hai" },
      { type: "fix", text: "Health Check ab duplicate party names detect karke merge karega" },
      { type: "fix", text: "GitHub Actions build workflow fix - .exe ab release mein aayega" },
      { type: "imp", text: "Undo+History combined button - jab payment ho toh orange icon dikhega" },
      { type: "imp", text: "Desktop/Local Server mein Mark Paid + Undo Paid logic sync" },
    ],
  },
  {
    version: "42.0.0",
    date: "26 Mar 2026",
    title: "v42 - Payment Fixes + Undo Payment + Round-Off",
    items: [
      { type: "new", text: "Payment History mein Undo Payment button - Cash Book entries bhi auto-delete" },
      { type: "fix", text: "Round-off ab paid_amount mein sahi se add hota hai - balance 0 hoga" },
      { type: "fix", text: "Cash Book se entry delete karne par Paddy Purchase paid_amount auto-revert" },
      { type: "fix", text: "Double payment fix - Pay button disabled during save" },
      { type: "fix", text: "Desktop balance calculation parentheses bug fix" },
      { type: "imp", text: "Route parity - Local Server mein sabhi routes sync" },
      { type: "imp", text: "Backup folders (Google Drive) automatic cleanup" },
    ],
  },
  {
    version: "40.1.0",
    date: "26 Mar 2026",
    title: "v40.1 - Bug Fixes + Auto-Link + Tab Navigation",
    items: [
      { type: "fix", text: "Double payment fix - Pay button ab double-click se duplicate nahi banayega" },
      { type: "fix", text: "Cash Book se payment karne par Paddy Purchase ka paid_amount auto-update hoga" },
      { type: "fix", text: "Ledger entry mein Round Off amount ab sahi dikhega" },
      { type: "fix", text: "Backup folders (Google Drive sync) automatic cleanup" },
      { type: "new", text: "Tab key se bhi form navigation (Enter jaisa)" },
      { type: "new", text: "Ctrl+S se kahin se bhi direct save" },
      { type: "imp", text: "Route parity - Local Server mein sabhi routes sync" },
    ],
  },
  {
    version: "40.0.0",
    date: "26 Mar 2026",
    title: "v40 - Enter Navigation + Code Cleanup",
    items: [
      { type: "new", text: "Transaction Form mein Enter key se agle field par jaayein (sequential navigation)" },
      { type: "imp", text: "Enter dabate jaayein niche niche, last mein Enter se Save" },
      { type: "imp", text: "Code cleanup - triple backend sync aur optimization" },
      { type: "imp", text: "Version 40.0.0 milestone release" },
    ],
  },
  {
    version: "38.6.0",
    date: "25 Mar 2026",
    title: "Accounting Fix + Party Type + Data Health",
    items: [
      { type: "fix", text: "Paddy Purchase ab sirf Party Ledger mein dikhega (Cash Transactions mein nahi - rokad safe)" },
      { type: "fix", text: "Custom Party Type ab type ho payega (Auto-detect override fix)" },
      { type: "fix", text: "Party Ledgers search: match na mile toh 'No ledger found' dikhega" },
      { type: "fix", text: "Pvt Paddy delete karne pe ledger entry bhi automatic delete" },
      { type: "new", text: "Auto-fix: purani entries ka season + account automatically correct" },
    ],
  },
  {
    version: "38.5.0",
    date: "25 Mar 2026",
    title: "Agent Extra Paddy - Cash Book & Daily Report Fix",
    items: [
      { type: "fix", text: "Agent ka Extra Qntl 'Move to Paddy Purchase' ab Cash Book mein party name ke saath dikhega" },
      { type: "fix", text: "Daily Report mein Private Trading ka Qntl aur Rate ab sahi dikhega (0 nahi)" },
      { type: "fix", text: "PDF Report mein Qntl column fix kiya (pehle KG field reference galat tha)" },
      { type: "fix", text: "Auto-fix purani agent_extra entries ko bhi Cash Book mein add karega" },
    ],
  },
  {
    version: "38.4.0",
    date: "25 Mar 2026",
    title: "Pvt Paddy - Cash Book Fix",
    items: [
      { type: "fix", text: "Pvt Paddy Purchase ka party name ab Cash Transactions tab mein dikhta hai (account: cash)" },
      { type: "fix", text: "Purani entries auto-fix se ledger se cash mein migrate ho jayengi" },
    ],
  },
  {
    version: "38.3.0",
    date: "25 Mar 2026",
    title: "Pvt Paddy Party Name - Bulletproof Fix",
    items: [
      { type: "fix", text: "Pvt Paddy Purchase save karne par Cash Book mein party name 100% guarantee se aayega" },
      { type: "fix", text: "3-layer safety: Backend + Safety Net + Frontend Auto-Fix call" },
      { type: "fix", text: "Purani entries bhi auto-fix se Cash Book mein aa jayengi" },
    ],
  },
  {
    version: "38.2.0",
    date: "25 Mar 2026",
    title: "UI Freeze Fix - Global window.confirm Replacement",
    items: [
      { type: "fix", text: "Sabhi components mein window.confirm ko React AlertDialog se replace kiya - ab UI freeze nahi hoga" },
      { type: "fix", text: "Delete, Undo, Mark Paid, Bulk Delete - sabhi actions mein fix laga" },
    ],
  },
  {
    version: "38.1.0",
    date: "25 Mar 2026",
    title: "Bug Fixes - Ctrl+N + Pvt Paddy Party Name",
    items: [
      { type: "fix", text: "Ctrl+N ab sahi kaam karta hai - New Transaction khulta hai, What's New nahi" },
      { type: "fix", text: "Pvt Paddy Purchase mein party name ab Cash Book mein sahi dikhta hai" },
      { type: "fix", text: "Pvt Paddy delete/update pe party jama entry sahi se clean hoti hai (orphan fix)" },
      { type: "fix", text: "Quantity aur Rate ab sahi detail ke saath Cash Book description mein dikhte hain" },
    ],
  },
  {
    version: "37.0.0",
    date: "25 Mar 2026",
    title: "Credit/Debit Fix + UI Freeze Fix",
    items: [
      { type: "fix", text: "Party Ledger mein Credit/Debit direction fix - ab Jama (Cr) aur Nikasi (Dr) sahi dikhte hain" },
      { type: "fix", text: "Auto-ledger entries ab sahi direction mein banti hain (Jama = party ne diya, Nikasi = humne diya)" },
      { type: "fix", text: "Purani galat entries automatic fix ho jaayengi (migration)" },
      { type: "fix", text: "UI freeze on delete - permanent fix with React AlertDialog + aggressive cleanup" },
      { type: "imp", text: "Delete confirm dialog ab sundar React dialog hai, native browser dialog nahi" },
    ],
  },
  {
    version: "36.0.0",
    date: "25 Mar 2026",
    title: "Major Update - Accounting Fix + Exports + Labels",
    items: [
      { type: "fix", text: "Party Ledger mein double-counting bug fix - ab sabhi payments sahi dikhte hain (Agent, Diesel, Voucher, Private, Truck)" },
      { type: "new", text: "Party Ledger mein Sale Book aur Purchase Voucher section add - poora hisaab ek jagah" },
      { type: "imp", text: "Jama (Cr) / Nikasi (Dr) - sabhi jagah updated labels (UI, PDF, Excel)" },
      { type: "imp", text: "Ref column sabhi exports se hata diya (PDF + Excel)" },
      { type: "imp", text: "Sabhi exports mein Company Name + Tagline header" },
      { type: "fix", text: "Hindi font fix - PDF mein ab Hindi text sahi dikhta hai (FreeSans font)" },
      { type: "imp", text: "Sabhi exports ka naya sundar design (styled headers, colors, formatting)" },
      { type: "fix", text: "Desktop build fix - version mismatch auto-detect, ab rebuild automatic hoga" },
    ],
  },
  {
    version: "32.0.0",
    date: "24 Mar 2026",
    title: "Ledger Fix + UI Freeze Fix",
    items: [
      { type: "fix", text: "Party Ledger balance sahi dikhta hai ab - Auto-ledger double-entry fix (Jama/Nikasi correct)" },
      { type: "fix", text: "Delete karne ke baad screen freeze hona band - Radix UI pointer-events fix" },
      { type: "fix", text: "Round Off ab Cash in Hand balance mein count nahi hota (sirf discount hai)" },
      { type: "imp", text: "Account filter mein 'All' option add - Round Off entries bhi dikh sakte hain" },
      { type: "imp", text: "Auto Update UI - native dialog hata, custom React UI (checking, downloading, installed states)" },
      { type: "imp", text: "Truck Lease receipt ab Truck Payment jaisa sundar print hota hai" },
      { type: "fix", text: "Desktop pe purane wrong ledger entries automatically fix hote hain (migration script)" },
    ],
  },
  {
    version: "27.0.0",
    date: "24 Mar 2026",
    title: "Major Release - Round Off Fix + Auto Update UI",
    items: [
      { type: "fix", text: "Sabhi payments mein Round Off balance fix - Truck, Agent, Owner, Diesel, Hemali, Voucher, CashBook, Local Party" },
      { type: "imp", text: "Auto Update notification ab sundar glassmorphism card mein" },
      { type: "fix", text: "Desktop build config fix - utils folder include" },
      { type: "fix", text: "Deployment blockers fix - .gitignore aur server.py" },
    ],
  },
  {
    version: "26.0.3",
    date: "23 Mar 2026",
    title: "Sundar Auto Update UI",
    items: [
      { type: "imp", text: "Auto update notification ab sundar glassmorphism card mein dikhta hai" },
      { type: "imp", text: "Download progress bar, version comparison, Hindi buttons" },
    ],
  },
  {
    version: "26.0.2",
    date: "23 Mar 2026",
    title: "Desktop Round Off Sync Fix",
    items: [
      { type: "fix", text: "Desktop app ke sabhi routes mein Round Off ledger balance fix kiya" },
      { type: "fix", text: "CashBook, Truck, Agent, Owner, Diesel, Hemali, Voucher, Private Trading - sab sync" },
    ],
  },
  {
    version: "26.0.1",
    date: "23 Mar 2026",
    title: "Round Off Balance Fix - Sabhi Payments",
    items: [
      { type: "fix", text: "Round Off balance bug fix - Truck, Agent, Owner, Diesel, Hemali, Voucher, CashBook, Local Party" },
      { type: "fix", text: "Ledger mein ab total (amount + round off) record hota hai, balance sahi aata hai" },
      { type: "fix", text: "Desktop build mein utils folder include kiya" },
    ],
  },
  {
    version: "26.0.0",
    date: "23 Mar 2026",
    title: "Local Party Round Off Fix + Desktop Build Fix",
    items: [
      { type: "fix", text: "Local Party payment mein Round Off balance sahi hota hai ab" },
      { type: "fix", text: "Desktop app mein utils folder build mein include kiya" },
      { type: "new", text: "Local Party Settlement mein Round Off option" },
    ],
  },
  {
    version: "25.1.59",
    date: "23 Mar 2026",
    title: "Desktop Round Off Bug Fix",
    items: [
      { type: "fix", text: "Desktop app mein Round Off ka 'module not found' error fix kiya" },
      { type: "fix", text: "Build config mein utils folder include kiya" },
    ],
  },
  {
    version: "25.1.58",
    date: "23 Mar 2026",
    title: "Local Party mein Round Off",
    items: [
      { type: "new", text: "Local Party Settlement mein Round Off ka option add kiya" },
      { type: "fix", text: "Store Room - Stock In par Part master update hota hai" },
      { type: "new", text: "Transactions table mein Store Room column" },
    ],
  },
  {
    version: "25.1.57",
    date: "23 Mar 2026",
    title: "Store Room Bug Fixes",
    items: [
      { type: "fix", text: "Stock In mein Store Room select karne par Part master bhi update hota hai" },
      { type: "new", text: "Transactions table mein Store Room column add kiya" },
    ],
  },
  {
    version: "25.1.56",
    date: "22 Mar 2026",
    title: "Telegram Confirmation Dialog",
    items: [
      { type: "imp", text: "Telegram bhejne se pehle confirmation - date aur recipients dikhein" },
      { type: "imp", text: "Galti se wrong report na jaye, Cancel ka option" },
    ],
  },
  {
    version: "25.1.55",
    date: "22 Mar 2026",
    title: "Round Off Filter + Telegram Share",
    items: [
      { type: "new", text: "Daily Report mein Telegram Share button (Detail mode)" },
      { type: "imp", text: "Cash Transactions se Round Off entries hide (alag toggle se dikhein)" },
    ],
  },
  {
    version: "25.1.54",
    date: "22 Mar 2026",
    title: "Daily Report Export mein Store Room",
    items: [
      { type: "new", text: "Daily Report PDF/Excel export mein Mill Parts ka Store Room column" },
      { type: "imp", text: "Desktop app mein bhi Store Room export support" },
    ],
  },
  {
    version: "25.1.53",
    date: "22 Mar 2026",
    title: "Store Room Everywhere + Export Update",
    items: [
      { type: "new", text: "Stock In/Used form mein Store Room select option" },
      { type: "new", text: "Stock Summary table mein Store Room column" },
      { type: "new", text: "Part-wise Summary mein Store Room info" },
      { type: "imp", text: "Sabhi Excel aur PDF exports mein Store Room column add" },
    ],
  },
  {
    version: "25.1.52",
    date: "22 Mar 2026",
    title: "Footer Redesign + Version Bump",
    items: [
      { type: "imp", text: "Footer centered layout - clean aur professional look" },
      { type: "imp", text: "Version, Designer, Contact info centered mein" },
    ],
  },
  {
    version: "25.1.50",
    date: "22 Mar 2026",
    title: "Store Room Export + What's New",
    items: [
      { type: "new", text: "Store Room Report mein Excel aur PDF export" },
      { type: "new", text: "What's New popup - har update par automatic dikhe" },
      { type: "new", text: "Footer mein version number, contact info" },
    ],
  },
  {
    version: "25.1.49",
    date: "22 Mar 2026",
    title: "Store Room Feature",
    items: [
      { type: "new", text: "Mill Parts mein Store Room management (Add/Edit/Delete)" },
      { type: "new", text: "Parts Master mein Store Room assign kar sakte hain" },
      { type: "new", text: "Room-wise Inventory Report - nayi tab" },
      { type: "imp", text: "Store Room delete karne par parts auto-unassign" },
    ],
  },
  {
    version: "25.1.48",
    date: "22 Mar 2026",
    title: "Round Off Feature",
    items: [
      { type: "new", text: "Saare payment sections mein Round Off option" },
      { type: "new", text: "Round Off ki alag entry Cash Book mein dikhe" },
      { type: "imp", text: "+10 ya -10 se payment adjust kar sakte hain" },
      { type: "imp", text: "CashBook, Hemali, Truck, Agent, Diesel, Voucher, Staff, Private Trading - sabmein available" },
    ],
  },
  {
    version: "25.1.47",
    date: "Mar 2026",
    title: "Hemali Payment Complete",
    items: [
      { type: "new", text: "Hemali Payment System - full implementation" },
      { type: "fix", text: "Data integrity fixes across all payment flows" },
      { type: "imp", text: "Startup integrity checks (web + desktop)" },
    ],
  },
];

const typeBadge = {
  new: { label: "NEW", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  fix: { label: "FIX", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
  imp: { label: "IMP", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
};

const WhatsNew = ({ forceOpen = false, onClose }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    // v104.44.38 — Auto-popup HATA diya. User ne kaha optional ho.
    // Sirf forceOpen=true ho to dialog khulta hai (header me "What's New" button click se).
  }, [forceOpen]);

  const handleClose = () => {
    localStorage.setItem("whats_new_version", APP_VERSION);
    setOpen(false);
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true); }}>
      <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-white max-h-[80vh] overflow-y-auto" data-testid="whats-new-dialog">
        <DialogHeader>
          <DialogTitle className="text-amber-400 flex items-center gap-2 text-lg">
            <Gift className="w-5 h-5" />
            What's New / नया क्या है
            <span className="ml-auto text-xs font-normal text-slate-400">v{APP_VERSION}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          {CHANGELOG.slice(0, 5).map((release, ri) => (
            <div key={release.version} className={`space-y-2 ${ri > 0 ? 'pt-4 border-t border-slate-700/60' : ''}`}>
              <div className="flex items-center gap-2">
                {ri === 0 && <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />}
                <h3 className={`font-bold text-sm ${ri === 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {release.title}
                </h3>
                <span className="text-[10px] text-slate-500 ml-auto">{release.date}</span>
              </div>
              <ul className="space-y-1.5 ml-1">
                {release.items.map((item, ii) => {
                  const badge = typeBadge[item.type] || typeBadge.imp;
                  return (
                    <li key={ii} className="flex items-start gap-2 text-sm">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="text-slate-300">{item.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-3 border-t border-slate-700/60">
          <Button onClick={handleClose} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold" data-testid="whats-new-close">
            <Check className="w-4 h-4 mr-1" /> Samajh Gaya!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { APP_VERSION, WhatsNew };
export default WhatsNew;
