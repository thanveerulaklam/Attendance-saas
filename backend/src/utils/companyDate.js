/**
 * Company-local calendar helpers (IANA timezone).
 * Replaces hardcoded Asia/Kolkata for multi-region tenants.
 */

const { AsyncLocalStorage } = require('async_hooks');

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const companyTzStore = new AsyncLocalStorage();

function getActiveCompanyTimezone() {
  return companyTzStore.getStore() || DEFAULT_TIMEZONE;
}

/**
 * Run async work with a company timezone in context (safe for concurrent requests).
 */
function runWithCompanyTimezone(timezone, fn) {
  const tz =
    typeof timezone === 'string' && timezone.trim() ? timezone.trim() : DEFAULT_TIMEZONE;
  return companyTzStore.run(tz, fn);
}

/** ISO offset (+05:30 / Z) for an instant in the given IANA zone. */
function formatOffsetForInstant(timezone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    const m =
      /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(tzPart) ||
      /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/.exec(tzPart);
    if (!m) return '+00:00';
    const sign = m[1];
    const hh = String(m[2]).padStart(2, '0');
    const mm = String(m[3] || '00').padStart(2, '0');
    return `${sign}${hh}:${mm}`;
  } catch {
    return '+05:30';
  }
}

/** YYYY-MM-DD in company local time for an instant. */
function ymdFromDate(d, timezone = getActiveCompanyTimezone()) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: timezone });
}

function ymdParts(d, timezone = getActiveCompanyTimezone()) {
  const ymd = ymdFromDate(d, timezone);
  const [y, m, day] = ymd.split('-').map(Number);
  return { year: y, month: m, day };
}

function todayYmd(timezone = getActiveCompanyTimezone()) {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}

function pgDateToYmd(value, timezone = getActiveCompanyTimezone()) {
  if (value == null || value === '') return todayYmd(timezone);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return ymdFromDate(value, timezone);
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value).trim());
  if (m) return m[1];
  return todayYmd(timezone);
}

/**
 * Local calendar day as UTC instants: [start, end) where end is start of next local day.
 */
function dayBounds(ymd, timezone = getActiveCompanyTimezone()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!match) {
    throw new Error(`Invalid YYYY-MM-DD: ${ymd}`);
  }
  const ref = new Date(`${ymd}T12:00:00Z`);
  const offset = formatOffsetForInstant(timezone, ref);
  const start = new Date(`${ymd}T00:00:00${offset}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function addDaysYmd(ymd, deltaDays, timezone = getActiveCompanyTimezone()) {
  const { start } = dayBounds(ymd, timezone);
  const t = new Date(start.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return ymdFromDate(t, timezone);
}

/** SQL fragment: local calendar date of timestamptz punch_time in company timezone. */
function sqlPunchLocalDate(timezone = getActiveCompanyTimezone()) {
  const tz = String(timezone || DEFAULT_TIMEZONE).replace(/'/g, "''");
  return `(punch_time AT TIME ZONE '${tz}')::date`;
}

/**
 * Parse device wall-clock strings (YYYY-MM-DD HH:mm:ss) as naive local time in company TZ.
 */
function parseDeviceDateTime(timeStr, timezone = getActiveCompanyTimezone()) {
  const s = String(timeStr || '').trim();
  if (!s) return null;
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const isoish = s.includes('T') ? s : s.replace(' ', 'T');
  const datePart = isoish.slice(0, 10);
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(datePart)
    ? new Date(`${datePart}T12:00:00Z`)
    : new Date();
  const offset = formatOffsetForInstant(timezone, ref);
  const d = new Date(`${isoish}${offset}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ZKTeco ADMS stamp format in company local time (YYYY-MM-DDThh:mm:ss). */
function formatAdmsStamp(date, timezone = getActiveCompanyTimezone()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '0';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Minutes from midnight (0–1439) in company local time for an instant. */
function minutesFromMidnight(d, timezone = getActiveCompanyTimezone()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(d));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function getShiftStartMsForDate(year, month, day, startHour, startMinute, timezone = getActiveCompanyTimezone()) {
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const offset = formatOffsetForInstant(timezone, new Date(`${ymd}T12:00:00Z`));
  const iso = `${ymd}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00${offset === 'Z' ? 'Z' : offset}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? new Date(year, month - 1, day, startHour, startMinute, 0).getTime()
    : d.getTime();
}

module.exports = {
  DEFAULT_TIMEZONE,
  getActiveCompanyTimezone,
  runWithCompanyTimezone,
  formatOffsetForInstant,
  ymdFromDate,
  ymdParts,
  todayYmd,
  pgDateToYmd,
  dayBounds,
  addDaysYmd,
  sqlPunchLocalDate,
  parseDeviceDateTime,
  formatAdmsStamp,
  minutesFromMidnight,
  getShiftStartMsForDate,
};
