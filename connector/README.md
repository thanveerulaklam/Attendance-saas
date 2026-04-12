# Attendance Connector

Runs on the client's PC. Syncs biometric device to your cloud. **Install once → runs automatically when the PC starts.**

---

## For You (Building & Distributing)

### Build standalone executables (no Node.js needed for clients)

```bash
cd connector
npm install
npm run build:win   # → dist/connector.exe (run on Windows or use cross-compile)
npm run build:mac   # → dist/connector-mac (run on Mac)
```

Build on a **Windows PC** to create `.exe`; build on a **Mac** to create the Mac binary. (Or use CI to build both.)

If `pkg` fails with cache permission errors, run with: `PKG_CACHE_PATH=./.pkg-cache npm run build:mac`

### Give each client a zip with:

1. **connector.exe** (Windows) or **connector-mac** (Mac)
2. **config.example.json** and **config.example.two-devices.json** → client renames one pattern to **config.json** and edits
3. **install-windows.bat** (Windows) or **install-mac.sh** (Mac)
4. **run-windows.bat** (Windows only)
5. **SETUP_GUIDE_CLIENTS.txt** (step-by-step instructions for clients)

---

## For Clients (One-Time Setup)

### Step 1: Create folder

e.g. `C:\AttendanceConnector` (Windows) or `~/AttendanceConnector` (Mac)

### Step 2: Copy files

Put `connector.exe` (or `connector-mac`), `config.example.json`, and the install script in that folder.

### Step 3: Configure

1. Rename `config.example.json` to `config.json`
2. Edit with Notepad/TextEdit. Fill in:
   - **One device:** `deviceIp`, `deviceApiKey`, `backendUrl` (see `config.example.json`).
   - **Two devices on same network:** use a **`devices`** array — each entry has its own `deviceIp` and `deviceApiKey` (register **two** devices in the app; each gets a different key). See `config.example.two-devices.json`.

### Step 4: Install auto-start

- **Windows:** Right-click `install-windows.bat` → **Run as administrator**
- **Mac:** Open Terminal, run `./install-mac.sh` (or `bash install-mac.sh`)

### Done

The connector starts automatically when the PC starts. No need to run anything manually.

- Log file: `connector.log` in the same folder
- Windows: To stop, open Task Scheduler → disable "AttendanceConnector"
- Mac: `launchctl unload ~/Library/LaunchAgents/com.attendancesaas.connector.plist`
