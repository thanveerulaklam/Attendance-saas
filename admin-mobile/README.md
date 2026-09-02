# PunchPay Admin (Expo)

Phone app for **company admins and HR**. Dashboard and today’s attendance. Payroll, employees, and punches stay on the website.

This is not the office kiosk. The kiosk lives in `employee-mobile/` (`com.punchpay.kiosk`).

## Setup (development / Expo Go)

```bash
cd admin-mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your backend (LAN IP on a physical phone)
npm install
npm start
```

Uses **Expo SDK 54**. Sign in with an existing PunchPay **admin** or **HR** account. Employee logins are rejected.

## What V1 includes

- Login with the same JWT as punchpay.in
- Dashboard: present/total, people on break, absentees, branch split, 7-day trend
- Today: attendance list with All / Present / Absent / Late / Missing out
- Account: company, role, sign out

## Production builds (EAS)

Builds target **https://punchpay.in** via `eas.json`.

```bash
cd admin-mobile
npx eas login
npx eas build:configure   # first time only — creates an Expo project
npx eas build -p android --profile preview --wait    # internal APK
npx eas build -p ios --profile preview --wait        # TestFlight / ad hoc
```

Play Store production must be an **AAB**:

```bash
npx eas build -p android --profile production --wait
npx eas build -p ios --profile production --wait
npx eas submit -p android --profile production
npx eas submit -p ios --profile production
```

Bundle IDs:

- iOS: `com.punchpay.admin`
- Android: `com.punchpay.admin`

Store listing copy, privacy labels, and App Review notes: [STORE_RELEASE.md](./STORE_RELEASE.md).
