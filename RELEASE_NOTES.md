# v42.1.0 - Duplicate Party Fix + Undo Button Restore

## Bug Fixes
- **Duplicate Party Name Fix** - "Kridha (Kesinga) - Kesinga" jaisa duplicate party name ab nahi banega. Consistent `_makePartyLabel` helper use ho raha hai
- **Payment Undo Button Restored** - Paddy Purchase ke Payment History dialog mein ab Undo button dikh raha hai (red icon)
- **Health Check Improved** - Auto-fix endpoint ab duplicate party names detect karke merge karta hai
- **Frontend Build Synced** - Latest frontend build desktop-app aur local-server dono mein sync kiya

## Improvements
- Undo+History combined orange button - jab payment ho toh main table mein dikhega
- Desktop/Local Server mein Mark Paid + Undo Paid logic puri tarah sync
- Orphan file `PrivateTrading.jsx` removed (1214 lines cleanup)

## Build Instructions (Windows)
```bash
cd desktop-app
npm install
npm run build:win
```
Ye `dist/` folder mein `.exe` installer + portable banayega.

## Previous (v42.0.0)
- Payment History mein Undo Payment button - Cash Book entries bhi auto-delete
- Round-off ab paid_amount mein sahi se add hota hai
- Double payment fix - Pay button disabled during save
- Tab key + Ctrl+S form navigation
