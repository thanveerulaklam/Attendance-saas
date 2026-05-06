#!/usr/bin/env node
process.env.TZ = 'Asia/Kolkata';

const path = require('path');
const fs = require('fs');
const DigestFetch = require('digest-fetch');

const appDir = process.pkg ? path.dirname(process.execPath) : __dirname;
const configPath = path.join(appDir, 'config.hikvision.json');
const statePath = path.join(appDir, 'hikvision.state.json');

function readJson(filePath, fallback = null) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function log(message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(appDir, 'connector-hik.log'), `${line}\n`);
  } catch (_) {}
}

function formatErr(err) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch (_) {
    return String(err);
  }
}

function loadConfig() {
  const cfg = readJson(configPath);
  if (!cfg) {
    console.error('ERROR: config.hikvision.json not found or invalid.');
    console.error('Copy config.example.hikvision.json next to this app and rename it to config.hikvision.json.');
    process.exit(1);
  }
  return cfg;
}

function getPunchType(event, cfg) {
  const mode = String(event.currentVerifyMode || '').toLowerCase();
  if (mode.includes('check out') || mode.includes('checkout') || mode.includes('out')) {
    return 'out';
  }
  const minor = Number(event.minor);
  if (Array.isArray(cfg.exitMinorCodes) && cfg.exitMinorCodes.includes(minor)) {
    return 'out';
  }
  return 'in';
}

function toLogs(events, cfg) {
  const mapped = [];
  for (const ev of events) {
    const employeeCode = String(
      ev.employeeNoString ||
      ev.employeeNo ||
      ev.cardNo ||
      ''
    ).trim();
    if (!employeeCode) continue;

    const ts = ev.time || ev.dateTime || ev.eventTime || ev.localTime;
    const punchTime = new Date(ts);
    if (!ts || Number.isNaN(punchTime.getTime())) continue;

    mapped.push({
      employee_code: employeeCode,
      punch_time: punchTime.toISOString(),
      punch_type: getPunchType(ev, cfg),
    });
  }
  return mapped;
}

function getEventList(payload) {
  if (!payload || typeof payload !== 'object') return [];

  const candidates = [
    payload.AcsEvent?.InfoList,
    payload.AcsEvent?.AcsEventInfo,
    payload.AcsEventInfo,
    payload.InfoList,
    payload.EventList,
    payload.list,
    payload.events,
  ];
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

async function postLogsToBackend(cfg, logs) {
  if (!logs.length) return { inserted: 0 };

  const pushUrl = `${String(cfg.backendUrl || 'https://punchpay.in').replace(/\/$/, '')}/api/device/push`;
  const res = await fetch(pushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-key': cfg.deviceApiKey,
    },
    body: JSON.stringify({ logs }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Push failed ${res.status}: ${body.message || res.statusText}`);
  }
  return body.data || {};
}

async function fetchEventsFromDevice(client, cfg, cursor) {
  const url = `http://${cfg.deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;
  const now = new Date();
  const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const body = {
    AcsEventCond: {
      searchID: String(cursor.searchId || '1'),
      searchResultPosition: Number(cursor.position || 0),
      maxResults: Number(cfg.maxResultsPerPoll || 100),
      major: Number(cfg.majorCode || 0),
      minor: Number(cfg.minorCode || 0),
      startTime: cfg.startTime || '2020-01-01T00:00:00+05:30',
      endTime,
    },
  };

  const res = await client.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Device query failed ${res.status}. ${txt.slice(0, 200)}`);
  }

  return res.json();
}

async function runSyncTick(cfg, cursor) {
  const client = new DigestFetch(cfg.hikUsername, cfg.hikPassword);
  const payload = await fetchEventsFromDevice(client, cfg, cursor);
  const events = getEventList(payload);
  if (!events.length) {
    log('No new events from device.');
    return cursor;
  }

  const logs = toLogs(events, cfg);
  if (!logs.length) {
    log(`Fetched ${events.length} event(s), but none mapped to valid employee/timestamp rows.`);
    return {
      ...cursor,
      position: Number(cursor.position || 0) + events.length,
      lastEventAt: new Date().toISOString(),
    };
  }

  const data = await postLogsToBackend(cfg, logs);
  log(`Fetched ${events.length} events; pushed ${Number(data.inserted ?? logs.length)} logs to backend.`);

  return {
    ...cursor,
    position: Number(cursor.position || 0) + events.length,
    lastEventAt: logs[logs.length - 1].punch_time,
  };
}

async function main() {
  const cfg = loadConfig();
  const pollIntervalMs = Number(cfg.pollIntervalMs || 60000);
  const runOnce = process.argv.includes('--once');

  if (!cfg.deviceIp || !cfg.deviceApiKey || !cfg.hikUsername || !cfg.hikPassword) {
    console.error('ERROR: config.hikvision.json must include deviceIp, deviceApiKey, hikUsername, hikPassword.');
    process.exit(1);
  }

  let cursor = readJson(statePath, {
    searchId: '1',
    position: Number(cfg.initialPosition || 0),
    lastEventAt: null,
  });
  let inProgress = false;

  log(`Hikvision connector started. Device: ${cfg.deviceIp} | Backend: ${cfg.backendUrl || 'https://punchpay.in'}`);

  const tick = async () => {
    if (inProgress) {
      log('Previous sync still in progress; skipping this scheduled tick.');
      return;
    }
    inProgress = true;
    try {
      const nextCursor = await runSyncTick(cfg, cursor);
      cursor = nextCursor;
      writeJson(statePath, cursor);
    } catch (err) {
      log(`Sync failed (will retry): ${formatErr(err)}`);
    } finally {
      inProgress = false;
    }
  };

  if (runOnce) {
    await tick();
    process.exit(0);
  }

  await tick();
  setInterval(() => {
    tick();
  }, pollIntervalMs);
  log(`Polling every ${Math.floor(pollIntervalMs / 1000)} seconds.`);
}

main().catch((err) => {
  log(`Fatal: ${formatErr(err)}`);
  process.exit(1);
});
