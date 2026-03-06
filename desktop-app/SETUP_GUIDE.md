# Mill Entry System - Desktop App Setup Guide

## Prerequisites (Windows PC par install karein)

1. **Node.js** (v18 ya usse upar): https://nodejs.org/
2. **Git** (optional): https://git-scm.com/
3. **Yarn** (optional, npm bhi chalega): `npm install -g yarn`

## Quick Start (Development Mode)

### Step 1: Code Download
- Emergent Platform par "Save to GitHub" button use karein
- Ya code manually copy karein

### Step 2: Frontend Build
```bash
cd frontend
yarn install
yarn build
```

### Step 3: Desktop App Setup
```bash
cd desktop-app
npm install
# Frontend build copy karein
cp -r ../frontend/build ./frontend-build
# Ya Windows par:
# xcopy /E /I ..\frontend\build frontend-build
```

### Step 4: Run Desktop App
```bash
npm start
```

## Build .exe Installer (Windows)

### Automatic Build
```bash
cd desktop-app
npm run build
```
Ye command frontend build + Electron packaging dono karega.

### Manual Steps
```bash
# 1. Frontend build with desktop API URL
cd frontend
set REACT_APP_BACKEND_URL=http://127.0.0.1:9876
yarn build
xcopy /E /I build ..\desktop-app\frontend-build

# 2. Desktop app build
cd ..\desktop-app
npm install
npm run build:win
```

### Output Files
Build complete hone par `desktop-app/dist/` folder mein milega:
- **Mill Entry System Setup.exe** - Installer (NSIS)
- **MillEntrySystem-Portable.exe** - Portable version (no install needed)

## How It Works

1. **App Start**: Splash screen dikhata hai - Tally jaisa data folder select karein
2. **Data Folder**: Apna data folder select ya create karein
   - Har company ka alag folder rakh sakte hain
   - Multiple companies support hai
3. **Database**: `millentry-data.json` file automatically ban jaata hai selected folder mein
4. **API Server**: Local Express server port 9876 par chalta hai
5. **No Internet Required**: Sab kuch offline chalta hai

## Data Backup

Apne data ka backup lene ke liye:
- Selected data folder ko copy kar lein
- `millentry-data.json` file mein sab data hai
- Restore karne ke liye folder paste karke app mein open karein

## Troubleshooting

### Port 9876 already in use
App automatically doosre port par shift ho jaata hai.

### App blank screen dikhata hai
- Check karein ki `frontend-build` folder hai `desktop-app/` mein
- Ya development mode mein `cd frontend && yarn start` pehle chalayein

### Data nahi dikh raha
- Sahi data folder select karein
- Check karein ki `millentry-data.json` file hai folder mein

## File Structure
```
desktop-app/
  main.js           - Electron main process + Express API server
  preload.js        - Secure context bridge
  package.json      - Dependencies and build config
  frontend-build/   - React app build (auto-generated)
  dist/             - Built .exe files (auto-generated)
```

## API Port
Desktop app ka API server **port 9876** par chalta hai by default.
Frontend build mein ye URL baked in hai: `http://127.0.0.1:9876`
