#!/usr/bin/env node
process.env.TZ = 'Asia/Kolkata';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { digestJsonPost } = require('./digestHttpJsonPost');

const appDir = process.pkg ? path.dirname(process.execPath) : __dirname;
const configPath = path.join(appDir, 'config.hikvision.json');
const statePath = path.join(appDir, 'hikvision.state.json');
const logFilePath = path.join(appDir, 'connector-hik.log');

/** Writes before normal log(); ensures a log file exists when debugging double-click / missing config. */
function bootLog(message) {
  const line = `[${new Date().toISOString()}] [boot] ${message}\n`;
  try {
    process.stdout.write(line);
  } catch (_) {}
  try {
    fs.appendFileSync(logFilePath, line);
  } catch (err) {
    try {
      process.stderr.write(`Cannot write ${logFilePath}: ${err && err.message}\n`);
    } catch (_) {}
  }
}

bootLog(`cwd=${process.cwd()} appDir=${appDir} config=${configPath}`);

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
    fs.appendFileSync(logFilePath, `${line}\n`);
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
    bootLog(
      'config.hikvision.json missing or invalid JSON. Put it in the SAME folder as connector-hik.exe (not inside dist unless the exe is there).'
    );
    console.error('ERROR: config.hikvision.json not found or invalid.');
    console.error(`Expected path: ${configPath}`);
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

function buildAcsEventStrategies(cfg, cursor, endTime) {
  const majorCfg = Object.prototype.hasOwnProperty.call(cfg, 'majorCode') ? Number(cfg.majorCode) : 5;
  const minorCfg = Object.prototype.hasOwnProperty.call(cfg, 'minorCode') ? Number(cfg.minorCode) : 0;
  if (majorCfg === 0) {
    log('Warning: majorCode is 0 in config. DS-K1T usually needs 5; trying forced major=5 strategies anyway.');
  }

  const mkCond = (opts = {}) => {
    const c = {
      searchID: opts.searchID != null ? String(opts.searchID) : String(cursor.searchId || '1'),
      searchResultPosition: Number(cursor.position || 0),
      maxResults: Number(cfg.maxResultsPerPoll || 100),
      major: opts.major != null ? Number(opts.major) : majorCfg,
      minor: opts.minor != null ? Number(opts.minor) : minorCfg,
      startTime: cfg.startTime || '2020-01-01T00:00:00+05:30',
      endTime,
    };
    if (opts.eventAttribute) {
      c.eventAttribute = String(opts.eventAttribute);
    }
    return c;
  };

  const strategies = [];
  strategies.push({ name: 'force-major5-minor0', body: { AcsEventCond: mkCond({ major: 5, minor: 0 }) } });
  if (cfg.eventAttribute) {
    strategies.push({
      name: 'force-major5-user-eventAttribute',
      body: { AcsEventCond: mkCond({ major: 5, minor: 0, eventAttribute: String(cfg.eventAttribute) }) },
    });
  }
  strategies.push({ name: 'config-major-minor', body: { AcsEventCond: mkCond({}) } });
  strategies.push({
    name: 'major5-minor0-eventAttribute-attendance',
    body: { AcsEventCond: mkCond({ major: 5, minor: 0, eventAttribute: 'attendance' }) },
  });
  strategies.push({ name: 'major5-minor75', body: { AcsEventCond: mkCond({ major: 5, minor: 75 }) } });
  strategies.push({
    name: 'major5-minor0-searchId-uuid',
    body: { AcsEventCond: mkCond({ major: 5, minor: 0, searchID: crypto.randomUUID() }) },
  });
  strategies.push({
    name: 'major5-minor75-searchId-uuid',
    body: { AcsEventCond: mkCond({ major: 5, minor: 75, searchID: crypto.randomUUID() }) },
  });
  return strategies;
}

async function fetchEventsFromDevice(cfg, cursor) {
  const portSuffix = cfg.devicePort != null && cfg.devicePort !== '' ? `:${cfg.devicePort}` : '';
  const now = new Date();
  const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const strategies = buildAcsEventStrategies(cfg, cursor, endTime);

  const schemePrimary = String(cfg.deviceScheme || 'http').replace(/:$/, '');
  const schemes = [schemePrimary];
  if (schemePrimary === 'http' && cfg.tryHttps !== false) {
    schemes.push('https');
  }

  /** Last error from a completed HTTP response (status + body); not overwritten by later TLS connect failures. */
  let lastDeviceResponseErr = '';
  let lastNetworkErr = '';
  for (const scheme of schemes) {
    if (scheme === 'https' && schemePrimary === 'http' && schemes.length > 1) {
      log('Trying HTTPS on port 443 as well. If the device has no TLS listener, add "tryHttps": false to config to skip this.');
    }
    const url = `${scheme}://${cfg.deviceIp}${portSuffix}/ISAPI/AccessControl/AcsEvent?format=json`;
    for (const { name, body } of strategies) {
      log(`AcsEvent try scheme=${scheme} strategy=${name} ${JSON.stringify(body).slice(0, 220)}`);
      let res;
      try {
        res = await digestJsonPost(url, cfg.hikUsername, cfg.hikPassword, body);
      } catch (e) {
        const msg = formatErr(e);
        lastNetworkErr = msg;
        log(`AcsEvent request error scheme=${scheme} strategy=${name}: ${msg}`);
        continue;
      }
      if (res.ok) {
        if (scheme !== schemePrimary || name !== strategies[0].name) {
          log(`AcsEvent OK using scheme=${scheme} strategy=${name} (save working combo in config to skip retries).`);
        }
        return res.json();
      }
      const txt = await res.text().catch(() => '');
      const oneLine = `${res.status} ${txt.slice(0, 240)}`;
      lastDeviceResponseErr = oneLine;
      const softFail = res.status === 403 && /notSupport|Invalid Operation|badParameters/i.test(txt);
      if (!softFail) {
        throw new Error(`Device query failed ${res.status}. ${txt.slice(0, 200)}`);
      }
    }
  }

  const primary = lastDeviceResponseErr || lastNetworkErr || 'unknown';
  let note = '';
  if (
    schemes.length > 1 &&
    schemePrimary === 'http' &&
    lastDeviceResponseErr &&
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|certificate/i.test(lastNetworkErr)
  ) {
    note =
      ' HTTPS to :443 failed to connect; the real device response was on HTTP (see above). '
      + 'Use "tryHttps": false to avoid waiting on HTTPS when the terminal has no web server on 443.';
  }

  throw new Error(
    `Device query failed after all AcsEvent strategies (${schemes.join(',')}). Last: ${primary}.${note} `
      + 'This firmware may not support searchable /ISAPI/AccessControl/AcsEvent on LAN (some K1T builds are Hik-Connect–only). '
      + 'Options: firmware update, enable full ISAPI in device web/SADP if available, or use another integration path.'
  );
}

async function runSyncTick(cfg, cursor) {
  const payload = await fetchEventsFromDevice(cfg, cursor);
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
  bootLog(`Fatal: ${formatErr(err)}`);
  log(`Fatal: ${formatErr(err)}`);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  bootLog(`uncaughtException: ${formatErr(err)}`);
  process.exit(1);
});
