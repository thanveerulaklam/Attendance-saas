function ymdFromDb(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  // node-pg DATE values are local midnight of the calendar day.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/**
 * Apply one-date shop overrides onto a holiday set.
 * Holiday adds the date. Working removes it, including weekly offs added earlier.
 */
function applyHolidayOverrides(holidaySet, rows) {
  const set = holidaySet instanceof Set ? holidaySet : new Set(holidaySet);
  const workingDates = [];
  for (const row of rows || []) {
    const date = ymdFromDb(row.override_date ?? row.date);
    if (!date) continue;
    const effect = String(row.effect || '').toLowerCase();
    if (effect === 'holiday') set.add(date);
    else if (effect === 'working') workingDates.push(date);
  }
  for (const date of workingDates) set.delete(date);
  return set;
}

module.exports = {
  ymdFromDb,
  applyHolidayOverrides,
};
