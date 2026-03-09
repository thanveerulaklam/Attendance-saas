# Test Guide: Backend vs Frontend URLs

Use this guide to see which URLs work and decide what to use for backend and frontend (same domain vs split).

---

## What You’re Testing

| URL | Role |
|-----|------|
| **https://punchpay.in** | Frontend + Backend API (Node) – HTTPS via Nginx proxy |

---

## Part 1: Test Backend API (from your Mac)

Run these in **Terminal**. Replace the URL in each command with the one you’re testing.

### Test 1 – Health (no auth)

```bash
# Backend on domain (HTTPS)
curl -s -o /dev/null -w "%{http_code}" https://punchpay.in/api/health
```

- **200** = that URL works for the API.  
- **000** or timeout = can’t reach.  
- **404** = path not found (wrong server or no `/api` proxy).  
- **502/503** = proxy error or backend down.

### Test 2 – Login (API really works)

```bash
# Replace URL with the base (no /api/auth/login), e.g. https://punchpay.in
curl -s -X POST https://punchpay.in/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@mzoneapps.com","password":"test"}' | head -c 200
```

- You should see JSON (e.g. `{"success":true,"data":{...}}` or an error message).  
- If you get empty, timeout, or HTML (e.g. “page not found”), that URL is not serving your API.

**Write down:**

- [ ] `https://punchpay.in` → Health: _____  Login: _____

---

## Part 2: Test Frontend in the Browser

### Test 3 – Open frontend

1. Open in the browser:
   - **A:** `https://punchpay.in`
2. You should see the **login page** (not a blank page or “connection not secure” you can’t bypass).

Note which URL(s) show the app: _____  

### Test 4 – Login and use the app

1. On the URL that shows the app, log in with your real email/password.
2. After login, open **DevTools** (F12 or Right‑click → Inspect) → **Network** tab.
3. Click around (e.g. Dashboard, Employees). Watch the **Request URL** of API calls.

- If API calls go to **same host** as the page (e.g. both `punchpay.in`) → frontend is using “same domain” for API.

**Write down:**

- [ ] Frontend URL I used: _________________________  
- [ ] API calls in Network tab go to: _________________________

---

## Part 3: Test Connector

The connector only needs the **backend API** URL (it doesn’t care about the frontend).

1. In **connector** `config.json` set:
   ```json
   "backendUrl": "http://143.110.251.182"
   ```
2. Run the connector (or wait for next poll). Check `connector.log` for “Pushed … logs” or “Backend unreachable”.

3. Then change to:
   ```json
   "backendUrl": "https://payroll.mzonetechnologies.com"
   ```
4. Run again and check the log.

**Write down:**

- [ ] `http://143.110.251.182` → Connector: _____ (works / fails)  
- [ ] `https://payroll.mzonetechnologies.com` → Connector: _____ (works / fails)

---

## Part 4: Decide What to Keep

Use this table after you’ve done the tests.

| Scenario | Backend URL to use | Frontend URL to use | Notes |
|----------|--------------------|----------------------|--------|
| **API works only on IP** | `http://143.110.251.182` | Whatever shows the app (IP or payroll.mzone). If frontend is on **HTTPS** (payroll.mzone), frontend must call the **same HTTPS domain** for API (see below) or you’ll get mixed content. | Connector: use `http://143.110.251.182`. |
| **API works on payroll.mzone (HTTPS)** | `https://payroll.mzonetechnologies.com` | `https://payroll.mzonetechnologies.com` | Same domain for both. Connector can use `https://payroll.mzonetechnologies.com` if you want. |
| **Same server, proxy not set up yet** | Backend runs on 143 (or localhost). Put **Nginx (or Caddy)** in front: SSL for **payroll.mzonetechnologies.com**, proxy `/api` to Node. | `https://payroll.mzonetechnologies.com` | After proxy + SSL, “backend” = https://payroll.mzonetechnologies.com/api. |

### Simple choice after testing

- **If** `http://143.110.251.182` works for API **and** `https://payroll.mzonetechnologies.com` does **not** work for API:
  - **Backend:** keep **http://143.110.251.182** for the connector and for the server (Node) itself.
  - **Frontend:** use **https://payroll.mzonetechnologies.com** only if that’s where you serve the app. Then the **browser** must call the API at the same origin (so you need Nginx to proxy `https://payroll.mzonetechnologies.com/api` → `http://143.110.251.182` or → localhost:3000). Otherwise the browser will block HTTP calls from an HTTPS page (mixed content).
- **If** after setting up Nginx + SSL both work:
  - Use **https://payroll.mzonetechnologies.com** for **both** frontend and backend (backend = that domain + `/api`). Connector can use either `https://payroll.mzonetechnologies.com` or `http://143.110.251.182` (if Nginx listens on 80/443 and proxies to Node).

---

## Quick Checklist

- [ ] Part 1: Health + Login for `http://143.110.251.182` and for `https://payroll.mzonetechnologies.com`
- [ ] Part 2: Open frontend, login, check Network tab for API URL
- [ ] Part 3: Connector with each backendUrl, check connector.log
- [ ] Part 4: Fill the table and choose backend URL + frontend URL (same or split)

After this you’ll know: **which URL to keep for backend, which for frontend, and whether to use the same for both.**
