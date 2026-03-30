# Mill Entry System - PRD

## Original Problem Statement
A comprehensive full-stack rice mill management system with a React frontend, Python FastAPI web backend, and an Electron/Express desktop app using local JSON storage.

## Current Version: v55.7.0

## What's Been Implemented
- Full paddy purchase management with party ledgers
- Double-entry cash book with multi-account support
- Sale book with GST vouchers, Milling/CMR tracking
- DC tracker, Leased truck, Staff, Hemali, Mill parts
- FY Summary dashboard with Balance Sheet
- WhatsApp (360Messenger): Individual + Group send, Default Group, Scheduler, **Global ON/OFF toggle in Settings**
- Telegram: Daily report, Generic send-custom, **Global ON/OFF toggle in Settings**
- Entries page: WhatsApp, Group, Telegram buttons with filter-based PDF
- PDF/Excel export, IPC downloads, Auto-updater
- Footer: formula removed

## Recent Changes (v55.7.0)
- Settings mein WhatsApp aur Telegram ka ON/OFF toggle switch (card header)
- OFF + Save → sab jagah buttons chhup jayenge
- ON + Save → buttons wapas dikhenge

## Prioritized Backlog
### P1
- Export Preview feature

### P2
- GSTR-1 Export
- Code deduplication across JS backends
- Payment/Stock logic centralization
