# Setup for 50 Clients – Ethernet + Connector Model

A simple guide to how your SaaS works when you have many clients, each with their own biometric device and connector.

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│  YOU (one time)                                                  │
│  Host the app in the cloud (e.g. Hostinger VPS)                  │
│  → One backend + one frontend for ALL 50 clients                │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ internet
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    Client A             Client B              Client C  ... (50 clients)
    ┌─────────┐         ┌─────────┐           ┌─────────┐
    │ Device  │         │ Device  │           │ Device  │
    │ (LAN)   │         │ (LAN)   │           │ (LAN)   │
    └────┬────┘         └────┬────┘           └────┬────┘
         │                   │                      │
         │ Ethernet          │ Ethernet             │ Ethernet
         ▼                   ▼                      ▼
    ┌─────────┐         ┌─────────┐           ┌─────────┐
    │Connector│         │Connector│           │Connector│
    │(PC/Mac) │         │(PC/Mac) │           │(PC/Mac) │
    └────┬────┘         └────┬────┘           └────┬────┘
         │                   │                      │
         └──────────────────┼──────────────────────┘
                             │
                    (each pushes to YOUR cloud)
```

- **You:** One cloud app (backend + frontend). No per-client server.
- **Each client:** One biometric device on their LAN + one small PC/Mac running the **connector** at their office. The connector sends attendance from the device to your cloud.

---

## What You Do Once (Your Side)

### 1. Deploy the app to the cloud

- Put **backend** and **frontend** on a server (e.g. Hostinger VPS).
- Use a domain (e.g. `app.yourapp.com` for frontend, `api.yourapp.com` for backend).
- Configure database, env vars, HTTPS. After this, the same app serves all 50 clients.

### 2. Create companies (or let them register)

- Either you create a **company** per client from an admin panel, or clients **register** and get their own company.
- Each company is isolated: they only see their own employees, devices, and attendance.

### 3. Give clients the app URL

- Tell every client: “Log in at **https://app.yourapp.com**” (or your real URL).
- They log in with the account you created (or they registered) for their company.

---

## What Each Client Does (Their Side)

Every client follows the same steps. You can give them a short checklist or a 1–2 page guide.

### Step 1: Log in to the app

- They open **https://app.yourapp.com** and log in (e.g. admin or HR account for their company).

### Step 2: Add employees

- Go to **Employees** → Add each worker.
- For each employee, set **Employee code** (e.g. `1`, `52`, `EMP001`).  
- They must use the **same** number/code on the biometric device when enrolling (User ID / PIN).

### Step 3: Create a shift (if needed)

- Go to **Shifts** → Create at least one shift (e.g. 9 AM–6 PM).  
- Used for late/overtime and reports.

### Step 4: Register the biometric device in the app

- Go to **Devices** → **Add device** (e.g. name: “Main gate”).
- The app shows an **API key**. They must **copy and save** this key; they will use it in the connector.

### Step 5: Set up the biometric device (Ethernet only)

- Connect the device to their **office router** with an Ethernet cable.
- On the device: **Communication → Ethernet**
  - Set **IP** (e.g. `192.168.1.50`), **subnet**, **gateway** (router IP).
  - Port: **4370** (default).
- Do **not** use “Cloud server setting” for this model.

### Step 6: Install the connector on one PC at their office (once – runs automatically)

- They need **one** computer (Windows PC or Mac) that:
  - Is on the **same office network** as the biometric device.
  - Has **internet** (to reach your cloud).

**What you give them (a small zip):**

- `connector.exe` (Windows) or `connector-mac` (Mac) – no Node.js needed
- `config.example.json` (they rename to `config.json` and edit)
- `install-windows.bat` (Windows) or `install-mac.sh` (Mac)
- `run-windows.bat` (Windows only)

**What they do (one-time setup):**

1. Create a folder (e.g. `C:\AttendanceConnector`).
2. Copy all files into that folder.
3. Rename `config.example.json` to `config.json` and edit:
   - **deviceIp**: their biometric device IP (from Step 5)
   - **deviceApiKey**: the key from Step 4
   - **backendUrl**: your cloud API (e.g. `https://api.yourapp.com`)
4. Run the install script **once**:
   - **Windows:** Right-click `install-windows.bat` → Run as administrator
   - **Mac:** `./install-mac.sh` in Terminal

**Done.** The connector starts automatically when the PC starts. They never need to run it manually again.

- Logs: `connector.log` in the same folder
- Build the exe: see `connector/README.md`

### Step 7: Use the app

- They (and you) can open the app from anywhere and see **Attendance**, **Payroll**, **Reports**, etc. Data is in your cloud; the connector only “feeds” punches from the device to the cloud.

---

## Workflow Summary (Easy to Understand)

| Who        | What they do |
|-----------|---------------|
| **You**   | 1) Host one app in the cloud. 2) Create (or allow) one company per client. 3) Share app URL and a short “client setup” guide. |
| **Client**| 1) Log in → Add employees (with employee codes). 2) Add device in app → Copy API key. 3) Connect device to router (Ethernet). 4) On one office PC: set `.env` (device IP, API key, your backend URL) and run the connector. 5) Use the app for attendance and payroll. |

- **One app** in the cloud serves all 50 clients.
- **Per client:** one (or more) biometric device(s) on their LAN + **one connector** per site (one PC running the script with their device IP and their API key).

---

## Important Points for 50 Clients

1. **Employee code = Device User ID**  
   Whatever they set as User ID/PIN on the device must match **employee_code** in the app. One wrong code and that person’s punches won’t show.

2. **Each device has its own API key**  
   When they add a device in the app, they get one key. That key goes in the connector’s `.env` for the PC that talks to that device. One connector can use one key (one device). If they have two devices, they either run two connectors (different keys and device IPs) or you extend the connector to support multiple devices.

3. **Connector must run 24/7** (or whenever they want sync)  
   If the PC is off, no new punches are sent to the cloud until it’s on again. You can suggest running it as a service or on a small always-on PC/Raspberry Pi.

4. **You don’t touch their LAN**  
   You only give them: app URL, how to add employees/devices, and how to configure and run the connector. They set their own device IP and router.

5. **Support**  
   Most issues are: wrong device IP, wrong API key, employee code mismatch, or connector not running. Your “client setup” doc plus this workflow should cover most of it.

---

## Checklist You Can Give Each Client

- [ ] Log in at &lt;your app URL&gt;
- [ ] Add all employees; set **Employee code** (same as device User ID)
- [ ] Create a shift (e.g. 9–6)
- [ ] Devices → Add device → Copy **API key**
- [ ] On biometric device: Ethernet → set IP, subnet, gateway; port 4370
- [ ] On one office PC: install Node.js, copy connector, set `.env` (device IP, API key, backend URL)
- [ ] Run connector (once to test, then keep running for continuous sync)
- [ ] Check Attendance in the app to confirm punches appear

This is the full workflow for your 50 clients with the **Ethernet + Connector** setup.
