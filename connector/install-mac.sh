#!/bin/bash
# Run this ONCE per folder to make the connector start automatically when Mac starts.
# Put this file in the SAME folder as the connector binary and config.json.
# After `npm run build`: connector-macos. After `npm run build:mac`: connector-mac.
#
# For multiple devices: use a separate folder per device, each with its own config.json.
#   Device 1: ./install-mac.sh
#   Device 2: in another folder, ./install-mac.sh 2
#   Device 3: in another folder, ./install-mac.sh 3
# (Instance number is optional; default is 1.)

set -e

INSTANCE="${1:-1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/connector-macos" ]; then
  CONNECTOR_BIN="$SCRIPT_DIR/connector-macos"
elif [ -f "$SCRIPT_DIR/connector-mac" ]; then
  CONNECTOR_BIN="$SCRIPT_DIR/connector-mac"
else
  CONNECTOR_BIN=""
fi
if [ "$INSTANCE" = "1" ]; then
  PLIST_NAME="com.attendancesaas.connector"
else
  PLIST_NAME="com.attendancesaas.connector${INSTANCE}"
fi
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

echo "Installing Attendance Connector (instance ${INSTANCE}) to run at Mac login..."

if [ -z "$CONNECTOR_BIN" ] || [ ! -f "$CONNECTOR_BIN" ]; then
    echo "ERROR: connector-macos or connector-mac not found in $SCRIPT_DIR"
    echo "Build it first: cd connector && npm run build   (or: npm run build:mac)"
    exit 1
fi

chmod +x "$CONNECTOR_BIN"

if [ ! -f "$SCRIPT_DIR/config.json" ]; then
    echo "ERROR: config.json not found. Copy config.example.json to config.json and fill in your values."
    exit 1
fi

# Create launchd plist
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
    <string>${SCRIPT_DIR}/connector.log</string>
    <key>StandardErrorPath</key>
    <string>${SCRIPT_DIR}/connector.err.log</string>
</dict>
</plist>
EOF

# Unload if already running
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# Load (starts immediately + runs at next login)
launchctl load "$PLIST_PATH"

echo ""
echo "SUCCESS: Connector (instance ${INSTANCE}) is now running and will start automatically on Mac login."
echo "Log file: $SCRIPT_DIR/connector.log"
echo ""
echo "Commands:"
echo "  Stop:   launchctl unload $PLIST_PATH"
echo "  Start:  launchctl load $PLIST_PATH"
echo "  Status: launchctl list | grep $PLIST_NAME"
