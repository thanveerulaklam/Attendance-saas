#!/usr/bin/env bash
# Build PunchPay Kiosk APK with EAS and publish it for Company Settings download.
#
# Prerequisites:
#   1. cd employee-mobile && npx eas login
#   2. npx eas build:configure   (first time only — creates EAS project)
#
# Usage:
#   ./scripts/build-and-publish-kiosk-apk.sh
#   ./scripts/build-and-publish-kiosk-apk.sh --profile preview
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/employee-mobile"
DOWNLOADS="$ROOT/backend/downloads"
PROFILE="${1:-production}"
if [[ "$PROFILE" == "--profile" ]]; then
  PROFILE="${2:-production}"
fi

mkdir -p "$DOWNLOADS"
cd "$MOBILE"

echo "==> Building Android APK (profile=$PROFILE, API=https://punchpay.in)"
npx eas build -p android --profile "$PROFILE" --non-interactive --wait

echo "==> Downloading latest APK artifact"
TMP_DIR="$(mktemp -d)"
npx eas build:download --platform android --latest --output "$TMP_DIR" --non-interactive

APK_SRC="$(find "$TMP_DIR" -name '*.apk' | head -n 1)"
if [[ -z "$APK_SRC" ]]; then
  echo "ERROR: No APK found in download output." >&2
  exit 1
fi

cp "$APK_SRC" "$DOWNLOADS/PunchPay-Kiosk.apk"
echo "==> Published: $DOWNLOADS/PunchPay-Kiosk.apk"
ls -lh "$DOWNLOADS/PunchPay-Kiosk.apk"
echo "Company admins with face attendance enabled can download it from Company Settings."
