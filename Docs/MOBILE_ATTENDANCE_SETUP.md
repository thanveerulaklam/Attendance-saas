# Mobile Attendance Setup (QR + Geofence)

Optional employee mobile punching alongside biometric devices. **Default off** for all companies.

## Overview

| Piece | Purpose |
|-------|---------|
| Admin web | Enable feature, set geofence, show kiosk QR |
| Employee app (`employee-mobile/`) | Scan QR + GPS punch |
| Backend | Validates nonce, geofence, writes `attendance_logs` with `device_id = 'mobile'` |

Biometric connector, ADMS, device webhooks, and payroll logic are unchanged.

---

## 1. Enable for a company

1. Log in as **admin** → **Company** settings
2. Check **Enable mobile attendance**
3. For each branch:
   - **Edit** → set **latitude**, **longitude**, **radius** (meters)
   - Use **Use my location** in Chrome/Safari (not Cursor’s embedded browser)
   - Recommended test radius: **150–200m** (phone GPS is often ±50–80m)
   - Check **Mobile enabled for this branch**
   - **Save geofence**

---

## 2. QR kiosk (reception tablet)

1. Open `/mobile-qr/:branchId` (e.g. `/mobile-qr/2` for branch Main)
2. Leave fullscreen on a tablet; QR refreshes every ~45 seconds
3. Employees scan with the PunchPay Employee app

---

## 3. Employee app access

1. **Employees** → edit employee
2. Set **Attendance channel** to `Mobile` or `Both`
3. **Provision app login** (email + password) or use existing employee user

### Run the app locally

```bash
cd employee-mobile
cp .env.example .env
# Physical phone: EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000
npm install
npm start
```

Uses **Expo SDK 54** (compatible with App Store Expo Go). SDK 57 is not on the stores yet.

---

## 4. Punch log (audit)

**Company settings** → **View punch log**, or `/mobile-punch-log`

Shows accepted/rejected attempts with reject codes (geofence, expired QR, etc.).

---

## 5. Backend env (optional)

```env
MOBILE_QR_TTL_SECONDS=120          # QR validity window
MOBILE_MAX_GPS_ACCURACY_M=80       # Reject if GPS worse than this
MOBILE_PUNCH_RATE_LIMIT_MAX=10     # Per employee per 10 min
MOBILE_QR_CLEANUP_CRON=0 3 * * *   # Nightly nonce purge
```

Manual cleanup: `cd backend && node scripts/run-mobile-qr-cleanup.js`

---

## 6. Quick test (CLI)

```bash
cd backend && npm run test:mobile
```

Requires backend on `:3000`. Provisions test employee, issues QR, punches in/out, runs negative tests.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Expo Go “incompatible project” | Project uses SDK 54; restart with `npx expo start -c` |
| “Network request failed” on phone | Set `.env` to LAN IP, not `localhost` |
| “Invalid QR” | Refresh kiosk QR; scan within TTL (~2 min) |
| “You must be at the office” | Update branch geofence to your real location; increase radius |
| “Use my location” does nothing | Open settings in Chrome/Safari; allow location permission |

---

## Reject codes (employee app)

| Code | Meaning |
|------|---------|
| `OUTSIDE_GEOFENCE` | GPS outside branch radius |
| `QR_EXPIRED` | QR older than TTL |
| `QR_INVALID` | Wrong/expired/used nonce |
| `BRANCH_MISMATCH` | Employee’s branch ≠ QR branch |
| `EMPLOYEE_CHANNEL_NOT_MOBILE` | Channel still `device` only |

Full list: `employee-mobile/src/constants/rejectMessages.ts`
