# eSSL SilkBio 101 TC – Connect and test

Your device uses the **ZMM220_TFT** platform (ZKTeco protocol). The backend supports **two ways** to get attendance into your SaaS:

| Model | Best for | Installation |
|-------|----------|--------------|
| **Direct Cloud Push** | Most customers, low maintenance | Configure device “Cloud server” → done |
| **Connector (on-site)** | LAN-only devices, or when Direct Push isn’t supported | Run connector on a PC/Mac on-site |

**Recommendation:** Use **Direct Cloud Push** first. Use the Connector only for devices that can’t push to the cloud (old firmware, no internet at device, etc.).

---

# Part A: Direct Cloud Push (recommended)

No on-site software. The device sends each punch to your cloud over HTTP.

## 1. Device: Ethernet + internet

- Connect the device to the **router** with Ethernet (same network that has **internet**).
- On the device: **Communication → Ethernet** → set IP, subnet, gateway (router IP). Port can stay default.
- Ensure the device can reach the internet (e.g. gateway is the router).

## 2. App: Create device and copy API key

1. In your app (cloud or local), go to **Devices**.
2. **Add a device** (e.g. “eSSL SilkBio 101 TC”) and **copy the API key**.

## 3. Device: Cloud server setting

On the biometric device:

1. Go to **Communication → Cloud server setting** (or **Server** / **Push** – name may vary).
2. **Server URL:** your cloud API webhook URL with the API key in the query:

   ```text
   https://your-api-domain.com/api/device/webhook?key=PASTE_DEVICE_API_KEY_HERE
   ```

   Example (replace with your real domain and key):

   ```text
   https://api.attendancesaas.com/api/device/webhook?key=a1b2c3d4...
   ```

3. If the device has a **“Ping”** or **“Get request”** URL, set it to:

   ```text
   https://your-api-domain.com/api/device/ping
   ```

4. Save. The device will push each punch to the webhook and optionally ping for connectivity.

## 4. Employee codes

- On the device, each user has a **User ID** (or PIN).
- In your app, each employee has an **employee_code**.
- **They must match.** Use the same value (e.g. `EMP001`, `26`) on both so punches are accepted.

## 5. Supported webhook payloads

The backend accepts:

- **Query auth:** `?key=DEVICE_API_KEY` (use this in Cloud server URL).
- **JSON (single punch):** `{ "userId": "26", "punchTime": "2026-02-27T10:30:00", "state": 0 }` — `state`: 0 = in, 1 = out.
- **JSON (batch):** `{ "logs": [{ "employee_code": "26", "punch_time": "...", "punch_type": "in" }, ...] }`.
- **ZKTeco tab-separated (text/plain):** `USER_PIN\tDATETIME\tSTATE\t...` — e.g. `26\t2026-02-27 10:30:00\t0\t15`.

Unknown employees are skipped (partial push); known ones are stored and device **Last seen** is updated.

---

# Part B: Connector (on-site agent) – optional

Use when the device **cannot** push to the cloud (LAN-only, no HTTP push support, or you prefer pull).

## 1. Device: Ethernet only

- **Communication → Ethernet:** set IP, subnet, gateway, port **4370**. Do **not** use Cloud server setting.
- Verify from a PC on the same LAN: `ping <device-ip>`.

## 2. App: Create device and copy API key

Same as Part A: **Devices → Add device → Copy API key.**

## 3. Connector machine (on-site)

- One PC/Mac or Raspberry Pi on the **same LAN** as the device, with **internet** to reach your cloud.
- In the project **backend** folder, set `.env`:

  ```env
  BIOMETRIC_DEVICE_IP=<device-ip>
  BIOMETRIC_DEVICE_PORT=4370
  DEVICE_API_KEY=<paste API key>
  BACKEND_URL=https://your-api-domain.com
  BIOMETRIC_POLL_INTERVAL_MS=60000
  ```

- Run once: `npm run connector:once`  
  Or run continuously: `npm run connector`

The connector pulls logs from the device (TCP) and pushes them to `BACKEND_URL/api/device/push`.

## 4. Employee codes

Same as Part A: device User ID must match **employee_code** in the app.

---

# SaaS summary

| Goal | Approach |
|------|----------|
| **Use app from anywhere** | Host frontend + backend in the **cloud** (e.g. Hostinger VPS). |
| **Get punches into cloud** | Prefer **Direct Cloud Push**: set device “Cloud server” URL to `https://your-api.com/api/device/webhook?key=...`. No on-site software. |
| **When Direct Push isn’t possible** | Use **Connector** at each site: run connector with `BACKEND_URL` = cloud API; device uses Ethernet only. |

- **Direct Push:** Device → Internet → Your VPS → DB → Web app. No PC dependency, low support.
- **Connector:** Device (LAN) ↔ Connector (on-site) → Cloud. Use for legacy or LAN-only devices.

---

---

# Local testing (step-by-step)

Use this to verify the full flow on your Mac before deploying to a cloud server.

## Prerequisites (do once)

1. **Backend and frontend run locally**
   - Backend: `cd backend && npm run dev` (listens on `http://localhost:3000`).
   - Frontend: `cd frontend && npm run dev` (e.g. `http://localhost:5173`).

2. **Device on the same Wi‑Fi/LAN**
   - Biometric device connected via Ethernet to your router (same network as your Mac).
   - On the device: **Communication → Ethernet** — set IP (e.g. `192.168.29.50`), subnet, gateway. Port **4370** if you will use the Connector.

3. **App data**
   - Log in to the app at `http://localhost:5173`.
   - **Employees:** Add at least one employee and set **employee_code** (e.g. `26` or `EMP001`). Remember this — it must match the device User ID.
   - **Devices:** Add a device (e.g. “eSSL SilkBio 101 TC”), **copy the API key** and keep it somewhere (e.g. Notepad).

You can test in two ways: **Connector** (easiest, no extra tools) or **Direct Push** (needs ngrok so the device can reach your Mac).

---

## Option 1: Test with Connector (easiest)

No ngrok. The connector runs on your Mac and pushes to `localhost`.

### Step 1: Backend must be running

In a terminal:

```bash
cd backend
npm run dev
```

Leave it running. You should see something like “Database connected” and the server listening on port 3000.

### Step 2: Set connector env

In the **backend** folder, open `.env` and set (use your device IP and the API key you copied):

```env
BIOMETRIC_DEVICE_IP=192.168.29.50
BIOMETRIC_DEVICE_PORT=4370
DEVICE_API_KEY=<paste the API key from the app>
BACKEND_URL=http://localhost:3000
```

Save the file.

### Step 3: Run the connector once

Open a **second** terminal:

```bash
cd backend
npm run connector:once
```

You should see:

- `Connected to device at 192.168.29.50:4370`
- `Pushed N logs to backend.` (and maybe “Cleared attendance logs from device”)

If you see **Unknown employee_code**, add that employee in the app with the same **employee_code** as the User ID on the device, then run `npm run connector:once` again.

### Step 4: Check the app

1. In the browser, go to **Attendance** (daily or monthly view).
2. Confirm that punches appear for the right employees and dates.
3. In **Devices**, the device’s **Last seen** should be updated.

**Optional:** To sync every 60 seconds, run `npm run connector` (no `:once`) in the second terminal and leave it running.

---

## Option 2: Test Direct Push with ngrok

The device will send punches to your backend over the internet. Your Mac is exposed temporarily via ngrok.

### Step 1: Install ngrok

- Go to [ngrok.com](https://ngrok.com), sign up (free), and download ngrok.
- Or with Homebrew: `brew install ngrok`
- Log in: `ngrok config add-authtoken YOUR_TOKEN` (get the token from the ngrok dashboard).

### Step 2: Start the backend

In a terminal:

```bash
cd backend
npm run dev
```

Leave it running (port 3000).

### Step 3: Expose port 3000 with ngrok

In a **second** terminal:

```bash
ngrok http 3000
```

You’ll see a line like:

```text
Forwarding   https://abc123.ngrok-free.app -> http://localhost:3000
```

Copy the **HTTPS** URL (e.g. `https://abc123.ngrok-free.app`). This is your temporary public URL for the backend.

### Step 4: Build the webhook URL with your API key

Format:

```text
https://YOUR_NGROK_URL/api/device/webhook?key=YOUR_DEVICE_API_KEY
```

Example (replace with your ngrok host and key):

```text
https://abc123.ngrok-free.app/api/device/webhook?key=a1b2c3d4e5f6...
```

Ping URL (if the device has a “Ping” or “Get request” field):

```text
https://abc123.ngrok-free.app/api/device/ping
```

### Step 5: Configure the device (Cloud server setting)

On the biometric device:

1. Go to **Communication → Cloud server setting** (or **Server** / **Push**).
2. **Server URL:** paste the webhook URL from Step 4 (with `?key=...`).
3. **Ping URL (if available):** paste the ping URL.
4. Save.

Make sure the device has **internet** (gateway = router, router has internet).

### Step 6: Test a punch

1. On the device, do a fingerprint (or face) punch with a user whose **User ID** matches an **employee_code** in your app.
2. Within a few seconds the device should POST to your webhook. Check the **first** terminal (backend): you should see a `POST /api/device/webhook` request.
3. In the app, open **Attendance** and confirm the new punch appears.
4. In **Devices**, **Last seen** for that device should update.

### Step 7: Stop ngrok when done

In the terminal where ngrok is running, press **Ctrl+C**. The URL will stop working until you run `ngrok http 3000` again (you’ll get a new URL each time on the free tier unless you use a reserved domain).

---

## Quick comparison (local testing)

| | Connector | Direct Push (ngrok) |
|---|----------|---------------------|
| Extra tools | None | ngrok |
| Device config | Ethernet only (no Cloud server) | Ethernet + Cloud server URL |
| Where connector runs | Your Mac | Not needed |
| Good for | Quick test, no internet from device | Testing real “device → cloud” flow |

---

# Quick reference

- **Webhook (Direct Push):** `POST /api/device/webhook` — auth: `?key=API_KEY` or header `x-device-key`.
- **Ping (device health):** `GET /api/device/ping` → responds `OK`.
- **Connector push:** `POST /api/device/push` — auth: header `x-device-key`, body `{ "logs": [...] }`.
- **Employee codes:** Must match between device User ID and app `employee_code`.
