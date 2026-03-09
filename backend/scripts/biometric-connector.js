#!/usr/bin/env node
/**
 * Biometric connector: pulls attendance logs from eSSL SilkBio 101 TC (ZKTeco protocol)
 * and pushes them to this project's POST /api/device/push.
 *
 * Usage (from backend folder):
 *   node scripts/biometric-connector.js [--once]
 *
 * Env (or .env):
 *   BIOMETRIC_DEVICE_IP=192.168.1.50
 *   BIOMETRIC_DEVICE_PORT=4370
 *   DEVICE_API_KEY=<your device API key from the app>
 *   BACKEND_URL=https://punchpay.in
 *
 * --once: run once and exit; otherwise runs every 60 seconds.
 */

require('dotenv').config();
const ZKAttendanceClient = require('zk-attendance-sdk');

const DEVICE_IP = process.env.BIOMETRIC_DEVICE_IP || '192.168.1.50';
const DEVICE_PORT = parseInt(process.env.BIOMETRIC_DEVICE_PORT || '4370', 10);
const DEVICE_API_KEY = process.env.DEVICE_API_KEY;
const BACKEND_URL = (process.env.BACKEND_URL || 'https://punchpay.in').replace(/\/$/, '');
const POLL_INTERVAL_MS = parseInt(process.env.BIOMETRIC_POLL_INTERVAL_MS || '60000', 10);

const runOnce = process.argv.includes('--once');

// Prevent SDK unhandled promise rejections from crashing the process (e.g. empty device reply)
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection (will retry): ${reason && (reason.message || reason)}`);
});

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

/** Minimum minutes between OUT and next IN to count as a real break; shorter gaps are treated as accidental. */
const MIN_BREAK_MINUTES = 30;

/**
 * Infer punch_type when device doesn't provide it: first punch of day = in, second = out, etc.
 * Removes OUT→IN pairs where gap < 30 min (short breaks/double-taps).
 */
function assignInOut(logs) {
  const byUserAndDay = new Map();
  for (const log of logs) {
    const key = `${log.employee_code}|${log.punch_time.slice(0, 10)}`;
    if (!byUserAndDay.has(key)) byUserAndDay.set(key, []);
    byUserAndDay.get(key).push(log);
  }

  const result = [];
  const minBreakMs = MIN_BREAK_MINUTES * 60 * 1000;

  for (const list of byUserAndDay.values()) {
    list.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));

    let filtered = [];
    for (let i = 0; i < list.length; i++) {
      const curr = list[i];
      const next = list[i + 1];
      const currType = i % 2 === 0 ? 'in' : 'out';
      const nextType = (i + 1) % 2 === 0 ? 'in' : 'out';

      if (currType === 'out' && next && nextType === 'in') {
        const gapMs = new Date(next.punch_time) - new Date(curr.punch_time);
        if (gapMs < minBreakMs) {
          i++;
          continue;
        }
      }
      filtered.push(curr);
    }

    filtered.forEach((l, i) => {
      l.punch_type = i % 2 === 0 ? 'in' : 'out';
      result.push(l);
    });
  }
  return result;
}

async function fetchAndPush() {
  if (!DEVICE_API_KEY) {
    log('ERROR: DEVICE_API_KEY is not set. Set it in .env or environment.');
    return;
  }

  const client = new ZKAttendanceClient(DEVICE_IP, DEVICE_PORT, 5000);

  try {
    await client.createSocket();
    log(`Connected to device at ${DEVICE_IP}:${DEVICE_PORT}`);

    let size = 0;
    try {
      size = await client.getAttendanceSize();
    } catch (_) {}

    if (size === 0) {
      log('No attendance records on device.');
      try {
        await client.disconnect();
      } catch (_) {}
      return;
    }

    let result;
    try {
      result = await client.getAttendances();
    } catch (sdkErr) {
      const errMsg = (sdkErr && (sdkErr.message || String(sdkErr))) || 'Unknown error';
      log(`Device read error (will retry): ${errMsg}`);
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

    // Map SDK format to our API format
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

    const logsToSend = assignInOut(logs);

    const payload = {
      logs: logsToSend.map((l) => ({
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
    log(`Pushed ${body.data?.inserted ?? logsToSend.length} logs to backend.`);

    // Clear device logs after successful push (reconnect to do it)
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
  log('Biometric connector started.');
  log(`Device: ${DEVICE_IP}:${DEVICE_PORT} | Backend: ${BACKEND_URL}`);

  if (runOnce) {
    await fetchAndPush();
    process.exit(0);
  }

  // Register interval FIRST so it runs even if the first poll hangs or crashes
  setInterval(() => {
    fetchAndPush().catch((e) => log(`Poll error: ${e.message}`));
  }, POLL_INTERVAL_MS);
  log(`Polling every ${POLL_INTERVAL_MS / 1000}s. Ctrl+C to stop.`);

  // First poll (don't await – SDK can hang on rejection)
  fetchAndPush().catch((e) => log(`Poll error: ${e.message}`));
}

main();
