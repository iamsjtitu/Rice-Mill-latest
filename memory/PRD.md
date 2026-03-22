# Mill Entry System - PRD

## Original Problem Statement
Navkar Agro Mill Entry System - A comprehensive accounting and management application for a rice mill.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend (Web)**: FastAPI + MongoDB
- **Backend (Desktop)**: Electron + Node.js/Express + JSON file DB
- **Language**: Hindi UI labels

## Latest Features (v25.1.51) - March 22, 2026

### What's New + Footer (COMPLETE)
- Auto-showing "What's New" popup on version update (localStorage tracking)
- Changelog with color-coded badges (NEW/IMP/FIX)
- Header: v-button to reopen What's New anytime
- Footer: Version number, Designed By 9x.design link, Contact +91 72059 30002

### Round Off Feature (P0 - COMPLETE)
- Round Off input in ALL payment dialogs
- Separate "Round Off" entry in Cash Book

### Mill Parts Store Room Feature (P1 - COMPLETE)
- Store Room CRUD + assignment to parts
- Room-wise Inventory Report with Excel/PDF export

## Backlog
- P1: Refactor PDF/Excel generation logic
- P1: Centralize stock calculation logic
- P2: Sardar-wise monthly breakdown report
- P2: Centralize payment logic into service layer
