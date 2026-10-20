/**
 * Sri Sabari Store pay rules. Pure functions: no database, no effect on other companies.
 * A week is Sunday–Saturday. Daily lines belong to the calendar day.
 * The full-week bonus and the absence slab belong to the month of that week's Saturday.
 */

const PROFILE_CODE = 'sri_sabari_v1';

const DEFAULT_CONFIG = {
  shiftStart: '10:00',
  lateGraceMinutes: 0,
  requiredHours: { male: 11, female: 10 },
  lateDeduction: 100,
  shortHoursDeduction: 100,
  ot: {
    male: { aboveHours: 13, amount: 100 },
    female: { aboveHours: 11.5, amount: 25 },
  },
  sundayBonus: { male: 300, female: 200 },
  fullWeekBonus: { male: 300, female: 200 },
  absence: { sevenDays: 600, monToSat: 300 },
};

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

function weekday(ymd) {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function addDays(ymd, n) {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function weekStartSunday(ymd) {
  return addDays(ymd, -weekday(ymd));
}

function parseStartMinutes(hhmm) {
  const [h, m] = String(hhmm || '10:00').split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function mergeConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    shiftStart: src.shiftStart || DEFAULT_CONFIG.shiftStart,
    lateGraceMinutes: Number(src.lateGraceMinutes ?? DEFAULT_CONFIG.lateGraceMinutes) || 0,
    requiredHours: {
      male: Number(src.requiredHours?.male ?? DEFAULT_CONFIG.requiredHours.male),
      female: Number(src.requiredHours?.female ?? DEFAULT_CONFIG.requiredHours.female),
    },
    lateDeduction: Number(src.lateDeduction ?? DEFAULT_CONFIG.lateDeduction),
    shortHoursDeduction: Number(src.shortHoursDeduction ?? DEFAULT_CONFIG.shortHoursDeduction),
    ot: {
      male: {
        aboveHours: Number(src.ot?.male?.aboveHours ?? DEFAULT_CONFIG.ot.male.aboveHours),
        amount: Number(src.ot?.male?.amount ?? DEFAULT_CONFIG.ot.male.amount),
      },
      female: {
        aboveHours: Number(src.ot?.female?.aboveHours ?? DEFAULT_CONFIG.ot.female.aboveHours),
        amount: Number(src.ot?.female?.amount ?? DEFAULT_CONFIG.ot.female.amount),
      },
    },
    sundayBonus: {
      male: Number(src.sundayBonus?.male ?? DEFAULT_CONFIG.sundayBonus.male),
      female: Number(src.sundayBonus?.female ?? DEFAULT_CONFIG.sundayBonus.female),
    },
    fullWeekBonus: {
      male: Number(src.fullWeekBonus?.male ?? DEFAULT_CONFIG.fullWeekBonus.male),
      female: Number(src.fullWeekBonus?.female ?? DEFAULT_CONFIG.fullWeekBonus.female),
    },
    absence: {
      sevenDays: Number(src.absence?.sevenDays ?? DEFAULT_CONFIG.absence.sevenDays),
      monToSat: Number(src.absence?.monToSat ?? DEFAULT_CONFIG.absence.monToSat),
    },
  };
}

function normalizeGender(gender) {
  const g = String(gender || '').trim().toLowerCase();
  if (g === 'male' || g === 'female') return g;
  return null;
}

/**
 * Pair IN→OUT across the punch list. Hours belong to the attendance date of the IN.
 * An OUT with no open IN is ignored. An IN left open does not invent hours.
 * @param {{ type: string, at: number, ymd: string }[]} punches
 */
function insideHoursByInDate(punches) {
  const sorted = [...(punches || [])].sort((a, b) => a.at - b.at);
  const hours = new Map();
  const firstInMinutes = new Map();
  let open = null;
  for (const punch of sorted) {
    const type = String(punch.type || '').toLowerCase();
    if (type === 'in') {
      if (!firstInMinutes.has(punch.ymd)) firstInMinutes.set(punch.ymd, punch.minutes);
      if (open == null) open = punch;
    } else if (type === 'out' && open) {
      const hrs = Math.max(0, (punch.at - open.at) / 3600000);
      hours.set(open.ymd, (hours.get(open.ymd) || 0) + hrs);
      open = null;
    }
  }
  return { hours, firstInMinutes };
}

function isLate(minutes, config) {
  if (minutes == null || Number.isNaN(Number(minutes))) return false;
  const cutoff = parseStartMinutes(config.shiftStart) + Number(config.lateGraceMinutes || 0);
  return Number(minutes) > cutoff;
}

function dayFacts(date, hours, firstMinutes, config, gender) {
  const required = config.requiredHours[gender];
  const otRule = config.ot[gender];
  const inside = Number(hours || 0);
  const late = inside > 0 && isLate(firstMinutes, config);
  const short = inside > 0 && inside < required;
  const absent = inside <= 0;
  const ot = inside > otRule.aboveHours;
  const sunday = weekday(date) === 0;
  const sundayBonus =
    sunday && !late && !short && !absent && inside >= required ? config.sundayBonus[gender] : 0;
  return {
    date,
    inside,
    late,
    short,
    absent,
    ot,
    sunday,
    sundayBonus,
    lateAmount: late ? config.lateDeduction : 0,
    shortAmount: short ? config.shortHoursDeduction : 0,
    otAmount: ot ? otRule.amount : 0,
    weekday: weekday(date),
  };
}

function evaluateWeek(weekStart, factsByDate, config, gender, weekOffDay) {
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    days.push(
      factsByDate.get(date) ||
        dayFacts(date, 0, null, config, gender)
    );
  }
  const allSevenAbsent = days.every((d) => d.absent);
  const monToSat = days.filter((d) => d.weekday !== 0);
  const monToSatAbsent = monToSat.every((d) => d.absent);
  let absenceAmount = 0;
  let absenceKind = null;
  if (allSevenAbsent) {
    absenceAmount = config.absence.sevenDays;
    absenceKind = 'seven';
  } else if (monToSatAbsent) {
    absenceAmount = config.absence.monToSat;
    absenceKind = 'monToSat';
  }

  const requiredDays = days.filter((d) => weekOffDay == null || d.weekday !== weekOffDay);
  const fullWeek =
    requiredDays.length > 0 &&
    requiredDays.every((d) => !d.absent && !d.late && !d.short && d.inside >= config.requiredHours[gender]);
  const weekBonus = fullWeek ? config.fullWeekBonus[gender] : 0;
  return {
    weekStart,
    saturday: addDays(weekStart, 6),
    absenceAmount,
    absenceKind,
    weekBonus,
    fullWeek,
  };
}

/**
 * @param {object} input
 * @param {'monthly'|'weekly'} input.mode
 * @param {string} input.rangeStart YYYY-MM-DD
 * @param {string} input.rangeEnd
 * @param {string|null} input.asOfDate inclusive cap, or null when the period is finished
 * @param {string} input.gender male|female
 * @param {number} input.weekOffDay 0-6
 * @param {number} input.hourlyRate
 * @param {object} input.config
 * @param {{ type: string, at: number, ymd: string, minutes: number }[]} input.punches
 */
function calculateSriSabari(input) {
  const gender = normalizeGender(input.gender);
  if (!gender) {
    const err = new Error('Set gender to male or female before payroll');
    err.statusCode = 400;
    throw err;
  }
  let weekOffDay = null;
  if (input.weekOffDay != null && input.weekOffDay !== '') {
    weekOffDay = Number(input.weekOffDay);
    if (Number.isNaN(weekOffDay) || weekOffDay < 0 || weekOffDay > 6) {
      const err = new Error('Week-off day must be Sunday through Saturday');
      err.statusCode = 400;
      throw err;
    }
  }
  const hourlyRate = Number(input.hourlyRate || 0);
  if (!(hourlyRate > 0)) {
    const err = new Error('Set an hourly rate before payroll');
    err.statusCode = 400;
    throw err;
  }
  const config = mergeConfig(input.config);
  const { hours, firstInMinutes } = insideHoursByInDate(input.punches);
  const rangeStart = String(input.rangeStart).slice(0, 10);
  const rangeEnd = String(input.rangeEnd).slice(0, 10);
  const asOf = input.asOfDate ? String(input.asOfDate).slice(0, 10) : null;

  const firstWeek = weekStartSunday(rangeStart);
  const lastWeek = weekStartSunday(rangeEnd);
  const factsByDate = new Map();
  for (let cursor = addDays(firstWeek, -1); cursor <= addDays(lastWeek, 8); cursor = addDays(cursor, 1)) {
    factsByDate.set(
      cursor,
      dayFacts(cursor, hours.get(cursor) || 0, firstInMinutes.has(cursor) ? firstInMinutes.get(cursor) : null, config, gender)
    );
  }

  const inDaily = (date) => date >= rangeStart && date <= rangeEnd && (asOf == null || date <= asOf);

  let hourlyPay = 0;
  let otPay = 0;
  let sundayBonus = 0;
  let lateDeduction = 0;
  let shortDeduction = 0;
  let insideHours = 0;
  let overtimeHours = 0;
  let presentDays = 0;
  let absentDays = 0;
  const deferrable = [];

  for (let date = rangeStart; date <= rangeEnd; date = addDays(date, 1)) {
    if (!inDaily(date)) continue;
    const day = factsByDate.get(date);
    const dayPay = roundMoney(day.inside * hourlyRate);
    hourlyPay += dayPay;
    insideHours += day.inside;
    if (day.ot) {
      otPay += day.otAmount;
      const threshold = config.ot[gender].aboveHours;
      overtimeHours += Math.max(0, day.inside - threshold);
    }
    if (day.sundayBonus) sundayBonus += day.sundayBonus;
    if (day.lateAmount) {
      lateDeduction += day.lateAmount;
      deferrable.push({
        key: `late:${date}`,
        kind: 'late',
        date,
        amount: day.lateAmount,
        label: `Late ${date}`,
      });
    }
    if (day.shortAmount) {
      shortDeduction += day.shortAmount;
      deferrable.push({
        key: `short:${date}`,
        kind: 'short',
        date,
        amount: day.shortAmount,
        label: `Short day ${date}`,
      });
    }
    if (day.inside > 0) presentDays += 1;
    else if (weekOffDay == null || weekday(date) !== weekOffDay) absentDays += 1;
  }

  let weekBonus = 0;
  let absenceDeduction = 0;
  for (let week = firstWeek; week <= lastWeek; week = addDays(week, 7)) {
    const evaluated = evaluateWeek(week, factsByDate, config, gender, weekOffDay);
    const saturdayInRange = evaluated.saturday >= rangeStart && evaluated.saturday <= rangeEnd;
    const saturdayReached = asOf == null || evaluated.saturday <= asOf;
    if (!saturdayInRange || !saturdayReached) continue;
    if (evaluated.weekBonus) {
      weekBonus += evaluated.weekBonus;
    }
    if (evaluated.absenceAmount) {
      absenceDeduction += evaluated.absenceAmount;
      deferrable.push({
        key: `absence:${evaluated.weekStart}`,
        kind: 'absence',
        date: evaluated.saturday,
        weekStart: evaluated.weekStart,
        amount: evaluated.absenceAmount,
        label:
          evaluated.absenceKind === 'seven'
            ? `7 days absent, week of ${evaluated.weekStart}`
            : `Monday–Saturday absent, week of ${evaluated.weekStart}`,
      });
    }
  }

  hourlyPay = roundMoney(hourlyPay);
  otPay = roundMoney(otPay);
  sundayBonus = roundMoney(sundayBonus);
  weekBonus = roundMoney(weekBonus);
  lateDeduction = roundMoney(lateDeduction);
  shortDeduction = roundMoney(shortDeduction);
  absenceDeduction = roundMoney(absenceDeduction);
  overtimeHours = roundMoney(overtimeHours);
  insideHours = roundMoney(insideHours);

  return {
    hourlyPay,
    otPay,
    sundayBonus,
    weekBonus,
    lateDeduction,
    shortDeduction,
    absenceDeduction,
    insideHours,
    overtimeHours,
    presentDays,
    absentDays,
    grossSalary: roundMoney(hourlyPay + otPay + sundayBonus + weekBonus),
    ruleDeductions: roundMoney(lateDeduction + shortDeduction + absenceDeduction),
    deferrable,
    payslipLines: [
      { key: 'hourly', label: 'Hourly pay', amount: hourlyPay, earning: true },
      { key: 'ot', label: 'Overtime', amount: otPay, earning: true },
      { key: 'sunday', label: 'Sunday bonus', amount: sundayBonus, earning: true },
      { key: 'week', label: 'Full-week bonus', amount: weekBonus, earning: true },
      { key: 'late', label: 'Late', amount: lateDeduction, earning: false },
      { key: 'short', label: 'Short day', amount: shortDeduction, earning: false },
      { key: 'absence', label: 'Absence penalty', amount: absenceDeduction, earning: false },
    ].filter((line) => line.amount > 0),
  };
}

/**
 * Drop deferred rule lines and attach pending carry that is not held back.
 * Earnings are never deferred.
 */
function applyDeferAndCarry(result, { deferKeys = [], pendingCarry = [] } = {}) {
  const defer = new Set(deferKeys || []);
  const deferredLines = [];
  let lateDeduction = result.lateDeduction;
  let shortDeduction = result.shortDeduction;
  let absenceDeduction = result.absenceDeduction;
  for (const line of result.deferrable) {
    if (!defer.has(line.key)) continue;
    deferredLines.push(line);
    if (line.kind === 'late') lateDeduction -= line.amount;
    else if (line.kind === 'short') shortDeduction -= line.amount;
    else if (line.kind === 'absence') absenceDeduction -= line.amount;
  }
  lateDeduction = roundMoney(Math.max(0, lateDeduction));
  shortDeduction = roundMoney(Math.max(0, shortDeduction));
  absenceDeduction = roundMoney(Math.max(0, absenceDeduction));

  const carryApplied = [];
  for (const item of pendingCarry || []) {
    const key = `carry:${item.id}`;
    if (defer.has(key)) continue;
    carryApplied.push(item);
  }
  const broughtForward = roundMoney(
    carryApplied.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  );
  const ruleDeductions = roundMoney(lateDeduction + shortDeduction + absenceDeduction + broughtForward);
  const grossSalary = result.grossSalary;
  const payslipLines = [
    { key: 'hourly', label: 'Hourly pay', amount: result.hourlyPay, earning: true },
    { key: 'ot', label: 'Overtime', amount: result.otPay, earning: true },
    { key: 'sunday', label: 'Sunday bonus', amount: result.sundayBonus, earning: true },
    { key: 'week', label: 'Full-week bonus', amount: result.weekBonus, earning: true },
    { key: 'late', label: 'Late', amount: lateDeduction, earning: false },
    { key: 'short', label: 'Short day', amount: shortDeduction, earning: false },
    { key: 'absence', label: 'Absence penalty', amount: absenceDeduction, earning: false },
    { key: 'carry', label: 'Brought forward', amount: broughtForward, earning: false },
  ].filter((line) => line.amount > 0);

  return {
    ...result,
    lateDeduction,
    shortDeduction,
    absenceDeduction,
    broughtForward,
    ruleDeductions,
    grossSalary,
    payslipLines,
    deferredLines,
    carryApplied,
  };
}

function isSriSabariProfile(profile) {
  return String(profile || '') === PROFILE_CODE;
}

/**
 * Null settlement means this company is not on the store profile.
 * The standard payroll numbers are returned unchanged.
 */
function mergeSriSabariTotals(standard, settlement, statutory = {}) {
  if (!settlement) return standard;
  const esi = Number(statutory.esiDeduction || 0);
  const pf = Number(statutory.pfDeduction || 0);
  const salaryAdvance = Number(standard.salaryAdvance || 0);
  const deductions = roundMoney(Number(settlement.ruleDeductions || 0) + esi + pf);
  const grossSalary = Number(settlement.grossSalary || 0);
  return {
    grossSalary,
    deductions,
    overtimePay: Number(settlement.otPay || 0),
    overtimeHours: Number(settlement.overtimeHours || 0),
    noLeaveIncentive: 0,
    netSalary: roundMoney(grossSalary - deductions - salaryAdvance),
    presentDays: settlement.presentDays,
    absenceDays: settlement.absentDays,
    esiDeduction: esi,
    pfDeduction: pf,
  };
}

module.exports = {
  PROFILE_CODE,
  DEFAULT_CONFIG,
  mergeConfig,
  normalizeGender,
  calculateSriSabari,
  applyDeferAndCarry,
  isSriSabariProfile,
  mergeSriSabariTotals,
  weekStartSunday,
  addDays,
  weekday,
  insideHoursByInDate,
};
