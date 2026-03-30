# Mill Entry System - PRD

## Current Version: v55.23.0

## Original Problem Statement
A comprehensive full-stack rice mill management system with React frontend, Python FastAPI web backend, and Electron/Express desktop app. Features double-entry accounting ledgers, advanced reporting, offline-first desktop capabilities, and automated hardware integration for vehicle weight capture.

## What's Been Implemented (Latest)
- **v55.23.0**: Electron Serial Port integration for real weighbridge hardware. 
  - `serial-handler.js` module: Opens COM port, reads weight data, detects stability (3 consecutive same readings ±10 KG), sends to renderer via IPC.
  - Keshav Computer WetBridge protocol: COM4, 2400 baud, 8N1 (configurable).
  - Flexible data parser supporting multiple weighbridge formats.
  - `preload.js` IPC bridge: serialConnect, serialDisconnect, onSerialWeight, onSerialStatus, serialGetConfig, serialSaveConfig, serialListPorts.
  - Frontend `useRealScale` hook: Listens to Electron IPC for real weight data.
  - Frontend `useSimulatorScale` hook: Fallback for web/cloud mode.
  - Auto-detection: Electron mode uses real serial, Web mode uses simulator.
  - Settings > Messaging > Weighbridge Configuration: COM Port, Baud Rate, Data Bits, Parity, Stop Bits, Auto Connect toggle.
  - `serialport` v12 added to desktop-app/package.json.
- **v55.22.0**: Edit dialog, A5 Print (2 copies), manual WA/Group with complete text.
- **v55.21.x**: Auto messaging, Settings toggle, manual WA/Group updated.
- **v55.20.0**: White theme, 2 cameras.
- **v55.19.x**: AutoSuggest, Cash/Diesel fix, Scale auto-connect, RST editable, Delete.

## Key Features
- Triple Backend (Python FastAPI + Electron/Express + Local Express)
- Double-entry accounting, Cash Book, Party Ledgers
- Auto Vehicle Weight: real serial port (Electron) / simulator (web), 2 cameras, auto-messaging
- Edit, Print A5 (Party+Customer copy), Download, WA, Group, Delete actions
- RST auto-fill between Vehicle Weight → Mill Entries
- Weighbridge Configuration in Settings (COM port, baud rate, parity, stop bits)

## Prioritized Backlog
### P2 - Future
- Export Preview feature
- Code deduplication across Desktop/Local JS backends
- Centralize payment/stock logic
- Refactor App.js (~2500 lines)
