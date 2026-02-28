#!/usr/bin/env node
/**
 * Attendance Connector - runs in background, syncs biometric device to cloud.
 * Install once, runs automatically at Windows/Mac startup.
 *
 * Config: config.json in same folder as this app (or .exe).
 */

const path = require('path');
const fs = require('fs');

// When built with pkg, process.execPath is the exe; otherwise it's node + script
const appDir = path.dirname(process.execPath);
const configPath = path.join(appDir, 'config.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('ERROR: config.json not found or invalid. Create it in the same folder as this app.');
    console.error('Copy config.example.json to config.json and fill in your values.');
    process.exit(1);
  }
}

const config = loadConfig();
const DEVICE_IP = config.deviceIp || '192.168.1.50';
const DEVICE_PORT = parseInt(config.devicePort || '4370', 10);
const DEVICE_API_KEY = config.deviceApiKey;
const BACKEND_URL = (config.backendUrl || 'http://localhost:3000').replace(/\/$/, '');
const POLL_INTERVAL_MS = parseInt(config.pollIntervalMs || '60000', 10);

const runOnce = process.argv.includes('--once');

process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection (will retry): ${reason && (reason.message || reason)}`);
});

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    const logPath = path.join(appDir, 'connector.log');
    fs.appendFileSync(logPath, line + '\n');
  } catch (_) {}
}

function assignInOut(logs) {
  const byUserAndDay = new Map();
  for (const log of logs) {
    const key = `${log.employee_code}|${log.punch_time.slice(0, 10)}`;
    if (!byUserAndDay.has(key)) byUserAndDay.set(key, []);
    byUserAndDay.get(key).push(log);
  }
  for (const list of byUserAndDay.values()) {
    list.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));
    list.forEach((l, i) => {
      l.punch_type = i % 2 === 0 ? 'in' : 'out';
    });
  }
  return logs;
}

async function fetchAndPush() {
  if (!DEVICE_API_KEY) {
    log('ERROR: deviceApiKey not set in config.json');
    return;
  }

  const ZKAttendanceClient = require('zk-attendance-sdk');
  const client = new ZKAttendanceClient(DEVICE_IP, DEVICE_PORT, 5000);

  try {
    await client.createSocket();
    log(`Connected to device at ${DEVICE_IP}:${DEVICE_PORT}`);

    let result;
    try {
      result = await client.getAttendances();
    } catch (sdkErr) {
      log(`Device read error (will retry): ${sdkErr.message}`);
      return;
    } finally {
      try {
        await client.disconnect();
      } catch (_) {}
    }

    const rawRecords = result?.data || [];
    if (rawRecords.length === 0) {
      log('No attendance records on device.');
      return;
    }

    const logs = rawRecords
      .filter((r) => r.deviceUserId != null && r.recordTime != null)
      .map((r) => ({
        employee_code: String(r.deviceUserId).trim(),
        punch_time: new Date(r.recordTime).toISOString(),
        punch_type: 'in',
      }));

    if (logs.length === 0) {
      log('No valid records after mapping.');
      return;
    }

    assignInOut(logs);

    const payload = {
      logs: logs.map((l) => ({
        employee_code: l.employee_code,
        punch_time: l.punch_time,
        punch_type: l.punch_type,
      })),
    };

    const res = await fetch(`${BACKEND_URL}/api/device/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-key': DEVICE_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      log(`Push failed ${res.status}: ${body.message || res.statusText}`);
      return;
    }
    log(`Pushed ${body.data?.inserted ?? logs.length} logs to backend.`);

    const clearClient = new ZKAttendanceClient(DEVICE_IP, DEVICE_PORT, 5000);
    try {
      await clearClient.createSocket();
      await clearClient.clearAttendanceLog();
      log('Cleared attendance logs from device.');
    } catch (e) {
      log(`Warning: could not clear device logs: ${e.message}`);
    } finally {
      try {
        await clearClient.disconnect();
      } catch (_) {}
    }
  } catch (err) {
    log(`Error: ${err.message}`);
    try {
      await client.disconnect();
    } catch (_) {}
  }
}

async function main() {
  log('Connector started.');
  log(`Device: ${DEVICE_IP}:${DEVICE_PORT} | Backend: ${BACKEND_URL}`);

  if (runOnce) {
    await fetchAndPush();
    process.exit(0);
  }

  setInterval(() => {
    fetchAndPush().catch((e) => log(`Poll error: ${e.message}`));
  }, POLL_INTERVAL_MS);
  log(`Polling every ${POLL_INTERVAL_MS / 1000}s. Auto-starts with system.`);

  fetchAndPush().catch((e) => log(`Poll error: ${e.message}`));
}

main();
