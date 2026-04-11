#!/usr/bin/env node
process.env.TZ = 'Asia/Kolkata';

/** Must load before zk-attendance-sdk: fixes device punch time as IST (see patchZkSdkIst.js). */
require('./patchZkSdkIst');

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
const BACKEND_URL = (config.backendUrl || 'https://punchpay.in').replace(/\/$/, '');
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

/** SDK / network errors are not always Error instances with .message */
function formatErr(err) {
  if (err == null) return 'unknown error';
  if (typeof err === 'string') return err;
  const m = err.message || err.msg || err.code;
  const c = err.cause && (err.cause.message || err.cause.code);
  if (m && c) return `${m} (${c})`;
  if (m) return String(m);
  if (typeof err.toString === 'function' && err.toString() !== '[object Object]') return err.toString();
  try {
    return JSON.stringify(err);
  } catch (_) {
    return String(err);
  }
}

/** Minimum minutes between OUT and next IN to count as a real break; shorter gaps are treated as accidental. */
const MIN_BREAK_MINUTES = 30;

function assignInOut(logs) {
  const byUserAndDay = new Map();
  for (const log of logs) {
    const dayKey = new Date(log.punch_time).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    });
    const key = `${log.employee_code}|${dayKey}`;
    if (!byUserAndDay.has(key)) byUserAndDay.set(key, []);
    byUserAndDay.get(key).push(log);
  }

  const result = [];
  const minBreakMs = MIN_BREAK_MINUTES * 60 * 1000;

  for (const list of byUserAndDay.values()) {
    list.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));

    // Remove OUT→IN pairs where gap < 30 min (short breaks / double-taps)
    let filtered = [];
    for (let i = 0; i < list.length; i++) {
      const curr = list[i];
      const next = list[i + 1];
      const currType = i % 2 === 0 ? 'in' : 'out';
      const nextType = (i + 1) % 2 === 0 ? 'in' : 'out';

      if (currType === 'out' && next && nextType === 'in') {
        const gapMs = new Date(next.punch_time) - new Date(curr.punch_time);
        if (gapMs < minBreakMs) {
          i++; // skip both curr and next
          continue;
        }
      }
      filtered.push(curr);
    }

    // Re-apply zigzag on remaining punches
    filtered.forEach((l, i) => {
      l.punch_type = i % 2 === 0 ? 'in' : 'out';
      result.push(l);
    });
  }
  return result;
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

    let size = 0;
    let sizeCheckFailed = false;
    try {
      size = await client.getAttendanceSize();
    } catch (sizeErr) {
      const msg = sizeErr?.message || sizeErr?.msg || (typeof sizeErr === 'string' ? sizeErr : (sizeErr && typeof sizeErr === 'object' ? (sizeErr.toString?.() !== '[object Object]' ? sizeErr.toString() : JSON.stringify(sizeErr)) : String(sizeErr)));
      log(`Size check failed (will try to fetch anyway): ${msg}`);
      sizeCheckFailed = true;
      size = 1; // so we don't exit early; try getAttendances() once
    }

    if (size === 0) {
      log('No attendance records on device.');
      try { await client.disconnect(); } catch (_) {}
      return;
    }

    let result;
    try {
      result = await client.getAttendances();
    } catch (sdkErr) {
      const errMsg = sdkErr?.toast?.() || sdkErr?.err?.message || sdkErr?.message || sdkErr?.msg
        || (typeof sdkErr === 'string' ? sdkErr : (sdkErr?.toString?.() !== '[object Object]' ? sdkErr?.toString?.() : 'Device communication failed'));
      log(`Device read error (will retry): ${errMsg}`);
      try { await client.disconnect(); } catch (_) {}
      return;
    } finally {
      try { await client.disconnect(); } catch (_) {}
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
        // recordTime is ISO UTC string from patched SDK (IST wall clock from device)
        punch_time: typeof r.recordTime === 'string' ? r.recordTime : new Date(r.recordTime).toISOString(),
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

    const pushUrl = `${BACKEND_URL.replace(/\/$/, '')}/api/device/push`;
    let res;
    try {
      res = await fetch(pushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-key': DEVICE_API_KEY,
        },
        body: JSON.stringify(payload),
      });
    } catch (fetchErr) {
      const cause = fetchErr?.cause?.message || fetchErr?.cause?.code || fetchErr?.code;
      log(`Backend unreachable: ${fetchErr.message}${cause ? ` (${cause})` : ''}. Check backendUrl in config.json.`);
      return;
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      log(`Push failed ${res.status}: ${body.message || res.statusText}`);
      return;
    }
    log(`Pushed ${body.data?.inserted ?? logsToSend.length} logs to backend.`);

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
    log(`Error: ${formatErr(err)}`);
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
    fetchAndPush().catch((e) => log(`Poll error: ${formatErr(e)}`));
  }, POLL_INTERVAL_MS);
  log(`Polling every ${POLL_INTERVAL_MS / 1000}s. Auto-starts with system.`);

  fetchAndPush().catch((e) => log(`Poll error: ${formatErr(e)}`));
}

main();
