# Mill Entry System - Local Server Setup

## Windows PC par kaise chalayein

### Step 1: Node.js Install
1. https://nodejs.org/ par jao
2. **LTS version** download + install (Next-Next-Finish)

### Step 2: Code Download
- Emergent par **"Save to GitHub"** → GitHub se ZIP download → Extract

### Step 3: Setup (Pehli baar)
1. `local-server` folder kholein
2. **`setup.bat`** double-click karein
3. "Setup Complete!" dikhe to aage

### Step 4: App Start
1. **`start.bat`** double-click karein
2. Browser khulega: **http://localhost:8080**
3. Login: **admin / admin123**

---

## Data & Backup

| Item | Location |
|------|----------|
| Data file | `local-server/data/millentry-data.json` |
| Backups | `local-server/data/backups/` |
| Max backups | 7 (purane auto-delete) |

### Backup kaise lein?
- App mein: **Settings → Data Backup → Backup Now**
- Ya manually: `data` folder copy kar lo

### Restore kaise karein?
- App mein: **Settings → Data Backup → Restore button**
- Ya manually: backup file ko `millentry-data.json` naam de ke `data/` mein paste

---

## Login
| User | Password | Access |
|------|----------|--------|
| admin | admin123 | Full access |
| staff | staff123 | Limited (5 min edit window) |

## Port: **8080** | URL: **http://localhost:8080**

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Node.js not found" | nodejs.org se install karein |
| Port 8080 busy | server.js mein `PORT = 8081` karein |
| Blank page | setup.bat dobara chalayein |
