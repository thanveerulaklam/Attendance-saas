# PunchPay Field — store listing and EAS notes

Separate employee app (`com.punchpay.field`). **PunchPay Admin** (`com.punchpay.admin`) stays camera-free.

## Privacy (App Store / Play)

- **Camera (when in use):** front camera selfie for on-device MobileFaceNet match. Embeddings only; no photo uploaded on punch.
- **Precise location (when in use):** confirm the employee is inside an admin-assigned field site. Server enforces the same geofence.
- PunchPay Admin listing remains camera-free.

## Demo review account

Provide a **field employee** (role `employee`, attendance channel `mobile` or `both`) with:

1. App email + password
2. Face enrolled (or a note that the reviewer enrolls in-app)
3. A field site whose radius covers Apple’s/Google’s test location — use a wide radius (up to 5000 m) if needed

Company flag **Enable field attendance** must be on.

## EAS (internal preview, then stores)

From `field-mobile/`:

```bash
npm install
eas login
eas build -p android --profile preview
eas build -p ios --profile preview
eas build -p android --profile production
eas build -p ios --profile production
```

Preview APK/IPA uses `EXPO_PUBLIC_API_URL=https://punchpay.in`. Face matching is **Android native** (`punchpay-face` / MobileFaceNet). iOS UI ships with camera + location permission copy; on-device TFLite for iOS is a later native module.

Expo Go cannot load `punchpay-face`. Use an EAS/dev client build for punch and enrollment.

## Admin setup (web)

1. Devices → Enable field attendance (or Field sites page)
2. Create GPS sites (Use my location)
3. Employee form: attendance channel Mobile or Both, assign sites, create app login
