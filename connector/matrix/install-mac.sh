#!/bin/bash
# Matrix COSEC connector — run ONCE to auto-start on Mac login.
# Requires connector-cosec-mac (or dist/connector-cosec-mac) and config.cosec.json in this folder.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.attendancesaas.connector.cosec"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

if [ -f "$SCRIPT_DIR/connector-cosec-mac" ]; then
  CONNECTOR_BIN="$SCRIPT_DIR/connector-cosec-mac"
elif [ -f "$SCRIPT_DIR/dist/connector-cosec-mac" ]; then
  CONNECTOR_BIN="$SCRIPT_DIR/dist/connector-cosec-mac"
else
  echo "ERROR: connector-cosec-mac not found in $SCRIPT_DIR"
  echo "Build: cd connector/matrix && npm install && npm run build:mac"
  exit 1
fi

chmod +x "$CONNECTOR_BIN"

if [ ! -f "$SCRIPT_DIR/config.cosec.json" ]; then
  if [ -f "$SCRIPT_DIR/config.example.cosec.json" ]; then
    cp "$SCRIPT_DIR/config.example.cosec.json" "$SCRIPT_DIR/config.cosec.json"
    echo "Created config.cosec.json from template — edit it before continuing."
    exit 1
  fi
  echo "ERROR: config.cosec.json not found."
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
    <string>${SCRIPT_DIR}/connector-cosec.log</string>
    <key>StandardErrorPath</key>
    <string>${SCRIPT_DIR}/connector-cosec.err.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "SUCCESS: Matrix COSEC connector running. Log: $SCRIPT_DIR/connector-cosec.log"
