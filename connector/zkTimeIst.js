/**
 * ZKTeco compact 32-bit time (same decode as zk-attendance-sdk parseTimeToDate),
 * but the result is always interpreted as IST wall clock and converted to a UTC ISO string.
 *
 * This avoids wrong punches when the connector PC runs in UTC or another TZ:
 * the SDK uses `new Date(y,m,d,h,mi,s)` which follows the *host* local timezone.
 */

/**
 * @param {number} time - uint32 from attendance record offset 27
 * @returns {string} ISO 8601 UTC string (e.g. for DB / API)
 */
function parseZkCompactTimeToIsoIst(time) {
  const second = time % 60;
  let t = (time - second) / 60;
  const minute = t % 60;
  t = (t - minute) / 60;
  const hour = t % 24;
  t = (t - hour) / 24;
  const day = (t % 31) + 1;
  t = (t - (day - 1)) / 31;
  const month = t % 12;
  t = (t - month) / 12;
  const year = t + 2000;

  const pad = (n) => String(n).padStart(2, '0');
  const month1 = month + 1;
  const isoIst = `${year}-${pad(month1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+05:30`;
  return new Date(isoIst).toISOString();
}

module.exports = { parseZkCompactTimeToIsoIst };
