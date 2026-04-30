#!/bin/bash
# Run ONCE per folder. Puts Hikvision connector in LaunchAgents (Mac login).
# Same folder must contain connector-hik-mac (or dist/) and config.hikvision.json.

set -e

INSTANCE="${1:-1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/connector-hik-mac" ]; then
  CONNECTOR_BIN="$SCRIPT_DIR/connector-hik-mac"
elif [ -f "$SCRIPT_DIR/dist/connector-hik-mac" ]; then
  CONNECTOR_BIN="$SCRIPT_DIR/dist/connector-hik-mac"
else
  CONNECTOR_BIN=""
fi
if [ "$INSTANCE" = "1" ]; then
  PLIST_NAME="com.attendancesaas.connector.hikvision"
else
  PLIST_NAME="com.attendancesaas.connector.hikvision${INSTANCE}"
fi
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

echo "Installing Hikvision connector (instance ${INSTANCE})..."

if [ -z "$CONNECTOR_BIN" ] || [ ! -f "$CONNECTOR_BIN" ]; then
    echo "ERROR: connector-hik-mac not found in $SCRIPT_DIR or dist/"
    echo "Build: cd connector/hikvision && npm install && npm run build:mac"
    exit 1
fi

chmod +x "$CONNECTOR_BIN"

if [ ! -f "$SCRIPT_DIR/config.hikvision.json" ]; then
    echo "ERROR: config.hikvision.json not found. Copy config.example.hikvision.json and edit."
    exit 1
fi

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${CONNECTOR_BIN}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${SCRIPT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${SCRIPT_DIR}/connector-hik.log</string>
    <key>StandardErrorPath</key>
    <string>${SCRIPT_DIR}/connector-hik.err.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo ""
echo "SUCCESS: Hikvision connector will start on Mac login."
echo "Log: $SCRIPT_DIR/connector-hik.log"
echo "Stop: launchctl unload $PLIST_PATH"
