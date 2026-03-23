# Customer Onboarding Flow (Current)

This document explains how a new customer gets from signup to a working attendance-to-payroll setup, including how to configure the on-site connector and how to verify that punches are syncing correctly.

## 1. After Signup: Approval + Account Activation

1. Customer registers on the `Register` page.
2. The account is created in a `pending` state.
3. A provider/admin reviews the request and activates the account after payment verification (the UI message says within ~2 hours).
4. Customer then logs in from the `Login` page and starts onboarding in the app.

## 2. Where the Onboarding Steps Live (In App)

After login, the app shows an onboarding checklist widget for users with the `admin` or `hr` role.

The checklist steps and routing are:

1. `Add company details` -> `/settings/company`
2. `Create shift` -> `/shifts`
3. `Add first employee` -> `/employees?onboarding=open_employee_modal`
4. `Register device` -> `/devices`
5. `Verify device sync` -> `/devices`
6. `Generate first payroll` -> `/payroll`

### What the checklist considers "completed"

The checklist completion is derived from what exists in the database:

1. Company completed when `companies.name`, `companies.phone`, and `companies.address` are all non-empty
2. Shift completed when at least 1 shift exists
3. Employee completed when at least 1 employee exists
4. Register device completed when at least 1 device exists
5. Verify device sync completed when at least 1 device has `devices.last_seen_at` set (meaning punches were accepted and processed)
6. Generate first payroll completed when at least 1 `payroll_records` row exists

When everything is complete, the app sets `companies.onboarding_completed_at`.

## 3. Step-by-Step Onboarding

### Step 1: Add company details (`/settings/company`)

Fill in:

1. `Company name`
2. `Phone`
3. `Address`

Save using `Save company profile`.

Note: subscription dates/status are managed by the service provider; the customer sees them for reference.

## 4. Step 2: Create your shift (`/shifts`)

Create at least one shift so attendance and overtime calculations can work.

You can choose an attendance mode for the shift:

1. `Shift Based` (default): calculates based on shift start/end, late arrivals, lunch breaks
2. `Hours Based`: presence is based on minimum required hours on-premises

At minimum, provide:

1. Shift `Name`
2. `Start time`
3. `End time`

Save with `+ Add shift`.

## 5. Step 3: Add employees (`/employees`)

Add at least one employee using `Add employee`.

Important field for connector setup:

1. `Employee code` must exactly match the biometric device's User ID / PIN used in the device.

Additional fields (required by the UI validation):

1. `Name`
2. `Basic salary`
3. `Join date`
4. `Status` (defaults to `Active`)
5. Optional: `Shift` (you can leave `No shift`, but for payroll correctness you should assign the right shift)

Save with `Create employee`.

Why this matters: when the connector/device sends punches, the system matches incoming `employee_code` to employees in the app. If codes don't match, sync will fail with an "Unknown employee_code" error and the onboarding "Verify device sync" step will not complete.

## 6. Step 4: Register your biometric device (`/devices`)

Go to `Devices` and register your machine:

1. Click `+ Register device`
2. Enter a friendly `Device name` (example: `Main gate biometric`)
3. Save with `Save device`

After registering, the app generates a secure `API key` for that device.

### API key usage

1. Copy the `API key` (reveal + copy)
2. Configure it on the connector or device so it can push punches to your cloud.

You can also:

1. `Regenerate key` (existing devices/connectors using the old key will stop syncing until updated)
2. `Deactivate` a device (inactive devices won't be considered for syncing)

### Online/Last sync indicator

Each device card shows:

1. `Last sync`
2. Online status determined by whether `last_seen_at` is present

## 7. Step 5: Install and use the connector (recommended flow)

The connector is a small on-site program that syncs punches from your biometric device to PunchPay cloud automatically.

The connector:

1. Connects to the biometric device over LAN using the IP you set
2. Reads attendance records from the device
3. Sends them to the cloud API endpoint using your device API key
4. Runs continuously (auto-start at startup after installation)

### What you receive from your provider

You should receive a bundle that includes:

1. `connector.exe` (Windows) or `connector-mac` (Mac)
2. `config.example.json` (you rename it to `config.json`)
3. An installer script (`install-windows.bat` or `install-mac.sh`)
4. Connector setup instructions (`SETUP_GUIDE_CLIENTS.txt`)

### Connector configuration (common fields)

In `config.json`, set:

1. `deviceIp`: the biometric device IP on your office network
2. `devicePort`: biometric device port (defaults to `4370`)
3. `deviceApiKey`: the Device API key from the app (`/devices`)
4. `backendUrl`: your cloud API base URL (no trailing slash)
5. `pollIntervalMs`: how often the connector checks the device (example `60000`)

### Windows setup (one-time install)

1. Create a folder like `C:\AttendanceConnector`
2. Copy all connector files into this folder:
   1. `connector.exe`
   2. `config.example.json` (rename to `config.json`)
   3. `install-windows.bat`
   4. (and optional) `run-windows.bat`
3. Edit `config.json` with:
   1. `deviceIp` = biometric device IP
   2. `deviceApiKey` = key from the app
   3. `backendUrl` = provider-given API URL (no trailing `/`)
4. Right-click `install-windows.bat` -> `Run as administrator`
5. Restart your PC (connector starts automatically)

### Mac setup (one-time install)

1. Create a folder like `~/Desktop/AttendanceConnector`
2. Copy into it:
   1. `connector-mac`
   2. `config.example.json` (rename to `config.json`)
   3. `install-mac.sh`
3. Edit `config.json`:
   1. `deviceIp` = biometric device IP
   2. `deviceApiKey` = key from the app
   3. `backendUrl` = provider-given API URL (no trailing `/`)
4. In Terminal:
   1. `chmod +x install-mac.sh`
   2. `./install-mac.sh`
5. Restart/logout as needed; the connector starts automatically on Mac login.

### How the connector sends punches (what "sync" means)

When the connector successfully reads attendance from your biometric device, it pushes punches to the cloud using:

1. POST `.../api/device/push`
2. Header: `x-device-key: <your deviceApiKey>`
3. Body: JSON containing `logs` with `{ employee_code, punch_time, punch_type }`

On the server, it stores punches in attendance logs and updates `devices.last_seen_at`.

## 8. Step 6: Verify that sync is working (`Verify device sync`)

There are two verification levels:

### A) Verify in the connector logs (fastest)

Open:

1. Windows: the connector folder contains `connector.log`
2. Mac: the connector folder contains `connector.log`

Look for lines such as:

1. `Connected to device at ...`
2. `Pushed ... logs to backend.`

If you see errors like:

1. `Backend unreachable` -> `backendUrl` is wrong/unreachable
2. `Device API key ... 401` -> connector `deviceApiKey` is wrong
3. `Unknown employee_code ...` -> employee codes don't match the biometric device user IDs

### B) Verify in the PunchPay UI (what completes onboarding)

Go to `/devices`:

1. After successful pushes, each device will show `Last sync` instead of `Never`
2. The onboarding checklist step `Verify device sync` completes when at least one device has `last_seen_at` set

## 9. Step 7: Generate your first payroll (`/payroll`)

Once attendance is syncing and employees/shifts are configured, generate payroll:

1. Go to `/payroll`
2. Click `+ Generate payroll`
3. Select the `year` and `month`
4. Confirm `Generate for all`

Notes:

1. Payroll generation is blocked if your subscription is expired beyond the grace period.
2. The UI disables `Generate payroll` when subscription is not allowed.

Onboarding completes the payroll step when payroll records exist for the company (`payroll_records`).

## 10. Common Troubleshooting (quick fixes)

### 1) Device shows `No recent sync` forever

Check in order:

1. Connector `config.json`:
   1. `deviceIp` matches the biometric device IP on LAN
   2. `deviceApiKey` matches the key shown in `/devices`
   3. `backendUrl` is reachable from the client PC
2. `connector.log`:
   1. Look for `Connected` and `Pushed ...`
3. Employees:
   1. Confirm each employee's `employee_code` matches the device's User ID/PIN

### 2) Sync fails with a 401 / "Device API key is required"

You likely copied the wrong device key or there are spaces in `config.json`.

Fix:

1. Copy the API key again from `/devices`
2. Paste into `config.json` as `deviceApiKey`
3. Restart/re-run the connector

### 3) Sync fails with "Unknown employee_code"

That means punches are arriving with employee codes that don't exist in the app.

Fix:

1. Update employee records in `/employees` so `employee_code` matches the biometric device user IDs exactly
2. Then run the connector again so it can re-push/try the logs

### 4) Payroll button disabled

Your subscription is inactive and payroll generation is blocked until renewed (after grace expiry).

## 11. Direct Cloud Push (optional alternative)

Some biometric devices can send punches directly to your cloud webhook, without an on-site connector.

If you use direct push:

1. Configure the device to POST to your cloud webhook (server route supports JSON and ZKTeco tab-separated payloads)
2. Authenticate using the same device API key, sent as:
   1. Header `x-device-key: <API_KEY>` (preferred), or
   2. Header `Authorization: Bearer <API_KEY>`

Even in this mode, onboarding "Verify device sync" completes once `devices.last_seen_at` is updated from accepted punches.

