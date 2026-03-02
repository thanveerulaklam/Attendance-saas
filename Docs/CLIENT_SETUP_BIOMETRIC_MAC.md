# New client: Biometric device + Mac — setup and see punches in the app

Use this as a **new client** with a biometric device and a Mac. Goal: set up once, then see punches in the app.

---

## What you need before starting

- **App URL** (from your provider), e.g. **http://payroll.mzonetechnologies.com**
- **Biometric device** on the same office network as the Mac (Ethernet or same Wi‑Fi)
- **Device IP address** (set on the device: Communication → Ethernet → IP, e.g. `192.168.1.50`)
- **Mac** in the same office, with internet (to reach the app)

---

## Part 1: App setup (in the browser)

### 1.1 Log in or register

1. Open **http://payroll.mzonetechnologies.com** (or the URL your provider gave you).
2. **Register** (first time) or **Log in** with your email and password.

### 1.2 Add a device and copy the API key

1. In the sidebar, click **Devices**.
2. Click **Add device**.
3. Enter a name (e.g. “Office biometric”).
4. Click **Save** (or Add).
5. Find the new device in the list and click **Copy API key**.  
   Keep this key safe — you’ll paste it into the connector config.

### 1.3 Add employees (must match device User IDs)

Punches only show for people who exist in the app **and** whose **Employee code** matches the **User ID** on the biometric device.

1. In the sidebar, click **Employees**.
2. For each person who will punch on the device:
   - Click **Add employee** (or similar).
   - Fill **Name**, **Email**, etc.
   - In **Employee code**, enter **exactly** the same value as that person’s **User ID** on the biometric device (e.g. `26` or `EMP001`).
   - Save.

To find User IDs on the device: use the device menu (e.g. User management / User list) and note the **User ID** or PIN for each user.

---

## Part 2: Biometric device (network)

1. Connect the device to your office network (Ethernet to the same router/Wi‑Fi as the Mac).
2. On the device: **Communication → Ethernet** — set IP (e.g. `192.168.1.50`), subnet, gateway. Port is usually **4370** for ZKTeco-style devices.
3. Do **not** set “Cloud server” if you are using the connector (the Mac will pull from the device instead).

---

## Part 3: Connector on the Mac (one-time)

### 3.1 Create a folder and copy files

1. Create a folder, e.g. **AttendanceConnector** on the Desktop or in Documents.
2. Put these **3 files** in that folder (from your provider or the connector package):
   - **connector-mac** (the program)
   - **config.example.json**
   - **install-mac.sh**

### 3.2 Configure the connector

1. In the AttendanceConnector folder, **rename** `config.example.json` to **config.json**.
2. Open **config.json** in TextEdit (or any text editor).
3. Set these three values (keep the rest as-is):

| Field         | What to put |
|--------------|-------------|
| **deviceIp** | Your biometric device’s IP (e.g. `192.168.1.50`) |
| **deviceApiKey** | The API key you copied from the app (Devices → Copy key) |
| **backendUrl**   | Your app URL with no trailing slash, e.g. `http://payroll.mzonetechnologies.com` |

Example:

```json
{
  "deviceIp": "192.168.1.50",
  "devicePort": 4370,
  "deviceApiKey": "paste-the-api-key-here",
  "backendUrl": "http://payroll.mzonetechnologies.com",
  "pollIntervalMs": 60000
}
```

4. Save the file.

### 3.3 Install so it runs automatically

1. Open **Terminal** (Applications → Utilities → Terminal).
2. Go to the folder (type `cd ` and drag the **AttendanceConnector** folder into the window), then press Enter.
3. Run:

   ```bash
   chmod +x install-mac.sh
   ./install-mac.sh
   ```

4. You should see: **“SUCCESS: Connector is now running and will start automatically on Mac login.”**

The connector will:
- Pull new punches from the device about every 60 seconds.
- Send them to the app.
- Clear the device logs after a successful send (so only new punches stay on the device).

---

## Part 4: Where to see punches in the app

1. Log in at **http://payroll.mzonetechnologies.com**.
2. In the sidebar, click **Attendance**.
3. You’ll see:
   - **Daily view** — today’s in/out for each employee.
   - **Monthly view** — calendar-style view; choose month/year and optionally filter by employee.

Punches appear after:
- The person has punched on the device, and
- The connector has run (about every 60 seconds), and
- That person is added in **Employees** with **Employee code** = device **User ID**.

**Devices** page: your device should show **Last seen** updating regularly when the connector is running.

---

## Quick checklist

- [ ] Logged in / registered in the app
- [ ] **Devices** → Add device → **Copy API key**
- [ ] **Employees** → Add each staff with **Employee code** = device **User ID**
- [ ] Biometric device on same network as Mac, IP and port (4370) noted
- [ ] Mac: AttendanceConnector folder with **connector-mac**, **config.json**, **install-mac.sh**
- [ ] **config.json**: deviceIp, deviceApiKey, backendUrl set correctly
- [ ] Ran **./install-mac.sh** in Terminal
- [ ] **Attendance** page in the app to verify punches (punch once, wait ~1 minute, refresh)

---

## If punches don’t show

1. **Employee code = User ID**  
   In the app: Employees → each person’s **Employee code** must be **exactly** the **User ID** on the device (e.g. `26`, `EMP001`).

2. **Connector running**  
   Check the AttendanceConnector folder for **connector.log**. Look for lines like “Connected”, “Pushed … logs”. If you see “Backend unreachable”, check **backendUrl** and internet. If you see “Socket isn’t connected”, check **deviceIp** and that the Mac can ping the device.

3. **Device on same network**  
   From the Mac, run: `ping 192.168.1.50` (use your device IP). It should reply.

4. **Device API key**  
   In config.json, **deviceApiKey** must match the key shown in the app for that device (Devices → your device → copy again if needed).
