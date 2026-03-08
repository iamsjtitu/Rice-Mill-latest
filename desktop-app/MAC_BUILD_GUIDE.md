# Mill Entry System - macOS Build Guide

## Prerequisites
1. macOS machine (Apple Silicon M1/M2/M3/M4)
2. Node.js 18+ installed (`brew install node`)
3. Yarn installed (`npm install -g yarn`)

## Steps

### 1. Setup
```bash
cd desktop-app
yarn install
```

### 2. Build Frontend (if not already built)
```bash
node setup-desktop.js
```
Yeh frontend ka build `frontend-build/` folder mein copy karega.

### 3. macOS Build Commands

**DMG + PKG dono (Recommended):**
```bash
yarn build:mac-all
```

**Sirf DMG:**
```bash
yarn build:mac-dmg
```

**Sirf PKG:**
```bash
yarn build:mac-pkg
```

### 4. Output
Build files yahan milenge:
```
desktop-app/dist/
├── MillEntrySystem-2.3.0-mac.dmg    # DMG installer
├── MillEntrySystem-2.3.0-mac.pkg    # PKG installer
└── mac-arm64/                        # Unpacked app
    └── Mill Entry System.app
```

### 5. Install & Run
- **DMG:** Double-click → Drag to Applications
- **PKG:** Double-click → Follow installer

### 6. First Run (Unsigned App)
Kyunki app unsigned hai, macOS Gatekeeper block karega:
1. **Right-click** Mill Entry System.app → **Open**
2. Dialog mein **"Open"** click karein
3. Ya: System Settings → Privacy & Security → **"Open Anyway"** click karein

Ek baar allow karne ke baad, aage se normally open hoga.

## Notes
- Build sirf macOS machine par hi hogi (cross-compile nahi hota macOS ke liye)
- Apple Silicon (arm64) ke liye optimized hai
- Code signing nahi hai, sirf local use ke liye
- Data folder har baar manually select karna hoga (auto-load hataya gaya hai)
