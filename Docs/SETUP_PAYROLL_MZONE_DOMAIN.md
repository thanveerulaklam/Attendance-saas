# Fix: payroll.mzonetechnologies.com not opening

DNS already points to **143.110.251.182**. The site doesn’t open because the VPS isn’t configured to respond for that hostname. Do the following **on the VPS** (SSH into 143.110.251.182).

---

## 1. Check Nginx and project paths

```bash
# Nginx installed?
nginx -v

# Frontend built and path exists?
ls /var/www/Attendance-saas/frontend/dist/index.html

# Backend running?
pm2 status
```

If Nginx isn’t installed: `apt update && apt install -y nginx`  
If `frontend/dist` doesn’t exist: `cd /var/www/Attendance-saas/frontend && npm install && npm run build`  
If backend isn’t running: `cd /var/www/Attendance-saas/backend && pm2 start ecosystem.config.js --env production`

---

## 2. Create Nginx config for payroll.mzonetechnologies.com

```bash
sudo nano /etc/nginx/sites-available/payroll-mzone
```

Paste this (path is for `/var/www/Attendance-saas`; change if your project is elsewhere).

If you already have another Nginx site that defines `upstream attendance_api`, use **only the `server { ... }` block** below (omit the `upstream` block) so both sites share the same upstream.

```nginx
upstream attendance_api {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name payroll.mzonetechnologies.com;

    root /var/www/Attendance-saas/frontend/dist;
    index index.html;

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

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Save (Ctrl+O, Enter, Ctrl+X).

---

## 3. Enable the site and reload Nginx

```bash
sudo ln -sf /etc/nginx/sites-available/payroll-mzone /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. Test (HTTP)

Open in browser: **http://payroll.mzonetechnologies.com**

You should see the app. Login and API will work (same origin).

---

## 5. Add HTTPS (optional but recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d payroll.mzonetechnologies.com
```

Then on the VPS, set in backend `.env`:

```env
CORS_ORIGIN=https://payroll.mzonetechnologies.com
```

Restart backend:

```bash
pm2 restart attendance-api
```

After that, use **https://payroll.mzonetechnologies.com**.

---

## Connector

- **backendUrl** can stay **http://143.110.251.182** (works from anywhere).
- Or use **https://payroll.mzonetechnologies.com** after SSL is set up.

Both are valid; 143 is simpler if you don’t need the connector to use the domain.
