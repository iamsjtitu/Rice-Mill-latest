import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Gift, ArrowRight, Check } from "lucide-react";

const APP_VERSION = "86.2.0";

const CHANGELOG = [
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
    const lastSeen = localStorage.getItem("whats_new_version");
    if (lastSeen !== APP_VERSION) {
      setOpen(true);
    }
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
