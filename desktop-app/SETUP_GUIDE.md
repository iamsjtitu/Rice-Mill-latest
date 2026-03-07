# Mill Entry System - Desktop App (.exe) Build Guide

## Prerequisites
- **Node.js** v18+ : https://nodejs.org/ (LTS install karein)
- **Git** (optional) : https://git-scm.com/

## Quick Build (3 Steps)

### Step 1: Code Download
GitHub se code download karein (Save to GitHub → Download ZIP → Extract)

### Step 2: Setup
```cmd
cd desktop-app
npm install
```

### Step 3: Build .exe
```cmd
npm run build
```

Output folder: **`desktop-app/dist/`**
- `Mill Entry System Setup.exe` - Windows Installer
- `MillEntrySystem-Portable.exe` - Portable (no install needed)

## Kaise Kaam Karta Hai

1. App open karne par **Tally jaisa splash screen** aata hai
2. Apna **Data Folder** select karein (naya banayein ya purana kholein)
3. App khul jaayegi browser jaisi - sab features same hain
4. Data selected folder mein save hota hai (`millentry-data.json`)
5. **Backup** automatic hota hai daily (`data/backups/` mein)

## Features
- Offline - Internet ki zarurat nahi
- Multiple companies - Alag folder = alag company
- Auto-backup - Daily automatic, max 7 rakhta hai
- Excel export (.xlsx) - Professional styled headers
- PDF export - Company branding ke saath
- Portable version - USB se bhi chal sakta hai

## Dev Mode (Build ke bina test karna hai?)
```cmd
cd frontend
npm install
set REACT_APP_BACKEND_URL=http://127.0.0.1:9876
npm start

:: Doosri terminal mein:
cd desktop-app
npm install
npm start
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm run build` fail | `npm install` pehle karein |
| Frontend build error | `cd ../frontend && npm install --legacy-peer-deps` |
| Icon nahi dikh raha | `icon.ico` file `desktop-app/` mein hai? |
| App blank screen | Frontend build check: `frontend-build/index.html` exists? |
