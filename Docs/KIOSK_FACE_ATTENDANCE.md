# Face Attendance Kiosk Setup

Use an **office tablet** instead of a biometric device. Employees stand at reception, look at the camera, and punch IN/OUT. No personal phone install and no per-employee passwords.

## Quick setup

### 1. Enable face attendance
**Company** → enable **Face attendance (office tablet)**

### 2. Generate kiosk code (per branch)
**Company** → Branches → **Kiosk code** → save both values shown once:

- Kiosk code (`pk_...`) — activates the tablet
- 6-digit Settings PIN — protects employee photos and attendance history

### 3. Download & activate the tablet
1. On Company page (with face attendance enabled) → **Download Android APK**
2. Copy `PunchPay-Kiosk.apk` to the office tablet, open the file, and install (allow Unknown apps if prompted)
3. Open **PunchPay Kiosk** → paste kiosk code → **Activate tablet**
4. Leave the tablet at reception

**Ops note:** After each EAS release, copy the APK to the server at `KIOSK_APK_PATH` (default `backend/downloads/PunchPay-Kiosk.apk`) so the Company page download works.

### 4. Enroll employee faces on the tablet
1. Create the employee in PunchPay admin with the correct branch and employee code.
2. On the tablet, tap **Settings** and enter the 6-digit Settings PIN.
3. Under **Employees**, enter the employee code and tap **Continue**.
4. Take a clear, front-facing enrollment photo.

The employee directory shows photo, name, employee code, and enrollment status.

### 5. Daily use
The **Attendance** tab is the default. Its camera continuously checks for a face, records
IN/OUT when recognized, and then pauses briefly for the next employee. No capture button
or employee login is required.

The **Settings** tab also includes read-only weekly, monthly, and custom-range kiosk logs
grouped by employee.

---

## Backend (one-time on server)

```bash
cd backend
npm install
npm run face:models   # downloads face recognition weights (~15 MB)
npm run migrate
```

---

## What gets stored

| Data | Purpose |
|------|---------|
| Face embedding (128 floats) | Match employee at kiosk |
| Kiosk token (hashed) | Authorize office tablet only |
| `attendance_logs` row | Same payroll path as biometric |

Punches use `device_id = 'kiosk'`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Face not recognized | Retake the enrollment photo with better lighting and face centered |
| No employees enrolled | Settings → Employees → enter employee code → take photo |
| Invalid kiosk code | Generate a new code in Company settings |
| Settings PIN not set | Generate a new kiosk code; save the new code and PIN |
| Face models missing | Run `npm run face:models` on backend |

---

## Legacy modes (still available)

- **Biometric devices** — unchanged
- **Personal phone QR** — still in codebase but not the recommended flow
