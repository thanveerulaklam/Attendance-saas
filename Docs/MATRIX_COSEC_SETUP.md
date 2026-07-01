# Matrix COSEC — PunchPay setup (connector)

For **Matrix COSEC** devices (e.g. COSEC DOOR FOT IN, COSEC CENTRA-managed doors). This is **not** ADMS and **not** the ZKTeco connector.

| Do | Do not |
|----|--------|
| Use `cosec-connector` + `config.cosec.json` | Use `connector.exe` (ZKTeco port 4370) |
| Use **device API key** from PunchPay Devices | Use ADMS serial / `/iclock` on Matrix |
| Match `employee_code` to COSEC user ID | Assume ping alone means sync works |

For eSSL / ZKTeco ADMS setup, see [ADMS_SETUP_GUIDE.md](ADMS_SETUP_GUIDE.md).

---

## 1) PunchPay (admin)

1. Create company, branch, and shift.
2. Add employees — **`employee_code`** must match the COSEC **user ID** on the device.
3. **Devices** → register the gate/reader → copy **API key**.
4. Do **not** use the ADMS serial field for Matrix devices.

---

## 2) Device — Ethernet

On the COSEC door controller:

- Set a static LAN IP (same subnet as the office PC).
- Ensure **HTTP port 80** is reachable from the PC that runs the connector.
- Note admin username/password (COSEC web login).

Pre-flight from the client PC:

```bash
nc -zv <device-ip> 80
```

---

## 3) Connector files

Use the standalone folder **`connector/matrix/`** — copy the whole directory to the client PC.

Build on your machine:

```bash
cd connector/matrix
npm install
npm run build:win    # or build:mac
```

Client zip should include:

- `dist/connector-cosec.exe` (Windows) or `dist/connector-cosec-mac` (Mac)
- `config.example.cosec.json` → rename to **`config.cosec.json`**
- `install-windows.bat` or `install-mac.sh`
- `SETUP_GUIDE.txt`

Fill in:

| Field | Value |
|-------|--------|
| `deviceIp` | COSEC device LAN IP |
| `cosecUsername` / `cosecPassword` | Device admin login |
| `deviceApiKey` | From PunchPay Devices page |
| `backendUrl` | `https://punchpay.in` (no trailing slash) |
| `syncFromLatest` | `true` for new installs (skip old events) |

Optional:

- `apiPrefix`: `/device.cgi` (default) — some firmware uses root `/events` instead; leave blank in config to auto-try both.
- `exitFunctionCodes`: override IN/OUT mapping if site uses custom special-function keys.

---

## 4) Run and verify

From the **`connector/matrix/`** folder (with Node.js):

```bash
cd connector/matrix
npm run probe
```

Probe should show:

- Device reachable (HTTP 200)
- Sample raw XML event fields
- At least one mapped log `{ employee_code, punch_time, punch_type }` if recent punches exist

One sync cycle (pushes to cloud):

```bash
npm run once
```

Continuous polling (background):

```bash
npm start
```

Or with the built executable:

```bash
connector-cosec.exe --probe
connector-cosec.exe --once
connector-cosec.exe
```

Log file: **`connector-cosec.log`** in the same folder.  
State file: **`cosec.state.json`** (resume cursor after restart).

---

## 5) On-site checklist

1. `--probe` succeeds (device HTTP + parse OK).
2. `--once` returns `201` from backend with `inserted > 0` (if historical events exist).
3. Test punch on device → row in PunchPay within one poll interval (~60s).
4. Employee codes in app match COSEC user IDs exactly.

---

## 6) Troubleshooting

| Symptom | Check |
|---------|--------|
| Connection refused / timeout | Device IP, firewall, same LAN as PC, port 80 open |
| 401 / access error | `cosecUsername` / `cosecPassword` |
| Events fetched but `inserted: 0` | Employee codes mismatch; add employees with matching IDs |
| Push 401 | `deviceApiKey` wrong or expired — copy again from Devices |
| Wrong IN/OUT | Adjust `exitFunctionCodes` in config |

---

## 7) Regression (existing eSSL clients)

Matrix connector changes do **not** modify ADMS (`/iclock`). After any VPS deploy, verify eSSL still works:

```bash
backend/deploy/verify-adms.sh
```

All four `/iclock` checks should **PASS**.

---

## 8) Future options (not in MVP)

- **COSEC CENTRA server API** — poll server instead of device (needs server URL + API credentials).
- **COSEC Devices PUSH API** — device pushes to your server (`/login`, `/poll`, `/setevent`); requires new backend routes.
