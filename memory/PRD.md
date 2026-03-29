# Mill Entry System - PRD

## Current Version: v51.4.0

## Architecture
- Web: React + FastAPI + MongoDB
- Desktop: Electron + Express + Local JSON
- Local Server: Express + Local JSON
- Triple Backend Parity: Verified

## Credentials
- Username: admin, Password: admin123

## Key Features
- GST Invoice Generator - CRUD + PDF + WhatsApp (Vouchers > GST Invoice subtab)
- GST Company Settings (Settings tab)
- WhatsApp 360Messenger with PDF attachment
- Desktop WhatsApp: localhost URL → tmpfiles.org → public URL
- NO compression middleware (prevents ERR_STREAM_WRITE_AFTER_END)
- Daily Report empty sections auto-hidden
- PDF column widths: Python `* mm`, JS `* 2.835`

## Completed in v51.4.0 (29 Mar 2026)
1. GST Invoice Generator - Full CRUD (Create, Read, Update, Delete)
2. Invoice PDF generation with company header, items table, tax summary, bank details
3. WhatsApp send-gst-invoice endpoint with PDF attachment (all 3 backends)
4. GST Company Settings in Settings tab (company, GSTIN, address, bank details)
5. Vouchers tab: new "GST Invoice" subtab
6. HSN code auto-fill for Rice/Paddy/Byproduct items
7. CGST/SGST/IGST auto-calculation

## Completed in v51.3.0 (29 Mar 2026)
1. compression() removed entirely from desktop + local (ERR_STREAM_WRITE_AFTER_END fix)
2. Daily Report gap fix (empty sections conditional)
3. WhatsApp localhost URL detection
4. WhatsApp footer: "Thank you / {company}"

## API Endpoints (New)
- GET/PUT /api/gst-company-settings
- GET/POST /api/gst-invoices
- PUT/DELETE /api/gst-invoices/{id}
- GET /api/gst-invoices/{id}/pdf
- POST /api/whatsapp/send-gst-invoice

## DB Schema (New)
- gst_invoices: {id, invoice_no, date, buyer_name, buyer_gstin, buyer_address, buyer_phone, is_igst, items[], totals{}, kms_year, season, notes, created_at}
- settings.gst_company: {company_name, gstin, address, state_code, state_name, phone, bank_name, bank_account, bank_ifsc}

## Upcoming Tasks
- P1: Export Preview feature

## Backlog
- P2: Desktop/Local server code deduplication
- P2: Payment logic centralization
