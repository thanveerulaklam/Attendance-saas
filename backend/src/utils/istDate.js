/**
 * India Standard Time (IST) helpers for attendance.
 * All calendar-day boundaries for punches use Asia/Kolkata, not UTC.
 */

const IST = 'Asia/Kolkata';

/** YYYY-MM-DD in IST for an instant (timestamptz or Date). */
function istYmdFromDate(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: IST });
}

function istYmdParts(d) {
  const ymd = istYmdFromDate(d);
  const [y, m, day] = ymd.split('-').map(Number);
  return { year: y, month: m, day };
}

function todayIstYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: IST });
}

/**
 * IST calendar day as UTC instants: [start, end) where end is start of next IST day.
 * @param {string} ymd - YYYY-MM-DD
 * @returns {{ start: Date, end: Date }}
 */
function istDayBounds(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) {
    throw new Error(`Invalid YYYY-MM-DD: ${ymd}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const pad = (n) => String(n).padStart(2, '0');
  const start = new Date(`${y}-${pad(mo)}-${pad(d)}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Add calendar days in IST (roughly; India has no DST). */
function addDaysIst(ymd, deltaDays) {
  const { start } = istDayBounds(ymd);
  const t = new Date(start.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return istYmdFromDate(t);
}

/** SQL fragment: IST calendar date of timestamptz `punch_time`. */
const SQL_PUNCH_IST_DATE = "(punch_time AT TIME ZONE 'Asia/Kolkata')::date";

/** Minutes from midnight (0–1439) in Asia/Kolkata for an instant. */
function istMinutesFromMidnight(d) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(d));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

module.exports = {
  IST,
  istYmdFromDate,
  istYmdParts,
  todayIstYmd,
  istDayBounds,
  addDaysIst,
  istMinutesFromMidnight,
  SQL_PUNCH_IST_DATE,
};
