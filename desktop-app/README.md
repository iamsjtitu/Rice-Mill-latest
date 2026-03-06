# Mill Entry System - Windows Desktop Application

## 🖥️ Windows पर Install करने के Steps

### Method 1: Pre-built .exe (आसान तरीका)

1. `dist` folder में जाएं
2. `Mill Entry System Setup.exe` double-click करें
3. Install करें
4. Desktop shortcut से चलाएं

---

### Method 2: Source से Build करें

#### Prerequisites (पहले install करें):

1. **Node.js** (v18 या newer)
   - Download: https://nodejs.org/
   - Install करें

2. **Git** (optional)
   - Download: https://git-scm.com/

#### Build Steps:

```bash
# 1. Folder में जाएं
cd desktop-app

# 2. Dependencies install करें
npm install

# 3. Frontend build करें (पहले frontend folder में)
cd ../frontend
npm install
npm run build

# 4. Desktop app build करें
cd ../desktop-app
npm run build:win
```

#### Output:
- `dist/Mill Entry System Setup.exe` - Installer file
- `dist/win-unpacked/` - Portable version

---

## 🎯 Software कैसे Use करें

### पहली बार चलाने पर:

1. Software open करें
2. **"New Data Folder Create Karein"** button click करें
3. Location select करें (जैसे `D:\MillData\CompanyName`)
4. Software automatically database create करेगा

### अगली बार:

1. Software open करें
2. Recent folders में से select करें
3. या "Existing Folder Open Karein" से folder choose करें

---

## 📂 Data Storage

### Data कहाँ save होता है?

आपके selected folder में:
```
D:\MillData\CompanyName\
├── millentry.db      # Main database (SQLite)
```

### Multiple Companies के लिए:

अलग-अलग folders बनाएं:
```
D:\MillData\
├── NavkarAgro\       # Company 1
│   └── millentry.db
├── XYZTraders\       # Company 2
│   └── millentry.db
└── ABCMill\          # Company 3
    └── millentry.db
```

---

## 🔐 Default Login

- **Admin:** `admin` / `admin123`
- **Staff:** `staff` / `staff123`

---

## ⚙️ Features

- ✅ Tally जैसा Data Folder Selection
- ✅ Local SQLite Database (No internet required)
- ✅ Multiple Company Support
- ✅ Data Backup (Just copy the folder)
- ✅ White Label Ready (Settings में Company Name change करें)
- ✅ All Calculations Auto
- ✅ Excel/PDF Export
- ✅ Print Receipts

---

## 🔄 Backup & Restore

### Backup:
Data folder को copy करके safe location पर रखें

### Restore:
Backup folder को वापस paste करें और software में open करें

---

## ❓ Support

किसी भी समस्या के लिए software developer से संपर्क करें।
