# PunchPay Admin — store release

Use this when submitting the first App Store and Play Store builds. Accounts and review cannot be fully automated.

## Accounts (do once)

- Apple Developer Program (organization under PunchPay / MZone Technologies) — $99/year
- Google Play Console — $25 one-time
- Expo account used for EAS (`npx eas login` in `admin-mobile/`)

## Identifiers

| Field | Value |
|---|---|
| App name | PunchPay Admin |
| iOS bundle ID | `com.punchpay.admin` |
| Android package | `com.punchpay.admin` |
| Privacy policy | https://punchpay.in/privacy |
| Support URL | https://punchpay.in |
| Support email | info@mzonetechnologies.com |

## Store listing (short)

**Subtitle:** Attendance dashboard for owners and HR

**Description:**
PunchPay Admin shows today’s attendance for your company. See who is present, absent, late, or still punched in, plus a simple weekly trend. Sign in with the same admin or HR account you use on punchpay.in. Adding punches, payroll, and employee records stays on the website.

## App Review demo login

Apple and Google often reject B2B apps they cannot sign into. Provision a dedicated review company on production (do not rely on a local seed) and put the credentials in App Review notes:

```
Demo login (admin):
Email: <review-admin@your-company>
Password: <review-password>

This is a workplace attendance dashboard. Use the demo account above.
No camera, location, or in-app purchases.
```

Keep that company populated with today’s attendance so Dashboard and Today are not empty.

Local seed (not for store review): `admin@demo-company.com` / `Admin@123`.

## Screenshots

From a phone or simulator signed into a company with live attendance:

1. Login
2. Dashboard (KPI + on break / absent)
3. Today list with filters
4. Account

Apple: 6.7" iPhone required. Play: phone + 7" tablet optional.

## Data safety / App Privacy

The Admin app:

- Collects email and password only to sign in
- Stores a login token on device (secure storage)
- Does not use camera, microphone, location, contacts, or advertising IDs
- Does not sell data
- Account deletion: email info@mzonetechnologies.com (also described at /privacy)

## Production submit

```bash
cd admin-mobile
npx eas build -p android --profile production --wait
npx eas build -p ios --profile production --wait
npx eas submit -p android --profile production
npx eas submit -p ios --profile production
```

Android production profile builds an **AAB** (Play requirement). Preview profile still builds an APK for internal testers.
