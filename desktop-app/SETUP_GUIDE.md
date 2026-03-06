# 🖥️ Windows Desktop App Setup Guide

## Mill Entry System - Desktop Application

यह guide आपको बताएगी कि कैसे इस app को Windows पर .exe के रूप में चलाएं।

---

## 📦 Download Files

आपको ये files चाहिए:
1. `/app/desktop-app/` - Desktop app source
2. `/app/frontend/` - React frontend
3. `/app/backend/` - API reference (desktop में embedded है)

---

## 🔧 Windows पर Build करने के Steps

### Step 1: Prerequisites Install करें

1. **Node.js v18+** 
   - https://nodejs.org/ से download करें
   - Installer run करें

2. **Git** (Optional)
   - https://git-scm.com/

### Step 2: Code Download करें

Emergent Platform से "Save to GitHub" करें या ZIP download करें।

### Step 3: Terminal/CMD में Commands

```cmd
:: Frontend Build
cd frontend
npm install
npm run build

:: Desktop App Build
cd ../desktop-app
npm install
npm run build:win
```

### Step 4: Output

Build complete होने पर:
- `desktop-app/dist/Mill Entry System Setup.exe` - Installer
- `desktop-app/dist/win-unpacked/` - Portable version

---

## 🎯 Software Features

### Tally जैसा Data Folder System:

```
┌─────────────────────────────────────────┐
│     🏭 Mill Entry System               │
│     Data Management Software            │
├─────────────────────────────────────────┤
│                                         │
│  📂 Recent Data Folders                 │
│  ┌─────────────────────────────────┐   │
│  │ D:\MillData\NavkarAgro      →   │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ D:\MillData\XYZTraders      →   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  📁 Data Folder Select Karein          │
│  ┌──────────────┐ ┌──────────────┐     │
│  │ 📂 Open      │ │ ➕ Create    │     │
│  │   Existing   │ │    New       │     │
│  └──────────────┘ └──────────────┘     │
│                                         │
└─────────────────────────────────────────┘
```

### Data Storage Structure:

```
D:\MillData\
├── NavkarAgro\           # Company 1
│   └── millentry.db      # SQLite Database
│
├── XYZTraders\           # Company 2
│   └── millentry.db
│
└── ABCMill\              # Company 3
    └── millentry.db
```

---

## 📝 Key Points

1. **No Internet Required** - Sab local mein chalta hai
2. **No MongoDB** - SQLite use hota hai (single file database)
3. **Backup Easy** - Folder copy karo, backup ho gaya
4. **Multiple Companies** - Alag folder = Alag company
5. **White Label** - Settings mein naam change karo

---

## 🔐 Default Credentials

| Role  | Username | Password   |
|-------|----------|------------|
| Admin | admin    | admin123   |
| Staff | staff    | staff123   |

---

## ❓ FAQ

**Q: Data kahan save hota hai?**
A: Jo folder select karte ho usme `millentry.db` file banti hai.

**Q: Multiple computers par kaise use karein?**
A: Data folder ko network drive (like `\\server\shared\MillData`) par rakhein.

**Q: Backup kaise lein?**
A: Data folder ko copy karke safe jagah rakh do.

**Q: Ek computer se doosre par kaise move karein?**
A: Data folder copy karke naye computer par paste karo aur software mein open karo.

---

## 🛠️ Technical Details

- **Framework:** Electron
- **Database:** SQLite (better-sqlite3)
- **Frontend:** React
- **Backend:** Embedded Express server
- **Build Tool:** electron-builder

---

## 📞 Support

Software mein koi problem ho toh developer se contact karein.
