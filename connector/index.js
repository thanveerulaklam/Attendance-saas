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
const BACKEND_URL = (config.backendUrl || 'https://punchpay.in').replace(/\/$/, '');
const POLL_INTERVAL_MS = parseInt(config.pollIntervalMs || '60000', 10);

const runOnce = process.argv.includes('--once');

/**
 * One device: use top-level deviceIp + deviceApiKey (legacy).
 * Two+ devices on same LAN: use "devices": [ { deviceIp, deviceApiKey }, ... ] — each needs its own key from the app.
 */
function normalizeDevices(cfg) {
  if (Array.isArray(cfg.devices) && cfg.devices.length > 0) {
    return cfg.devices
      .map((d, i) => ({
        label: d.label || `device-${i + 1}`,
        deviceIp: d.deviceIp || d.ip,
        devicePort: parseInt(d.devicePort || d.port || cfg.devicePort || '4370', 10),
        deviceApiKey: d.deviceApiKey || d.apiKey,
      }))
      .filter((d) => d.deviceIp && d.deviceApiKey);
  }
  const ip = cfg.deviceIp || '192.168.1.50';
  const key = cfg.deviceApiKey;
  if (!key) return [];
  return [
    {
      label: 'device-1',
      deviceIp: ip,
      devicePort: parseInt(cfg.devicePort || '4370', 10),
      deviceApiKey: key,
    },
  ];
}

const DEVICES = normalizeDevices(config);

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

/** Split pushes so each request stays under proxy limits (413) even with months of backlog. */
const MAX_LOGS_PER_PUSH = 1200;

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

async function fetchAndPushOne(dev) {
  const { label, deviceIp, devicePort, deviceApiKey } = dev;
  if (!deviceApiKey) {
    log(`ERROR [${label}]: deviceApiKey not set`);
    return;
  }

  const ZKAttendanceClient = require('zk-attendance-sdk');
  const client = new ZKAttendanceClient(deviceIp, devicePort, 5000);

  try {
    await client.createSocket();
    log(`[${label}] Connected to device at ${deviceIp}:${devicePort}`);

    let size = 0;
    let sizeCheckFailed = false;
    try {
      log(`[${label}] Reading log buffer size from device…`);
      size = await client.getAttendanceSize();
      log(`[${label}] Device reports ${size} record(s) in buffer.`);
    } catch (sizeErr) {
      const msg = sizeErr?.message || sizeErr?.msg || (typeof sizeErr === 'string' ? sizeErr : (sizeErr && typeof sizeErr === 'object' ? (sizeErr.toString?.() !== '[object Object]' ? sizeErr.toString() : JSON.stringify(sizeErr)) : String(sizeErr)));
      log(`[${label}] Size check failed (will try to fetch anyway): ${msg}`);
      sizeCheckFailed = true;
      size = 1; // so we don't exit early; try getAttendances() once
    }

    if (size === 0) {
      log(`[${label}] No attendance records on device.`);
      try { await client.disconnect(); } catch (_) {}
      return;
    }

    let result;
    try {
      log(
        `[${label}] Downloading attendance logs (this can take several minutes if the buffer is large; please wait)…`
      );
      result = await client.getAttendances();
      log(`[${label}] Finished download (${result?.data?.length ?? 0} raw row(s)).`);
    } catch (sdkErr) {
      const errMsg = sdkErr?.toast?.() || sdkErr?.err?.message || sdkErr?.message || sdkErr?.msg
        || (typeof sdkErr === 'string' ? sdkErr : (sdkErr?.toString?.() !== '[object Object]' ? sdkErr?.toString?.() : 'Device communication failed'));
      log(`[${label}] Device read error (will retry): ${errMsg}`);
      try { await client.disconnect(); } catch (_) {}
      return;
    } finally {
      try { await client.disconnect(); } catch (_) {}
    }

    const rawRecords = result?.data || [];
    if (rawRecords.length === 0) {
      log(`[${label}] No attendance records on device.`);
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
      log(`[${label}] No valid records after mapping.`);
      return;
    }

    const logsToSend = assignInOut(logs);

    const entries = logsToSend.map((l) => ({
      employee_code: l.employee_code,
      punch_time: l.punch_time,
      punch_type: l.punch_type,
    }));

    const pushUrl = `${BACKEND_URL.replace(/\/$/, '')}/api/device/push`;
    let totalInserted = 0;
    const numChunks = Math.ceil(entries.length / MAX_LOGS_PER_PUSH) || 1;

    for (let offset = 0; offset < entries.length; offset += MAX_LOGS_PER_PUSH) {
      const chunk = entries.slice(offset, offset + MAX_LOGS_PER_PUSH);
      const chunkIndex = Math.floor(offset / MAX_LOGS_PER_PUSH) + 1;
      const payload = { logs: chunk };

      let res;
      try {
        res = await fetch(pushUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-device-key': deviceApiKey,
          },
          body: JSON.stringify(payload),
        });
      } catch (fetchErr) {
        const cause = fetchErr?.cause?.message || fetchErr?.cause?.code || fetchErr?.code;
        log(
          `[${label}] Backend unreachable (chunk ${chunkIndex}/${numChunks}): ${fetchErr.message}${cause ? ` (${cause})` : ''}. Check backendUrl in config.json.`
        );
        return;
      }

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        log(
          `[${label}] Push failed ${res.status} (chunk ${chunkIndex}/${numChunks}, ${chunk.length} logs): ${body.message || res.statusText}`
        );
        return;
      }
      totalInserted += Number(body.data?.inserted ?? chunk.length) || 0;
    }

    log(`[${label}] Pushed ${totalInserted} logs to backend in ${numChunks} chunk(s).`);

    const clearClient = new ZKAttendanceClient(deviceIp, devicePort, 5000);
    try {
      await clearClient.createSocket();
      await clearClient.clearAttendanceLog();
      log(`[${label}] Cleared attendance logs from device.`);
    } catch (e) {
      log(`[${label}] Warning: could not clear device logs: ${e.message}`);
    } finally {
      try {
        await clearClient.disconnect();
      } catch (_) {}
    }
  } catch (err) {
    log(`[${label}] Error: ${formatErr(err)}`);
    try {
      await client.disconnect();
    } catch (_) {}
  }
}

async function pollAllDevices() {
  for (const dev of DEVICES) {
    await fetchAndPushOne(dev);
  }
}

/** Prevents overlapping runs: large device buffers can take several minutes per poll. */
let pollInProgress = false;

async function runPollTick() {
  if (pollInProgress) {
    log('Previous sync still in progress; skipping this scheduled tick (wait for it to finish).');
    return;
  }
  pollInProgress = true;
  try {
    await pollAllDevices();
  } catch (e) {
    log(`Poll error: ${formatErr(e)}`);
  } finally {
    pollInProgress = false;
  }
}

async function main() {
  if (DEVICES.length === 0) {
    console.error('ERROR: No devices configured. Set deviceIp + deviceApiKey, or a non-empty "devices" array in config.json');
    process.exit(1);
  }

  log('Connector started.');
  log(`Devices: ${DEVICES.length} | Backend: ${BACKEND_URL}`);
  DEVICES.forEach((d) => log(`  - ${d.label}: ${d.deviceIp}:${d.devicePort}`));

  if (runOnce) {
    await pollAllDevices();
    process.exit(0);
  }

  setInterval(() => {
    runPollTick();
  }, POLL_INTERVAL_MS);
  log(`Polling every ${POLL_INTERVAL_MS / 1000}s. Auto-starts with system.`);

  runPollTick();
}

main();
