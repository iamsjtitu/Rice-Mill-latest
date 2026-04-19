# MillEntry Central License Server

Standalone portable Node.js server for managing licenses and customer subscriptions of the MillEntry Rice Mill System.

---

## Quick Start (VPS Deployment — ~5 minutes)

### Prerequisites
- VPS with Ubuntu 22.04+ (or any Linux) and SSH access
- Node.js 18+ installed (`curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs`)
- Cloudflare Tunnel already created for `admin.9x.design` pointing to `http://localhost:7000`

### 1. Upload this folder to VPS
```bash
scp -r central-license-server/ root@your-vps:/opt/millentry-license/
ssh root@your-vps
cd /opt/millentry-license
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
nano .env
# Set JWT_SECRET to a strong random string (32+ characters)
# Recommended: generate with `openssl rand -hex 32`
```

### 4. Seed super admin and master license
```bash
node seed.js
```

Expected output:
```
[Seed] Super admin created: t2@host9x.com
[Seed] Master license created: 9X-NVKR-OWNR-MSTR-2099
```

### 5. Run the server
```bash
# For testing
npm start

# For production — use PM2 to auto-restart on crash/reboot
npm install -g pm2
pm2 start server.js --name millentry-license
pm2 save
pm2 startup  # follow the instructions shown
```

### 6. Test
Open `https://admin.9x.design/` in browser. Login with:
- Email: `t2@host9x.com`
- Password: `We@1992!`

(Change password after first login via dashboard — feature coming in Phase 2.)

---

## API Endpoints

### Super Admin (authenticated with JWT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login — returns JWT |
| `GET` | `/api/auth/me` | Verify current token |
| `GET` | `/api/admin/licenses` | List all licenses (query: `status`, `search`) |
| `POST` | `/api/admin/licenses` | Create a new license |
| `PUT` | `/api/admin/licenses/:id` | Update license details |
| `POST` | `/api/admin/licenses/:id/revoke` | Revoke license (customer blocked) |
| `POST` | `/api/admin/licenses/:id/reset-machine` | Reset machine binding |
| `GET` | `/api/admin/stats` | Dashboard counters |

### Public (called by customer desktop-apps)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/license/activate` | First-time activation — body: `{key, machine_fingerprint, pc_info}` |
| `POST` | `/api/license/heartbeat` | Daily heartbeat — body: `{key, machine_fingerprint}` |

---

## Key Concepts

### License Key Format: `9X-XXXX-XXXX-XXXX-XXXX`
- Prefix `9X` (brand)
- Three random 4-char segments (crypto-secure, unambiguous charset)
- Final 4-char checksum (SHA-256 of prefix + blocks)
- Checksum prevents typo — server validates format before DB lookup

### Loose Machine Binding
- One license = one active PC at a time
- New activation on a different PC **kicks off** the previous one (next heartbeat)
- Good for customers who upgrade PCs without calling support

### 30-Day Offline Grace
- Desktop-app validates license on activation + every 24h
- Stored heartbeat timestamp on central server
- If no heartbeat for 30 days → license treated as inactive on next startup
- Forces at least 1 internet connection per month

### Master License
- Seeded flag `is_master: true` for owner's personal license
- Shown with orange "MASTER" badge in dashboard
- Cannot be revoked from UI (safety)

---

## Customizing

### Add more super admins
Edit `seed.js`, add another entry in the seed script, re-run `node seed.js`.

### Change port
Edit `.env`:
```
PORT=8080
```

### Change database file location
Edit `.env`:
```
DB_FILE=/var/lib/millentry/license.json
```

### Backup
Simply copy `database.json` periodically:
```bash
cp database.json backups/license-$(date +%F).json
```

Or set up a cron:
```cron
0 3 * * * cp /opt/millentry-license/database.json /opt/millentry-license/backups/license-$(date +\%F).json
```

---

## Production Checklist

- [ ] Strong `JWT_SECRET` in `.env` (`openssl rand -hex 32`)
- [ ] PM2 auto-start configured
- [ ] Cloudflare Tunnel running and stable
- [ ] Firewall rule: block port 7000 from public, allow only from cloudflared
- [ ] Daily backup cron for `database.json`
- [ ] Test activation from a customer desktop-app
- [ ] Change super admin password via dashboard (feature coming in Phase 2)

---

## Security Notes

- `database.json` contains bcrypt-hashed passwords — never expose publicly
- JWT tokens expire after 12 hours — customers must re-login
- All admin routes require `Authorization: Bearer <token>` header
- Public license routes are rate-limit-able at Cloudflare level if abuse is detected

---

Built for MillEntry Rice Mill System (v104.24+) — supports license-gated desktop-app distribution.
