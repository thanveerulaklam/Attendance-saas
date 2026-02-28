# Deploy Attendance SaaS to VPS (Hostinger, DigitalOcean, etc.)

Step-by-step guide to deploy the app to an Ubuntu VPS for real-world testing.

---

## DigitalOcean Quick Start

If you're using **DigitalOcean**, follow these steps first to create your Droplet, then continue with the main steps below.

### 1. Create a DigitalOcean Account

Sign up at [digitalocean.com](https://www.digitalocean.com) if you haven't already.

### 2. Create a Droplet

1. Log in → **Create** → **Droplets**
2. **Image:** Choose **Ubuntu 22.04 LTS**
3. **Plan:** Basic → **Regular** → **$6/mo** (1 GB RAM) for testing, or **$12/mo** (2 GB RAM) for production
4. **Region:** Pick one closest to your users (e.g. NYC, SFO, LON)
5. **Authentication:**
   - **SSH key (recommended):** Add your public key (paste from `~/.ssh/id_rsa.pub` or `~/.ssh/id_ed25519.pub` on Mac)
   - Or use **Password** for quick setup
6. **Hostname:** e.g. `attendance-saas`
7. Click **Create Droplet**

### 3. Get Your Droplet IP

Once created, note the **IP address** (e.g. `164.90.xxx.xxx`). You'll use this everywhere `YOUR_VPS_IP` appears below.

### 4. Connect via SSH

```bash
# If you used SSH key:
ssh root@YOUR_DROPLET_IP

# If you used password, you'll be prompted for it after running the above
```

If you get "Permission denied", ensure your SSH key was added correctly or use the password emailed to you.

### 5. Optional: Add a Domain in DigitalOcean

If you have a domain:

1. **Networking** → **Domains** → **Add Domain**
2. Enter your domain (e.g. `yourdomain.com`) and point your registrar's nameservers to DigitalOcean:
   - `ns1.digitalocean.com`
   - `ns2.digitalocean.com`
   - `ns3.digitalocean.com`
3. Add an **A record**: `@` → your Droplet IP
4. Add `www` → your Droplet IP (optional)

---

## What You'll Have at the End

- **App URL:** https://yourdomain.com (or your VPS IP for testing)
- **One server** running: Nginx (reverse proxy) + Node.js backend + React frontend + PostgreSQL
- **Connector** at client sites points `backendUrl` to your API → punches sync to cloud

---

## Prerequisites

- A VPS with Ubuntu 22.04 (Hostinger, DigitalOcean, Linode, etc.)
- SSH access (IP, username, password or key)
- (Optional) A domain pointed to your VPS IP for HTTPS

---

## Step 1: Connect to Your VPS

From your Mac terminal (use your Droplet IP if you created one on DigitalOcean):

```bash
ssh root@YOUR_VPS_IP
```

Replace `YOUR_VPS_IP` with your server IP (e.g. `164.90.xxx.xxx` for DigitalOcean).

---

## Step 2: Update System & Install Dependencies

Run these on the VPS:

```bash
apt update && apt upgrade -y
apt install -y curl git nginx postgresql postgresql-contrib
```

**Open firewall (DigitalOcean & others):** Allow HTTP/HTTPS and SSH:

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

---

## Step 3: Install Node.js 18

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
node -v   # should show v18.x
```

---

## Step 4: Create PostgreSQL Database & User

```bash
sudo -u postgres psql
```

Inside PostgreSQL, run (replace `your_db_password` with a strong password):

```sql
CREATE USER attendance_user WITH PASSWORD 'your_db_password';
CREATE DATABASE attendance_saas OWNER attendance_user;
\q
```

---

## Step 5: Clone the Project on the VPS

```bash
cd /var/www
git clone https://github.com/YOUR_USERNAME/Attendance-saas.git
# Or: upload via SCP / SFTP if the repo is private
```

If you don't have a Git repo yet, you can upload the project folder via SCP:

```bash
# From your Mac (in the project folder):
scp -r /Users/thanveerulaklam/Desktop/Projects/Attendance-saas root@YOUR_VPS_IP:/var/www/
```

---

## Step 6: Backend Setup

```bash
cd /var/www/Attendance-saas/backend
npm install
```

Create `.env`:

```bash
nano .env
```

Paste (edit the values):

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://yourdomain.com

DB_HOST=localhost
DB_PORT=5432
DB_NAME=attendance_saas
DB_USER=attendance_user
DB_PASSWORD=your_db_password
DB_POOL_MAX=20

JWT_SECRET=generate-a-long-random-string-here-use-openssl-rand-hex-32
ADMIN_APPROVAL_SECRET=your-admin-secret
```

Save: Ctrl+O, Enter, Ctrl+X.

Run migrations:

```bash
npm run migrate
```

(Optional) Seed test data:

```bash
npm run seed
```

---

## Step 7: Frontend Build

```bash
cd /var/www/Attendance-saas/frontend
npm install
npm run build
```

This creates `dist/` with static files. We'll serve these with Nginx.

---

## Step 8: Run Backend with PM2

```bash
npm install -g pm2
cd /var/www/Attendance-saas/backend
mkdir -p logs
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # run the command it outputs to enable on boot
```

Check: `pm2 status` — should show `attendance-api` as online.

---

## Step 9: Configure Nginx

Create Nginx config:

```bash
nano /etc/nginx/sites-available/attendance
```

Paste (replace `yourdomain.com` with your domain or use `_` for IP-only):

```nginx
upstream attendance_api {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    # For IP-only: use server_name _;

    root /var/www/Attendance-saas/frontend/dist;
    index index.html;

    # API proxy
    location /api {
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_pass http://attendance_api;
        proxy_read_timeout 60s;
        client_max_body_size 5M;
    }

    # React SPA - serve index.html for all other routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and test:

```bash
ln -sf /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default   # optional, removes default site
nginx -t
systemctl reload nginx
```

---

## Step 10: Test

- **Without domain:** Open `http://YOUR_VPS_IP` in a browser.
- **With domain:** Open `http://yourdomain.com`.

You should see the login/register page. Log in or register to confirm the API works.

---

## Step 11: Add SSL (HTTPS) – Recommended

Install Certbot:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts. Certbot will auto-configure HTTPS and renewal.

After SSL, update backend `.env`:

```env
CORS_ORIGIN=https://yourdomain.com
```

Then: `pm2 restart attendance-api`

---

## Step 12: Connector & Client Setup

Clients use the **connector** with `backendUrl` pointing to your API:

- **HTTP (for testing):** `http://YOUR_VPS_IP`
- **HTTPS (production):** `https://yourdomain.com` or `https://api.yourdomain.com` if you use a separate API subdomain

In their `config.json`:

```json
{
  "backendUrl": "https://yourdomain.com"
}
```

The connector sends punches to `https://yourdomain.com/api/device/push` (API key in header).

---

## Deploying Updates

When you change the app locally, deploy like this.

### Using Git (recommended)

1. **On your Mac:** Commit and push to your repo.
2. **On the server (SSH):**

```bash
cd /var/www/Attendance-saas
git pull

# Backend changes (or if package.json changed):
cd backend && npm install && pm2 restart attendance-api

# Frontend changes (or if package.json changed):
cd /var/www/Attendance-saas/frontend && npm install && npm run build
```

If you only changed backend code, you can skip the frontend steps. If you only changed frontend code, skip the backend steps. Run migrations only if you added new ones: `cd backend && npm run migrate`.

### Without Git (upload then build)

1. **On your Mac:** Sync code (no `node_modules` or `.git`):

```bash
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='frontend/dist' \
  /Users/thanveerulaklam/Desktop/Projects/Attendance-saas/ root@YOUR_VPS_IP:/var/www/Attendance-saas/
```

2. **On the server:** Same as above — `npm install` where needed, `npm run build` in frontend, `pm2 restart attendance-api`.

---

## Quick Reference

| Item        | Location / Command                          |
|------------|---------------------------------------------|
| Backend    | `/var/www/Attendance-saas/backend`          |
| Frontend   | `/var/www/Attendance-saas/frontend/dist`    |
| Restart API| `pm2 restart attendance-api`                |
| Logs       | `pm2 logs attendance-api`                  |
| Nginx      | `systemctl reload nginx`                    |

---

## Troubleshooting

**502 Bad Gateway**
- Backend not running: `pm2 status` and `pm2 restart attendance-api`
- Wrong port: backend must run on 3000 (or update upstream in Nginx)

**Can't connect to database**
- Check `.env` DB_* values
- PostgreSQL running: `systemctl status postgresql`
- Test: `psql -U attendance_user -d attendance_saas -h localhost`

**CORS errors**
- Set `CORS_ORIGIN` in `.env` to your frontend URL (e.g. `https://yourdomain.com`)
- Restart: `pm2 restart attendance-api`

**Connector can't reach API**
- Open firewall port 80 (and 443): `ufw allow 80 && ufw allow 443 && ufw enable`
- Ensure `backendUrl` in connector config has no trailing slash
