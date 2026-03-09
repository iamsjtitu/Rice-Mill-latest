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

---

## Auto-Update Setup (Automatic Update Feature)

### Yeh kaise kaam karta hai?
Jab aap GitHub par naya release banate hain, GitHub Actions **automatically** aapka app build karke release mein upload kar deta hai. Phir jab koi user apna app kholega, usse **automatic update ka popup** aayega!

### First Time Setup (Sirf ek baar karna hai)

#### Step 1: Emergent se GitHub par save karein
- Emergent chat mein **"Save to GitHub"** button click karein
- Repository name: `Rice-Mill-latest` (ya jo bhi aapne set kiya hai)

#### Step 2: Pehla build manually banayein
Kyunki auto-update sirf tab kaam karta hai jab user ke paas pehle se app installed ho:
```cmd
cd desktop-app
npm install
npm run build:win
```
`dist/` folder mein se `Mill Entry System Setup.exe` install karein.

#### Step 3: Naya Release banayein (Update publish karna)
Jab bhi code mein changes hon aur aap update push karna chahein:

1. `desktop-app/package.json` mein version badhaayein:
   - Abhi hai: `"version": "2.3.0"`
   - Badal kar karein: `"version": "2.4.0"` (ya 2.3.1 etc.)

2. Emergent se **"Save to GitHub"** karein

3. GitHub website par jaayein: `https://github.com/iamsjtitu/Rice-Mill-latest`

4. **"Releases"** tab par click karein (right side mein hota hai)

5. **"Create a new release"** (ya "Draft a new release") button dabayein

6. Release details bharein:
   - **Tag:** `v2.4.0` (jo version number `package.json` mein likha hai, uske aage `v` lagayein)
   - **Title:** `Mill Entry System v2.4.0`
   - **Description:** Kya changes kiye hain (optional)

7. **"Publish release"** button dabayein

8. Ab GitHub Actions **automatically** Windows .exe build karke release mein attach kar dega. (5-10 minute lagenge)

9. Users ko **apne aap update ka popup** aa jayega jab wo app kholenge!

### Version Badhaane ka Rule
- Chhota fix: `2.3.0` → `2.3.1`
- Naya feature: `2.3.0` → `2.4.0`
- Bada update: `2.3.0` → `3.0.0`

### Check karein ki Release publish hua hai?
- GitHub par jaayein → Releases tab → Dekhein ki `.exe` file aur `latest.yml` file upload ho gayi hai
- Agar "Actions" tab mein koi error hai, toh uska screenshot share karein

---

## Kaise Kaam Karta Hai

1. App open karne par **Tally jaisa splash screen** aata hai
2. Apna **Data Folder** select karein (naya banayein ya purana kholein)
3. App khul jaayegi browser jaisi - sab features same hain
4. Data selected folder mein save hota hai (`millentry-data.json`)
5. **Backup** automatic hota hai daily (`data/backups/` mein)
6. **Auto-Update**: App khulne par check karta hai ki naya version hai ya nahi

## Features
- Offline - Internet ki zarurat nahi
- Multiple companies - Alag folder = alag company
- Auto-backup - Daily automatic, max 7 rakhta hai
- Excel export (.xlsx) - Professional styled headers
- PDF export - Company branding ke saath
- Portable version - USB se bhi chal sakta hai
- **Auto-Update** - Naye version ka popup apne aap aata hai

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
| Auto-update kaam nahi kar raha | GitHub par Release publish hua hai? `latest.yml` file hai? |
| GitHub Actions fail | "Actions" tab check karein, screenshot share karein |
