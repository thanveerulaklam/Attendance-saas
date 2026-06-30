const MONTH_LONG = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

function parseDateYMD(value) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (Number.isNaN(year) || Number.isNaN(monthIndex) || Number.isNaN(day)) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex, day };
}

export function filterYmdOnOrBefore(asOfYmd, dateValues) {
  const cap = String(asOfYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cap)) return dateValues || [];
  return (dateValues || []).filter((d) => String(d).slice(0, 10) <= cap);
}

export function filterLateDetailsOnOrBefore(asOfYmd, items) {
  const cap = String(asOfYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cap)) return items || [];
  return (items || []).filter((it) => String(it?.date || '').slice(0, 10) <= cap);
}

function groupDayNumbersByMonth(dateValues) {
  const map = new Map();
  for (const raw of dateValues || []) {
    const d = parseDateYMD(raw);
    if (!d) continue;
    const key = `${d.year}-${d.monthIndex}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        year: d.year,
        monthIndex: d.monthIndex,
        monthName: MONTH_LONG[d.monthIndex],
        days: new Set(),
      });
    }
    map.get(key).days.add(d.day);
  }

  return [...map.values()]
    .map((g) => ({ ...g, days: [...g.days].sort((a, b) => a - b) }))
    .sort((a, b) => (a.year - b.year) || (a.monthIndex - b.monthIndex));
}

function groupLateDetailsByMonth(lateDetails) {
  const map = new Map();
  for (const item of lateDetails || []) {
    const d = parseDateYMD(item?.date);
    if (!d) continue;
    const key = `${d.year}-${d.monthIndex}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        year: d.year,
        monthIndex: d.monthIndex,
        monthName: MONTH_LONG[d.monthIndex],
        days: new Set(),
      });
    }
    map.get(key).days.add(d.day);
  }

  return [...map.values()]
    .map((g) => ({ ...g, days: [...g.days].sort((a, b) => a - b) }))
    .sort((a, b) => (a.year - b.year) || (a.monthIndex - b.monthIndex));
}

export function formatGroupedDayNumbersText(dateValues) {
  const groups = groupDayNumbersByMonth(dateValues);
  if (!groups.length) return '—';
  return groups
    .map((g) => `${g.year} ${g.monthName}: ${g.days.join(', ')}`)
    .join('; ');
}

export function formatGroupedLateDetailsText(lateDetails) {
  const groups = groupLateDetailsByMonth(lateDetails);
  if (!groups.length) return '—';
  return groups
    .map((g) => `${g.year} ${g.monthName}: ${g.days.join(', ')}`)
    .join('; ');
}

export function resolvePayslipAttendanceDates(breakdown, attendanceDetails) {
  const dayDetails = Array.isArray(breakdown?.attendance?.dayDetails)
    ? breakdown.attendance.dayDetails
    : [];
  const hasDayDetails = dayDetails.length > 0;
  const payrollAsOfYmd = (breakdown?.attendance?.workingDaysUpToDate || '').slice(0, 10);

  const fallbackAbsentDates = dayDetails
    .filter((d) => d?.status === 'absent')
    .map((d) => d.date)
    .filter(Boolean);
  const fallbackHalfDayDates = dayDetails
    .filter((d) => d?.status === 'half_day')
    .map((d) => d.date)
    .filter(Boolean);
  const fallbackLateDetails = dayDetails
    .filter((d) => d?.late === true)
    .map((d) => ({ date: d.date, minutes: d.minutesLate ?? null }))
    .filter((d) => Boolean(d.date));

  const rawAbsentDates =
    hasDayDetails && fallbackAbsentDates.length > 0
      ? fallbackAbsentDates
      : Array.isArray(attendanceDetails?.absentDates) && attendanceDetails.absentDates.length > 0
        ? attendanceDetails.absentDates
        : fallbackAbsentDates;

  const rawHalfDayDates =
    hasDayDetails && fallbackHalfDayDates.length > 0
      ? fallbackHalfDayDates
      : Array.isArray(attendanceDetails?.halfDayDates) && attendanceDetails.halfDayDates.length > 0
        ? attendanceDetails.halfDayDates
        : fallbackHalfDayDates;

  const rawLateDetails =
    hasDayDetails && fallbackLateDetails.length > 0
      ? fallbackLateDetails
      : Array.isArray(attendanceDetails?.lateDetails) && attendanceDetails.lateDetails.length > 0
        ? attendanceDetails.lateDetails
        : fallbackLateDetails;

  return {
    payrollAsOfYmd,
    absentDates: filterYmdOnOrBefore(payrollAsOfYmd, rawAbsentDates),
    halfDayDates: filterYmdOnOrBefore(payrollAsOfYmd, rawHalfDayDates),
    lateDetails: filterLateDetailsOnOrBefore(payrollAsOfYmd, rawLateDetails),
    weeklyOffDates: filterYmdOnOrBefore(
      payrollAsOfYmd,
      dayDetails
        .filter((d) => d?.status === 'weekly_off')
        .map((d) => d.date)
        .filter(Boolean)
    ),
  };
}
