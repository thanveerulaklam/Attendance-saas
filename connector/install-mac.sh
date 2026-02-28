#!/bin/bash
# Run this ONCE to make the connector start automatically when Mac starts.
# Put this file in the SAME folder as the connector binary and config.json.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONNECTOR_BIN="$SCRIPT_DIR/connector-mac"
PLIST_NAME="com.attendancesaas.connector"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

echo "Installing Attendance Connector to run at Mac login..."

if [ ! -f "$CONNECTOR_BIN" ]; then
    echo "ERROR: connector-mac not found in $SCRIPT_DIR"
    echo "Build it first: cd connector && npm run build:mac"
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
echo "SUCCESS: Connector is now running and will start automatically on Mac login."
echo "Log file: $SCRIPT_DIR/connector.log"
echo ""
echo "Commands:"
echo "  Stop:  launchctl unload $PLIST_PATH"
echo "  Start: launchctl load $PLIST_PATH"
echo "  Status: launchctl list | grep $PLIST_NAME"
