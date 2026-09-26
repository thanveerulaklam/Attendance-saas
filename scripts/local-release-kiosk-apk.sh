#!/usr/bin/env bash
# Local signed release APK (fallback when Expo EAS login is unavailable).
# Uses EXPO_PUBLIC_API_URL=https://punchpay.in and copies to backend/downloads.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/employee-mobile"
DOWNLOADS="$ROOT/backend/downloads"
KEYSTORE="$MOBILE/credentials/kiosk-release.keystore"
STORE_PASS="${KIOSK_KEYSTORE_PASSWORD:-punchpay-kiosk}"
KEY_ALIAS="${KIOSK_KEY_ALIAS:-punchpay-kiosk}"
KEY_PASS="${KIOSK_KEY_PASSWORD:-punchpay-kiosk}"
CLEAN_PREBUILD="${CLEAN_PREBUILD:-0}"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://punchpay.in}"
export CI=1

if [[ ! -d "$ANDROID_HOME" ]]; then
  echo "ANDROID_HOME not found: $ANDROID_HOME" >&2
  exit 1
fi

mkdir -p "$MOBILE/credentials" "$DOWNLOADS"
if [[ ! -f "$KEYSTORE" ]]; then
  keytool -genkeypair -v -storetype PKCS12 \
    -keystore "$KEYSTORE" -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
    -dname "CN=PunchPay Kiosk, OU=Mobile, O=PunchPay, L=Chennai, ST=TN, C=IN"
fi

cd "$MOBILE"

if [[ "$CLEAN_PREBUILD" == "1" || ! -d android ]]; then
  echo "==> Prebuild Android native project"
  npx expo prebuild -p android --clean
fi

cat > android/keystore.properties <<EOF
storePassword=$STORE_PASS
keyPassword=$KEY_PASS
keyAlias=$KEY_ALIAS
storeFile=$KEYSTORE
EOF

python3 - <<'PY'
from pathlib import Path
import re

p = Path("android/app/build.gradle")
text = p.read_text()

inject_top = """
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
"""
if "def keystorePropertiesFile" not in text:
    text = text.replace("android {", inject_top + "\nandroid {", 1)

if "signingConfigs {" in text and "keyAlias keystoreProperties" not in text:
    text = text.replace(
        """    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }""",
        """    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }""",
    )

text = re.sub(
    r"release \{\s*(?:signingConfig signingConfigs\.\w+\s*)+",
    "release {\n            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug\n            ",
    text,
    count=1,
)
# Collapse accidental duplicate signingConfig lines in release block
fixed_lines = []
in_release = False
seen_sign = False
depth = 0
for line in text.splitlines():
    stripped = line.strip()
    if stripped.startswith("release {"):
        in_release = True
        seen_sign = False
        depth = 1
        fixed_lines.append(line)
        continue
    if in_release:
        depth += stripped.count("{") - stripped.count("}")
        if "signingConfig " in stripped:
            if seen_sign:
                continue
            seen_sign = True
            fixed_lines.append(
                "            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug"
            )
            continue
        fixed_lines.append(line)
        if depth <= 0:
            in_release = False
        continue
    fixed_lines.append(line)

p.write_text("\n".join(fixed_lines) + "\n")
print("android/app/build.gradle signing config ready")
PY

MANIFEST="$MOBILE/android/app/src/main/AndroidManifest.xml"
if [[ -f "$MANIFEST" ]] && ! grep -q REQUEST_INSTALL_PACKAGES "$MANIFEST"; then
  python3 - "$MANIFEST" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
text = p.read_text()
needle = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
insert = needle + '\n  <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>'
if needle in text and "REQUEST_INSTALL_PACKAGES" not in text:
    p.write_text(text.replace(needle, insert, 1))
    print("Added REQUEST_INSTALL_PACKAGES")
PY
fi

python3 - "$MOBILE/app.json" "$MOBILE/android/app/build.gradle" <<'PY'
import json, re, sys
from pathlib import Path
app = json.loads(Path(sys.argv[1]).read_text())
version = str(app["expo"]["version"])
code = int(app["expo"]["android"]["versionCode"])
gradle = Path(sys.argv[2])
text = gradle.read_text()
text = re.sub(r"versionCode \d+", f"versionCode {code}", text, count=1)
text = re.sub(r'versionName "[^"]*"', f'versionName "{version}"', text, count=1)
gradle.write_text(text)
print(f"Android version set to {version} ({code})")
PY

echo "==> Building release APK"
cd android
./gradlew assembleRelease --no-daemon

APK_SRC="$(find app/build/outputs/apk/release -name '*.apk' | head -n 1)"
if [[ -z "$APK_SRC" ]]; then
  echo "ERROR: release APK not found" >&2
  exit 1
fi

cp "$APK_SRC" "$DOWNLOADS/PunchPay-Kiosk.apk"
node - "$MOBILE/app.json" "$DOWNLOADS/kiosk-version.json" <<'JS'
const fs = require('fs');
const app = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const meta = {
  version: app.expo.version,
  versionCode: Number(app.expo.android.versionCode),
};
fs.writeFileSync(process.argv[3], `${JSON.stringify(meta, null, 2)}\n`);
console.log(`Wrote ${process.argv[3]}`, meta);
JS
echo "==> Published $DOWNLOADS/PunchPay-Kiosk.apk"
ls -lh "$DOWNLOADS/PunchPay-Kiosk.apk"
