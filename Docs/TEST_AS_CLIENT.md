# Test the biometric flow as a client (DigitalOcean + Mac + device)

You have: **app on DigitalOcean**, **biometric machine**, **MacBook**.  
Follow these steps exactly as a client would.

---

## What you need before starting

- Your **DigitalOcean app URL** (e.g. `https://your-app.ondigitalocean.app` or `http://YOUR_DROPLET_IP`)
- Biometric device connected to the **same Wi‑Fi/router** as your Mac (or same network via Ethernet)
- Device **Ethernet** already set: IP (e.g. 192.168.29.50), subnet, gateway, port **4370**

---

## Step 1: Open the app and log in

1. On your Mac, open a browser and go to your **deployed app URL** (e.g. `https://your-app.ondigitalocean.app`).
2. **Register** a new company (or **Log in** if you already have an account).
3. Complete login so you see the **Dashboard** (sidebar: Dashboard, Employees, Attendance, Devices, etc.).

---

## Step 2: Add employees (match device User IDs)

1. In the sidebar, click **Employees**.
2. Click **Add employee** (or similar).
3. Add at least one employee and set **Employee code** to the **same value** as on the biometric device.
   - Example: if on the device the user is enrolled as **52**, set **Employee code** = **52**.
   - Add any other employees that exist on the device (same code on both sides).
4. Save.

---

## Step 3: Register the biometric device in the app

1. In the sidebar, click **Devices**.
2. Click **Add device**.
3. Give it a name (e.g. **Main gate** or **eSSL SilkBio**).
4. After saving, the app shows the **API key** for this device.
5. **Copy the API key** and keep it somewhere (Notepad/Notes). You will use it in the connector config.

---

## Step 4: Build the connector (one-time, on your Mac)

You’ll use the **same connector app** that clients install (no Node.js or project .env on the “client” machine).

1. Open **Terminal** and go to the project’s **connector** folder:

```bash
cd /Users/thanveerulaklam/Desktop/Projects/Attendance-saas/connector
```

2. Build the Mac version (if you haven’t already):

```bash
npm install
npm run build:mac
```

3. After the build, you’ll have **dist/connector-mac** in the `connector` folder.

---

## Step 5: Set up the connector like a client

1. Create a folder for the connector (e.g. on Desktop):

```bash
mkdir -p ~/Desktop/AttendanceConnector
```

2. Copy these files into **~/Desktop/AttendanceConnector**:
   - **connector-mac** (from `connector/dist/connector-mac`)
   - **config.example.json** (from `connector/config.example.json`)
   - **install-mac.sh** (from `connector/install-mac.sh`)
   - **SETUP_GUIDE_CLIENTS.txt** (from `connector/SETUP_GUIDE_CLIENTS.txt`) — optional, for reference

3. In the AttendanceConnector folder, rename the config:

```bash
cd ~/Desktop/AttendanceConnector
mv config.example.json config.json
```

4. Edit **config.json** (TextEdit or any editor). Set:
   - **deviceIp**: your biometric device IP (e.g. `192.168.29.50`) — from Communication → Ethernet on the device
   - **deviceApiKey**: the **API key** you copied in Step 3 (from the app → Devices)
   - **backendUrl**: your **DigitalOcean app URL** (e.g. `https://your-app.ondigitalocean.app`) — **no trailing slash**

Example:

```json
{
  "deviceIp": "192.168.29.50",
  "devicePort": 4370,
  "deviceApiKey": "paste_the_exact_api_key_from_step_3",
  "backendUrl": "https://your-app.ondigitalocean.app",
  "pollIntervalMs": 60000
}
```

5. Save the file.

---

## Step 6: Run the connector (one-time test)

1. In Terminal:

```bash
cd ~/Desktop/AttendanceConnector
chmod +x connector-mac
./connector-mac --once
```

2. You should see:
   - `Connected to device at 192.168.29.50:4370`
   - `Pushed N logs to backend.`
   - If you see **Unknown employee_code**, add that employee in the app with the same code and run `./connector-mac --once` again.

---

## Step 7: Check attendance in the app

1. In the browser, open your **DigitalOcean app** (same URL as Step 1).
2. Click **Attendance** in the sidebar.
3. Check **Today’s summary** and **monthly view**: punches for the employees you added (same codes as on the device) should appear.

---

## Step 8 (optional): Install so it runs automatically (like a real client)

1. In Terminal:

```bash
cd ~/Desktop/AttendanceConnector
chmod +x install-mac.sh
./install-mac.sh
```

2. The connector will start now and **start automatically every time you log in** to your Mac.
3. Do a **new punch** on the device; within about 60 seconds it should appear in **Attendance** in the app.
4. Log file: `~/Desktop/AttendanceConnector/connector.log`

---

## Checklist (client flow with connector app)

- [ ] Opened deployed app URL and logged in  
- [ ] Added employees with **employee_code** = device User ID  
- [ ] Devices → Add device → **Copied API key**  
- [ ] Built connector (`npm run build:mac` in `connector` folder)  
- [ ] Created folder and copied **connector-mac**, **config.example.json**, **install-mac.sh**  
- [ ] Renamed to **config.json** and set **deviceIp**, **deviceApiKey**, **backendUrl**  
- [ ] Ran `./connector-mac --once` and saw “Connected” and “Pushed N logs”  
- [ ] Checked **Attendance** in the app and saw punches  
- [ ] (Optional) Ran **install-mac.sh** for auto-start at login  

---

## If something fails

| Issue | What to do |
|-------|------------|
| **Push failed 401** | Wrong or missing API key. Copy the key again from the app (Devices) and update **deviceApiKey** in **config.json**. |
| **Push failed 400 – Unknown employee_code** | That user exists on the device but not in the app, or the code doesn’t match. Add an employee with the **same** code as on the device (or fix the code on the device). |
| **Socket isn’t connected / timeout** | Device unreachable. Check **deviceIp** in config.json, and `ping <deviceIp>` from the Mac. Ensure Mac and device are on the same network. |
| **Push failed – network / ECONNREFUSED** | App URL wrong or backend down. Check **backendUrl** in config.json (no trailing slash), and that the DigitalOcean app opens in the browser. |
| **config.json not found** | Run the connector from the **same folder** that contains config.json (e.g. `cd ~/Desktop/AttendanceConnector` then `./connector-mac --once`). |
| **CORS error in browser** | Backend on DigitalOcean: set **CORS_ORIGIN** to your app URL and restart the API. |
