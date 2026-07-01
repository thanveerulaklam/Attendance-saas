#!/usr/bin/env node
/**
 * Matrix COSEC connector — polls COSEC Device HTTP API and pushes to PunchPay.
 * Separate from ZKTeco connector (index.js). Does not use port 4370 / zk-attendance-sdk.
 */
process.env.TZ = 'Asia/Kolkata';

const path = require('path');
const fs = require('fs');

const appDir = process.pkg ? path.dirname(process.execPath) : __dirname;
const configPath = path.join(appDir, 'config.cosec.json');
const statePath = path.join(appDir, 'cosec.state.json');

/** User Allowed events (101–110) per COSEC Device API appendix. */
const DEFAULT_ATTENDANCE_EVENT_IDS = new Set([
  '101', '102', '103', '104', '105', '106', '107', '108', '109', '110',
]);

/** Time Stamping Function — T&A marking with special-function code in detail fields. */
const TIME_STAMPING_EVENT_ID = '411';

/** Special-function codes: odd = IN, even = OUT (1=Official IN, 2=Official OUT, …). */
const DEFAULT_EXIT_FUNCTION_CODES = [2, 4, 6, 8, 10, 12];

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
    fs.appendFileSync(path.join(appDir, 'connector-cosec.log'), `${line}\n`);
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
    console.error('ERROR: config.cosec.json not found or invalid.');
    console.error('Copy config.example.cosec.json next to this app and rename it to config.cosec.json.');
    process.exit(1);
  }
  return cfg;
}

function basicAuthHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

function getApiPrefixes(cfg) {
  const configured = String(cfg.apiPrefix || '').trim();
  if (configured) {
    return [configured.replace(/\/$/, '')];
  }
  return ['/device.cgi', ''];
}

function buildEventsUrl(prefix, params) {
  const base = prefix || '';
  const qs = new URLSearchParams({
    action: 'getevent',
    'roll-over-count': String(params.rollOverCount),
    'seq-number': String(params.seqNumber),
    'no-of-events': String(params.noOfEvents),
    format: 'xml',
  });
  return `http://${params.deviceIp}${base}/events?${qs.toString()}`;
}

function buildEventCountUrl(prefix, deviceIp) {
  const base = prefix || '';
  return `http://${deviceIp}${base}/command?action=geteventcount&format=xml`;
}

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseCosecXmlEvents(xmlText) {
  const events = [];
  const blockRegex = /<Events>([\s\S]*?)<\/Events>/gi;
  let blockMatch = blockRegex.exec(xmlText);
  while (blockMatch) {
    const block = blockMatch[1];
    const event = {};
    const tagRegex = /<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g;
    let tagMatch = tagRegex.exec(block);
    while (tagMatch) {
      const key = tagMatch[1].toLowerCase();
      event[key] = decodeXmlEntities(tagMatch[2].trim());
      tagMatch = tagRegex.exec(block);
    }
    if (Object.keys(event).length > 0) {
      events.push(event);
    }
    blockMatch = blockRegex.exec(xmlText);
  }

  if (events.length === 0) {
    const responseCode = xmlText.match(/<Response-Code>([^<]+)<\/Response-Code>/i);
    if (responseCode) {
      return { responseCode: responseCode[1].trim(), events: [] };
    }
    const errorText = xmlText.match(/<Response>([^<]+)<\/Response>/i);
    if (errorText) {
      return { error: errorText[1].trim(), events: [] };
    }
  }

  return { events };
}

function getField(event, ...names) {
  for (const name of names) {
    const key = name.toLowerCase();
    if (event[key] != null && String(event[key]).trim() !== '') {
      return String(event[key]).trim();
    }
  }
  return '';
}

function getAttendanceEventIds(cfg) {
  if (Array.isArray(cfg.attendanceEventIds) && cfg.attendanceEventIds.length > 0) {
    return new Set(cfg.attendanceEventIds.map(String));
  }
  return DEFAULT_ATTENDANCE_EVENT_IDS;
}

function getExitFunctionCodes(cfg) {
  if (Array.isArray(cfg.exitFunctionCodes)) {
    return cfg.exitFunctionCodes.map(Number).filter((n) => !Number.isNaN(n));
  }
  return DEFAULT_EXIT_FUNCTION_CODES;
}

function punchTypeFromEntryExit(detail3) {
  const value = Number(detail3);
  if (Number.isNaN(value)) return null;
  // COSEC Field 3 bit 0/1: 0,2 = entry; 1,3 = exit (with/without timestamp active).
  if (value === 1 || value === 3) return 'out';
  if (value === 0 || value === 2) return 'in';
  return null;
}

function punchTypeFromSpecialFunction(code, exitCodes) {
  const num = Number(code);
  if (Number.isNaN(num) || num <= 0) return null;
  if (exitCodes.includes(num)) return 'out';
  if (num % 2 === 0) return 'out';
  return 'in';
}

function getPunchType(event, cfg) {
  const exitCodes = getExitFunctionCodes(cfg);
  const specialFn = getField(event, 'detail-2', 'special-function', 'function-id', 'detail-4');
  const fromFn = punchTypeFromSpecialFunction(specialFn, exitCodes);
  if (fromFn) return fromFn;

  const detail3 = getField(event, 'detail-3', 'entry-exit');
  const fromEntry = punchTypeFromEntryExit(detail3);
  if (fromEntry) return fromEntry;

  return 'in';
}

function parseEventDateTime(event) {
  const raw = getField(
    event,
    'event-time',
    'date-time',
    'datetime',
    'time',
    'detail-5',
    'date'
  );
  if (!raw) return null;

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (dmy) {
    const [, d, mo, y, h, mi, s = '0'] = dmy;
    const dt = new Date(
      `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:${s.padStart(2, '0')}+05:30`
    );
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (isoLike) {
    const dt = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return fallback;

  return null;
}

function eventDedupeKey(event) {
  const roll = getField(event, 'roll-over-count') || '0';
  const seq = getField(event, 'seq-number', 'seq-no') || '0';
  const eventId = getField(event, 'event-id') || '';
  const userId = getField(event, 'detail-1', 'user-id') || '';
  const ts = getField(event, 'event-time', 'date-time', 'time', 'date') || '';
  return `${roll}:${seq}:${eventId}:${userId}:${ts}`;
}

function isAttendanceEvent(event, cfg) {
  const eventId = getField(event, 'event-id');
  if (!eventId) return false;
  const allowed = getAttendanceEventIds(cfg);
  if (allowed.has(eventId)) return true;
  if (cfg.includeTimeStampingEvents !== false && eventId === TIME_STAMPING_EVENT_ID) {
    return true;
  }
  return false;
}

function toLogs(events, cfg) {
  const mapped = [];
  for (const ev of events) {
    if (!isAttendanceEvent(ev, cfg)) continue;

    const employeeCode = getField(ev, 'detail-1', 'user-id', 'userid');
    if (!employeeCode || employeeCode === '0') continue;

    const punchTime = parseEventDateTime(ev);
    if (!punchTime) continue;

    mapped.push({
      employee_code: employeeCode,
      punch_time: punchTime.toISOString(),
      punch_type: getPunchType(ev, cfg),
      _dedupe: eventDedupeKey(ev),
    });
  }
  return mapped;
}

async function cosecFetch(cfg, url) {
  const timeoutMs = Number(cfg.requestTimeoutMs || 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: basicAuthHeader(cfg.cosecUsername, cfg.cosecPassword),
        Accept: 'text/xml, application/xml, */*',
      },
      signal: controller.signal,
    });

    const body = await res.text();
    if (!res.ok) {
      throw new Error(`Device HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithPrefixFallback(cfg, buildUrl) {
  const prefixes = getApiPrefixes(cfg);
  let lastErr = null;

  for (const prefix of prefixes) {
    const url = buildUrl(prefix);
    try {
      const body = await cosecFetch(cfg, url);
      return { body, prefix, url };
    } catch (err) {
      lastErr = err;
      log(`Request failed for prefix "${prefix || '/'}": ${formatErr(err)}`);
    }
  }

  throw lastErr || new Error('All API prefix attempts failed');
}

async function fetchEventCount(cfg) {
  const { body, prefix } = await fetchWithPrefixFallback(cfg, (p) => buildEventCountUrl(p, cfg.deviceIp));
  const parsed = parseCosecXmlEvents(body);
  const first = parsed.events[0] || {};

  const rollOverCount = Number(getField(first, 'roll-over-count') || 0);
  const seqNumber = Number(getField(first, 'seq-number', 'current-seq-number') || 0);

  return { rollOverCount, seqNumber, apiPrefix: prefix };
}

async function fetchEvents(cfg, cursor) {
  const noOfEvents = Number(cfg.maxResultsPerPoll || 100);
  const { body, prefix } = await fetchWithPrefixFallback(cfg, (p) =>
    buildEventsUrl(p, {
      deviceIp: cfg.deviceIp,
      rollOverCount: cursor.rollOverCount,
      seqNumber: cursor.seqNumber,
      noOfEvents,
    })
  );

  const parsed = parseCosecXmlEvents(body);
  if (parsed.responseCode === '10') {
    return { events: [], apiPrefix: prefix, noMore: true };
  }
  if (parsed.error) {
    throw new Error(parsed.error);
  }

  return { events: parsed.events, apiPrefix: prefix, noMore: parsed.events.length === 0 };
}

function filterNewEvents(events, cursor) {
  const seen = new Set(Array.isArray(cursor.seenKeys) ? cursor.seenKeys : []);
  const fresh = [];

  for (const ev of events) {
    const key = eventDedupeKey(ev);
    if (seen.has(key)) continue;
    fresh.push(ev);
    seen.add(key);
  }

  const seenKeys = Array.from(seen).slice(-500);
  return { events: fresh, seenKeys };
}

function advanceCursor(cursor, rawEvents, cfg) {
  if (rawEvents.length === 0) return cursor;

  const last = rawEvents[rawEvents.length - 1];
  const lastSeq = Number(getField(last, 'seq-number', 'seq-no'));
  const lastRoll = Number(getField(last, 'roll-over-count'));

  let rollOverCount = cursor.rollOverCount;
  let seqNumber = cursor.seqNumber;

  if (!Number.isNaN(lastRoll)) rollOverCount = lastRoll;
  if (!Number.isNaN(lastSeq)) {
    seqNumber = lastSeq + 1;
  } else {
    seqNumber = Number(cursor.seqNumber || 0) + rawEvents.length;
  }

  const maxSeq = Number(cfg.maxSeqNumber || 500000);
  if (seqNumber > maxSeq) {
    rollOverCount = Number(rollOverCount || 0) + 1;
    seqNumber = 1;
  }

  return {
    ...cursor,
    rollOverCount,
    seqNumber,
    apiPrefix: cursor.apiPrefix,
  };
}

async function postLogsToBackend(cfg, logs) {
  if (!logs.length) return { inserted: 0 };

  const payload = logs.map(({ employee_code, punch_time, punch_type }) => ({
    employee_code,
    punch_time,
    punch_type,
  }));

  const pushUrl = `${String(cfg.backendUrl || 'https://punchpay.in').replace(/\/$/, '')}/api/device/push`;
  const res = await fetch(pushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-key': cfg.deviceApiKey,
    },
    body: JSON.stringify({ logs: payload }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Push failed ${res.status}: ${body.message || res.statusText}`);
  }
  return body.data || {};
}

async function runSyncTick(cfg, cursor) {
  const { events: rawEvents, apiPrefix } = await fetchEvents(cfg, cursor);
  if (!rawEvents.length) {
    log('No new events from device.');
    return { ...cursor, apiPrefix: apiPrefix || cursor.apiPrefix };
  }

  const { events: newEvents, seenKeys } = filterNewEvents(rawEvents, cursor);
  const logs = toLogs(newEvents, cfg);

  if (!logs.length) {
    log(`Fetched ${rawEvents.length} event(s); none mapped to attendance rows (check event-id / user-id).`);
    const next = advanceCursor({ ...cursor, seenKeys }, rawEvents, cfg);
    return { ...next, apiPrefix: apiPrefix || cursor.apiPrefix };
  }

  const data = await postLogsToBackend(cfg, logs);
  log(`Fetched ${rawEvents.length} events; pushed ${Number(data.inserted ?? logs.length)} logs to backend.`);

  const next = advanceCursor({ ...cursor, seenKeys }, rawEvents, cfg);
  return {
    ...next,
    apiPrefix: apiPrefix || cursor.apiPrefix,
    lastEventAt: logs[logs.length - 1].punch_time,
  };
}

async function runProbe(cfg) {
  log(`Probing COSEC device at ${cfg.deviceIp}...`);

  try {
    const count = await fetchEventCount(cfg);
    log(`Event count: roll-over=${count.rollOverCount} seq=${count.seqNumber} (prefix: ${count.apiPrefix || '/'})`);
  } catch (err) {
    log(`geteventcount failed (continuing): ${formatErr(err)}`);
  }

  const cursor = {
    rollOverCount: Number(cfg.initialRollOverCount || 0),
    seqNumber: Number(cfg.initialSeqNumber || 1),
    seenKeys: [],
  };

  const { events, apiPrefix } = await fetchEvents(cfg, cursor);
  log(`Fetched ${events.length} raw event(s) via prefix "${apiPrefix || '/'}".`);

  if (events.length === 0) {
    log('Probe OK — device reachable but no events at current cursor.');
    return;
  }

  const sample = events[0];
  log(`Sample raw event: ${JSON.stringify(sample)}`);

  const logs = toLogs(events.slice(0, 5), cfg);
  if (logs.length === 0) {
    log('WARNING: Events returned but none mapped. Check employee user-id and event-id filters.');
    return;
  }

  log(`Sample mapped log(s): ${JSON.stringify(logs.map(({ _dedupe, ...rest }) => rest))}`);
  log('Probe complete.');
}

function validateConfig(cfg) {
  if (!cfg.deviceIp || !cfg.deviceApiKey || !cfg.cosecUsername || !cfg.cosecPassword) {
    console.error('ERROR: config.cosec.json must include deviceIp, deviceApiKey, cosecUsername, cosecPassword.');
    process.exit(1);
  }
}

async function main() {
  const cfg = loadConfig();
  validateConfig(cfg);

  const pollIntervalMs = Number(cfg.pollIntervalMs || 60000);
  const runOnce = process.argv.includes('--once');
  const isProbe = process.argv.includes('--probe');

  if (isProbe) {
    await runProbe(cfg);
    process.exit(0);
  }

  let cursor = readJson(statePath, null);
  if (!cursor) {
    cursor = {
      rollOverCount: Number(cfg.initialRollOverCount || 0),
      seqNumber: Number(cfg.initialSeqNumber || 1),
      seenKeys: [],
      lastEventAt: null,
      apiPrefix: cfg.apiPrefix || null,
    };

    if (cfg.syncFromLatest === true) {
      try {
        const count = await fetchEventCount(cfg);
        cursor.rollOverCount = count.rollOverCount;
        cursor.seqNumber = Math.max(1, count.seqNumber);
        cursor.apiPrefix = count.apiPrefix;
        log(`Starting from latest device cursor: roll-over=${cursor.rollOverCount} seq=${cursor.seqNumber}`);
      } catch (err) {
        log(`Could not read event count; using config defaults: ${formatErr(err)}`);
      }
    }
  }

  let inProgress = false;

  log(`COSEC connector started. Device: ${cfg.deviceIp} | Backend: ${cfg.backendUrl || 'https://punchpay.in'}`);

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
