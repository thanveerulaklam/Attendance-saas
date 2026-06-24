/**
 * Decimal hours (e.g. 1.75) → clock-style H:MM (e.g. "1:45").
 */
function formatWorkedHours(hours) {
  if (hours == null || hours === '' || Number.isNaN(Number(hours))) return '';
  const num = Math.max(0, Number(hours));
  if (num === 0) return '0:00';

  let h = Math.floor(num);
  let m = Math.round((num - h) * 60);
  if (m >= 60) {
    h += Math.floor(m / 60);
    m %= 60;
  }

  return `${h}:${String(m).padStart(2, '0')}`;
}

module.exports = { formatWorkedHours };
