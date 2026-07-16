# PunchPay Kiosk (Expo)

Office tablet app for **face attendance**. One install per branch — employees do not need the app on their phones.

## Setup (development / Expo Go)

```bash
cd employee-mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your backend (same Wi‑Fi as tablet)
npm install
npm start
```

Uses **Expo SDK 54** (App Store Expo Go compatible).

## Production Android APK

Builds target **https://punchpay.in** via `eas.json`.

```bash
cd employee-mobile
npx eas login
npx eas build:configure   # first time only
npx eas build -p android --profile production --wait
```

Then publish the artifact for the Company Settings download button:

```bash
# From repo root (copies into backend/downloads/PunchPay-Kiosk.apk)
chmod +x ./scripts/build-and-publish-kiosk-apk.sh
./scripts/build-and-publish-kiosk-apk.sh
```

Or manually:

```bash
npx eas build:download --platform android --latest
cp path/to/*.apk ../backend/downloads/PunchPay-Kiosk.apk
```

On production, deploy that file (or set `KIOSK_APK_PATH`).

## Activate tablet

1. Admin: **Company** → enable face attendance → **Download Android APK**
2. Install the APK on the office tablet
3. Admin: branch → **Kiosk code** → save the `pk_...` code and Settings PIN
4. Open this app → paste code → **Activate tablet**
5. Attendance opens by default and scans faces automatically

## Server requirement

Backend must have face models installed:

```bash
cd backend && npm run face:models
```

## Enroll faces

Tablet → **Settings** → enter Settings PIN → employee code → take enrollment photo.

The employee must already exist in PunchPay admin and belong to this kiosk's branch.

See [Docs/KIOSK_FACE_ATTENDANCE.md](../Docs/KIOSK_FACE_ATTENDANCE.md).
