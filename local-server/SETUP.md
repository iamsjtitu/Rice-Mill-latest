# Mill Entry System - Local Server Setup

## Windows PC par kaise chalayein (Step by Step)

### Step 1: Node.js Install Karein
1. https://nodejs.org/ par jao
2. **LTS version** download karein (green button)
3. Install karein (Next-Next-Finish)

### Step 2: Code Download Karein
- Emergent platform par **"Save to GitHub"** button click karein
- GitHub se code download (ZIP) karein
- ZIP extract karein kisi folder mein (e.g., `C:\MillEntry\`)

### Step 3: Setup (Pehli baar)
1. `local-server` folder kholein
2. **`setup.bat`** double-click karein
3. Wait karein (2-3 minute lagega)
4. "Setup Complete!" dikhe to aage badhein

### Step 4: App Start Karein
1. **`start.bat`** double-click karein
2. Browser automatically khulega: http://localhost:8080
3. Login karein: **admin / admin123**

---

## Important Jaankari

### Data Kahan Save Hota Hai?
- `local-server/data/millentry-data.json` mein sab data hai
- Ye file automatically ban jaati hai pehli baar

### Data Backup Kaise Lein?
- `data` folder copy kar lo kahin safe jagah
- Restore: `data` folder wapas paste kar do

### App Band Kaise Karein?
- Command prompt mein **Ctrl+C** dabayein
- Ya command prompt window band kar dein

### Doosre Computer Par Kaise Chalayein?
1. Poora `local-server` folder copy karein (with `data` and `public`)
2. Node.js install karein doosre computer par
3. `start.bat` double-click karein

---

## Manual Setup (Agar setup.bat na chale)

Command Prompt (cmd) kholein:

```
cd C:\MillEntry\local-server
npm install

cd ..\frontend
npm install
set REACT_APP_BACKEND_URL=http://localhost:8080
npm run build

cd ..\local-server
xcopy /E /I ..\frontend\build public

node server.js
```

---

## Login Credentials
- **Admin:** admin / admin123 (Full access)
- **Staff:** staff / staff123 (Limited access - 5 min edit window)

## Port
- Default port: **8080**
- Browser URL: **http://localhost:8080**

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Node.js not found" | Node.js install karein: nodejs.org |
| "Port 8080 already in use" | server.js mein PORT change karein |
| Blank page | `setup.bat` dobara chalayein |
| Data gayab | Check karein `data/millentry-data.json` |
