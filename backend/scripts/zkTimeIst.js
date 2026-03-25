/**
 * Same as connector/zkTimeIst.js — ZKTeco uint32 → UTC ISO, assuming device wall clock is IST.
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
