# v88.9.0 - View Dialog + Round-off Fix + Date Format

## New Features
- **Mill Entries View Button** - Eye icon se entry ki poori details dialog popup mai dikhega
- **PPR → Mill Entry Redirect** - Paddy Purchase Register mai row click karo toh Mill Entries mai redirect hoke View dialog khulega (kisi bhi date ki entry ho)
- **Google Drive Sync Detect** - Dusre PC ka data ab 5 second mai auto-reload hoga (File Watcher)

## Bug Fixes  
- **Round-off Fix (Desktop + LAN)** - Ab har payment amount round hoga: 4000.51 = 4001, 4000.50 = 4000. Pehle `roundAmount(val*100)/100` pattern se kuch round nahi hota tha
- **Date Format Fix** - Sabhi Excel/PDF export mai date DD-MM-YYYY format (pehle YYYY-MM-DD tha)
- **Python round_amount Fix** - `round_amount(val, 2)` TypeError fix kiya (72 places)

## Build Instructions (Windows)
```bash
cd desktop-app
npm run build
```
