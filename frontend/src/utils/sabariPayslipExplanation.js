const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatSabariHours(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return num.toFixed(2).replace(/\.?0+$/, '');
}

/** Worked time as hh:mm. Uses exact minutes when the payslip stored them. */
export function formatSabariDuration(minutes, decimalHours) {
  const fromMinutes = minutes != null && minutes !== '' && Number.isFinite(Number(minutes));
  const total = fromMinutes
    ? Math.max(0, Math.round(Number(minutes)))
    : Math.max(0, Math.round(Number(decimalHours || 0) * 60));
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 24-hour clock "21:42" as "09:42 PM". Leaves durations and other text alone. */
export function formatSabariClock(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value == null || value === '' ? '' : String(value);
  const hours24 = Number(match[1]);
  if (hours24 > 23) return String(value);
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${match[2]} ${suffix}`;
}

/** "09:33 in, 21:42 out" → "09:33 AM in, 09:42 PM out". */
export function formatSabariPunchLine(text) {
  return String(text || '').replace(/\b(\d{1,2}:\d{2})\b/g, (clock) => formatSabariClock(clock));
}

export function formatSabariDate(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(ymd || '');
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function weekOffSentence(explanation) {
  if (explanation.weekOffDay == null || explanation.weekOffDay === '') {
    return 'No week-off. This person works all 7 days.';
  }
  const name = WEEKDAYS[Number(explanation.weekOffDay)] || 'the saved week-off';
  return `Week-off is ${name}.`;
}

/**
 * Plain-language rules, one row per day, and the week result.
 * `money` formats a rupee amount the same way as the rest of the payslip.
 */
export function sabariPayslipExplanation(explanation, money) {
  if (!explanation || !Array.isArray(explanation.days)) return null;
  const required = formatSabariHours(explanation.requiredHours);
  const gender = explanation.gender === 'female' ? 'female' : 'male';
  const rules = [
    `These are the ${gender} rules saved for this store.`,
    `Hourly rate ${money(explanation.hourlyRate)}. A day's pay is inside hours × this rate.`,
    'Inside hours are punch pairs on that date. The first punch is In, the next is Out, then In, then Out. The gap between an Out and the next In, such as lunch, is not paid. One punch on its own adds no hours.',
    `Late means the first punch is after ${explanation.shiftStart || '10:00'}. The late fine is ${money(explanation.lateDeduction)} that day. A punch at ${explanation.shiftStart || '10:00'} exactly is not late.`,
    `Required hours are ${required}. A day with punches under that is a short day, and the short fine is ${money(explanation.shortDeduction)}. The hours worked are still paid.`,
    `Overtime is a flat ${money(explanation.otAmount)}, only when inside hours are above ${formatSabariHours(explanation.otAboveHours)}. Those extra hours are still included in the hourly pay.`,
    `Sunday bonus is ${money(explanation.sundayBonus)}, only when Sunday meets ${required} hours and is not late.`,
    `A Sunday with no punches is fined ${money(explanation.sundayAbsence ?? explanation.sundayBonus)}. A Sunday that is the week-off is not fined. A Sunday with any punches is not this fine.`,
    `${weekOffSentence(explanation)} Full-week bonus is ${money(explanation.fullWeekBonus)}, only when every required day meets ${required} hours and is not late.`,
    `If all 7 days have no punches, the absence fine is ${money(explanation.absenceSeven)}. If Sunday was worked and Monday to Saturday had no punches, the absence fine is ${money(explanation.absenceMonToSat)}. Only one of those two fines applies. A week-off does not remove the ${money(explanation.absenceSeven)} fine when all seven days have no punches.`,
  ];

  const dayRows = explanation.days.map((day) => {
    const applied = [];
    if (day.weekOff && Number(day.punchCount) === 0) applied.push('Week-off');
    else if (Number(day.punchCount) === 0) applied.push('No punches');
    else if (Number(day.punchCount) === 1) applied.push('One punch, so no hours');
    if (Number(day.late) > 0) {
      applied.push(day.heldLate ? `Late ${money(day.late)}, held for the next salary` : `Late ${money(day.late)}`);
    }
    if (Number(day.short) > 0) {
      applied.push(
        day.heldShort ? `Short day ${money(day.short)}, held for the next salary` : `Short day ${money(day.short)}`
      );
    }
    if (Number(day.ot) > 0) applied.push(`Overtime ${money(day.ot)}`);
    if (Number(day.sundayBonus) > 0) applied.push(`Sunday bonus ${money(day.sundayBonus)}`);
    if (Number(day.sundayAbsent) > 0) {
      applied.push(
        day.heldSunday
          ? `Sunday absent ${money(day.sundayAbsent)}, held for the next salary`
          : `Sunday absent ${money(day.sundayAbsent)}`
      );
    }
    if (applied.length === 0 && Number(day.insideHours) > 0) applied.push('Meets the day rule');
    return [
      formatSabariDate(day.date),
      day.firstIn ? formatSabariClock(day.firstIn) : '—',
      day.lastPunch ? formatSabariClock(day.lastPunch) : '—',
      formatSabariDuration(day.insideMinutes, day.insideHours),
      money(day.hourlyPay),
      applied.join('. '),
    ];
  });

  const weekNotes = (explanation.weeks || []).map((week) => {
    const parts = [`Week ${formatSabariDate(week.weekStart)} to ${formatSabariDate(week.saturday)}.`];
    if (Number(week.weekBonus) > 0) {
      parts.push(`Full-week bonus ${money(week.weekBonus)}, because every required day met the hours and was not late.`);
    } else if (Array.isArray(week.missed) && week.missed.length > 0) {
      const why = week.missed.map((day) => {
        const bits = [];
        if (day.absent) bits.push('no punches');
        if (day.late) bits.push('late');
        if (day.short) bits.push('short');
        if (!day.absent && !day.late && !day.short) bits.push(`under ${required} hours`);
        return `${formatSabariDate(day.date)} (${bits.join(', ')})`;
      });
      parts.push(`No full-week bonus. ${why.join('; ')}.`);
    }
    if (week.absenceKind === 'seven') {
      const fine = `Absence fine ${money(week.absenceAmount)}, because there were no punches on all 7 days.`;
      parts.push(week.heldAbsence ? `${fine} Held for the next salary.` : fine);
    } else if (week.absenceKind === 'monToSat') {
      const fine = `Absence fine ${money(week.absenceAmount)}, because Sunday was worked and Monday to Saturday had no punches.`;
      parts.push(week.heldAbsence ? `${fine} Held for the next salary.` : fine);
    }
    return parts.join(' ');
  });

  return { rules, dayRows, weekNotes };
}
