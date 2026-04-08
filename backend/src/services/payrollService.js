const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { istYmdFromDate, todayIstYmd, SQL_PUNCH_IST_DATE, addDaysIst } = require('../utils/istDate');
const {
  computeDayStatus,
  attributedShiftStartDateStr,
  computeHoursInsideForHoursBasedPayroll,
} = require('./attendanceService');
const { getWeeklyOffs } = require('./holidayService');
const { getAdvanceForEmployeeMonth } = require('./advanceService');
const { markRepaymentDeducted } = require('./advanceLoanService');
const {
  computeMonthlyBaseAndAbsence,
  computePermissionOffset,
  computePaidLeaveEncashment,
} = require('./payrollMath');

const COMPANY_TZ = process.env.COMPANY_TIMEZONE || 'Asia/Kolkata';

async function assertEmployeePayrollScope(companyId, employeeId, allowedBranchIds) {
  if (allowedBranchIds == null) return;
  const r = await pool.query(
    `SELECT branch_id FROM employees WHERE company_id = $1 AND id = $2`,
    [companyId, employeeId]
  );
  if (r.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }
  if (allowedBranchIds.length === 0 || !allowedBranchIds.includes(Number(r.rows[0].branch_id))) {
    throw new AppError('Employee not found for this company', 404);
  }
}
const TZ_OFFSETS = { 'Asia/Kolkata': '+05:30', 'Asia/Calcutta': '+05:30', UTC: 'Z', 'Etc/UTC': 'Z' };

function getShiftStartMsForDate(year, month, day, startHour, startMinute) {
  const offset = TZ_OFFSETS[COMPANY_TZ] ?? '+05:30';
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00${offset === 'Z' ? 'Z' : offset}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date(year, month - 1, day, startHour, startMinute, 0).getTime() : d.getTime();
}

function getMonthBounds(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const daysInMonth = new Date(year, month, 0).getDate();
  return { start, end, daysInMonth };
}

/** For compact hours-based shops, map after-midnight close punches to previous attendance day. */
const LATE_CLOSE_CUTOFF_MINUTES = 6 * 60; // 06:00 IST

function getIstMinutesFromMidnight(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COMPANY_TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const mm = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hh * 60 + mm;
}

function attributedCompactHoursBasedDateStr(punchTime, shiftConfig) {
  const ymd = istYmdFromDate(punchTime);
  const startMin = Number(shiftConfig.startHour || 0) * 60 + Number(shiftConfig.startMinute || 0);
  const mins = getIstMinutesFromMidnight(punchTime);
  if (mins < LATE_CLOSE_CUTOFF_MINUTES && mins < startMin) {
    return addDaysIst(ymd, -1);
  }
  return ymd;
}

/** Company policy: zero shift PL allowance when rawAbsenceDays exceeds threshold. */
function effectivePaidLeaveDaysAllowed(shiftPaidLeaveDays, rawAbsenceDays, forfeitIfAbsenceGt) {
  let allowed = Number(shiftPaidLeaveDays || 0);
  const th = forfeitIfAbsenceGt;
  if (th != null && th !== '' && Number.isFinite(Number(th)) && Number(rawAbsenceDays) > Number(th)) {
    allowed = 0;
  }
  return allowed;
}

function rowToShiftConfig(row) {
  const [startHour, startMinute] = row.start_time.split(':').map(Number);
  const [endHour, endMinute] = row.end_time.split(':').map(Number);
  const startMin = startHour * 60 + startMinute;
  const endMin = endHour * 60 + endMinute;
  const isOvernightClock = endMin < startMin;
  const shiftMinutes =
    endMin >= startMin ? endMin - startMin : 24 * 60 + endMin - startMin;
  const shiftMs = shiftMinutes * 60 * 1000;
  const graceMs = Number(row.grace_minutes || 0) * 60 * 1000;
  const lunchMinutesAllotted = Number(row.lunch_minutes) >= 0 ? Number(row.lunch_minutes) : 60;
  const rawMode = String(row.attendance_mode ?? 'day_based').toLowerCase();
  const attendanceMode =
    rawMode === 'hours_based'
      ? 'hours_based'
      : rawMode === 'shift_based'
        ? 'shift_based'
        : 'day_based';
  const requiredHoursPerDay = Number(row.required_hours_per_day || 8);
  const monthlyPermissionHours = Number(row.monthly_permission_hours || 0);
  const halfDayHoursRaw = Number(row.half_day_hours);
  const halfDayHours = Number.isFinite(halfDayHoursRaw) ? halfDayHoursRaw : null;
  const fullDayHoursRaw = row.full_day_hours;
  const fullDayHoursNum =
    fullDayHoursRaw === null || fullDayHoursRaw === undefined || fullDayHoursRaw === ''
      ? null
      : Number(fullDayHoursRaw);
  const fullDayHours =
    Number.isFinite(fullDayHoursNum) && fullDayHoursNum >= 0 ? fullDayHoursNum : null;
  const weeklyOffDaysRaw = Array.isArray(row.weekly_off_days) ? row.weekly_off_days : [];
  const weeklyOffDays = [...new Set(
    weeklyOffDaysRaw
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  )];
  return {
    id: row.id,
    startHour,
    startMinute,
    endHour,
    endMinute,
    isOvernightClock,
    shiftMs,
    graceMs,
    lunchMinutesAllotted,
    lateDeductionMinutes: Number(row.late_deduction_minutes || 0),
    lateDeductionAmount: Number(row.late_deduction_amount || 0),
    lunchOverDeductionMinutes: Number(row.lunch_over_deduction_minutes || 0),
    lunchOverDeductionAmount: Number(row.lunch_over_deduction_amount || 0),
    noLeaveIncentive: Number(row.no_leave_incentive || 0),
    paidLeaveDays: Number(row.paid_leave_days || 0),
    weeklyOffDays,
    attendanceMode,
    requiredHoursPerDay,
    monthlyPermissionHours,
    halfDayHours,
    fullDayHours,
    allowOvertime: row.allow_overtime !== false,
    overtimeRatePerHour: Number(row.overtime_rate_per_hour || 0),
    overtimeRateMode:
      String(row.overtime_rate_mode || 'fixed').toLowerCase() === 'auto'
        ? 'auto'
        : 'fixed',
  };
}

async function getDefaultShiftForCompany(client, companyId) {
  const result = await client.query(
    `SELECT
       id,
       start_time,
       end_time,
       grace_minutes,
       lunch_minutes,
       late_deduction_minutes,
       late_deduction_amount,
       lunch_over_deduction_minutes,
       lunch_over_deduction_amount,
       no_leave_incentive,
       paid_leave_days,
       weekly_off_days,
       attendance_mode,
       monthly_permission_hours,
       half_day_hours,
       full_day_hours,
       required_hours_per_day,
       allow_overtime,
       overtime_rate_per_hour,
       overtime_rate_mode
     FROM shifts
     WHERE company_id = $1
     ORDER BY id
     LIMIT 1`,
    [companyId]
  );

  if (result.rowCount === 0) {
    throw new AppError('No shift configured for company', 400);
  }

  return rowToShiftConfig(result.rows[0]);
}

/**
 * Get shift config for an employee. Uses employee's assigned shift_id if set, else company default.
 */
async function getShiftForEmployee(client, companyId, employeeId) {
  const empResult = await client.query(
    `SELECT shift_id FROM employees WHERE company_id = $1 AND id = $2`,
    [companyId, employeeId]
  );
  const shiftId = empResult.rowCount > 0 ? empResult.rows[0].shift_id : null;

  if (shiftId) {
    let result;
    try {
      result = await client.query(
        `SELECT
           id, start_time, end_time, grace_minutes, lunch_minutes,
           late_deduction_minutes, late_deduction_amount,
           lunch_over_deduction_minutes, lunch_over_deduction_amount,
           no_leave_incentive,
           paid_leave_days,
           weekly_off_days,
           attendance_mode,
           monthly_permission_hours,
           half_day_hours,
           full_day_hours,
           required_hours_per_day,
           allow_overtime,
           overtime_rate_per_hour,
           overtime_rate_mode
         FROM shifts
         WHERE company_id = $1 AND id = $2`,
        [companyId, shiftId]
      );
    } catch (err) {
      // Backward compatibility: older DBs may not have overtime_rate_mode column yet.
      if (
        err?.code === '42703' &&
        String(err?.message || '').toLowerCase().includes('overtime_rate_mode')
      ) {
        result = await client.query(
          `SELECT
             id, start_time, end_time, grace_minutes, lunch_minutes,
             late_deduction_minutes, late_deduction_amount,
             lunch_over_deduction_minutes, lunch_over_deduction_amount,
             no_leave_incentive,
             paid_leave_days,
             weekly_off_days,
             attendance_mode,
             monthly_permission_hours,
             half_day_hours,
             full_day_hours,
             required_hours_per_day,
             allow_overtime,
             overtime_rate_per_hour
           FROM shifts
           WHERE company_id = $1 AND id = $2`,
          [companyId, shiftId]
        );
      } else {
        throw err;
      }
    }

    if (result?.rowCount > 0) {
      return rowToShiftConfig(result.rows[0]);
    }
  }

  return getDefaultShiftForCompany(client, companyId);
}

/** Add or subtract days from YYYY-MM-DD (IST calendar), return YYYY-MM-DD. */
function addDays(isoDateStr, delta) {
  return addDaysIst(isoDateStr, delta);
}

/**
 * For incomplete months (current month viewed before month-end), only count working days
 * and absence for dates that have already occurred. Avoids penalizing staff for future days.
 */
function getLastDateToConsider(year, month, asOfDate) {
  const todayStr = todayIstYmd();
  const [ty, tm] = todayStr.split('-').map(Number);
  const isCurrentMonth = year === ty && month === tm;
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

  if (!isCurrentMonth || !asOfDate) {
    return lastDayStr;
  }
  const asOfStr =
    typeof asOfDate === 'string' ? asOfDate.slice(0, 10) : istYmdFromDate(asOfDate);
  return asOfStr < lastDayStr ? asOfStr : lastDayStr;
}

async function getAttendanceSummary(companyId, employeeId, year, month, options = {}) {
  const { treatHolidayAdjacentAbsenceAsWorking = false, asOfDate = null } = options;
  const client = await pool.connect();
  try {
    const { daysInMonth } = getMonthBounds(year, month);
    const monthFirstStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthLastStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const shift = await getShiftForEmployee(client, companyId, employeeId);

    const companyPlResult = await client.query(
      `SELECT paid_leave_forfeit_if_absence_gt, shifts_compact_ui FROM companies WHERE id = $1`,
      [companyId]
    );
    const plForfeitIfAbsenceGt = companyPlResult.rows[0]?.paid_leave_forfeit_if_absence_gt;

    const needOvernightRange =
      shift.isOvernightClock &&
      (shift.attendanceMode === 'shift_based' || shift.attendanceMode === 'hours_based');
    const rangeStart = needOvernightRange
      ? addDays(monthFirstStr, -1)
      : monthFirstStr;
    const rangeEnd = needOvernightRange
      ? addDays(monthLastStr, 1)
      : monthLastStr;

    const [logsResult, holidaySet] = await Promise.all([
      client.query(
        `SELECT punch_time, punch_type
         FROM attendance_logs
         WHERE company_id = $1
           AND employee_id = $2
           AND ${SQL_PUNCH_IST_DATE} >= $3::date
           AND ${SQL_PUNCH_IST_DATE} <= $4::date
         ORDER BY punch_time ASC`,
        [companyId, employeeId, rangeStart, rangeEnd]
      ),
      getHolidayDatesForRange(companyId, monthFirstStr, monthLastStr, shift.weeklyOffDays),
    ]);

    const firstDayStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayOfMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const lastDateToConsider = getLastDateToConsider(year, month, asOfDate);

    let workingDays = 0;
    let workingDaysInMonth = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (!holidaySet.has(dayStr)) workingDaysInMonth += 1;
      if (dayStr > lastDateToConsider) continue;
      if (!holidaySet.has(dayStr)) workingDays += 1;
    }

    const logsByDay = new Map();

    for (const row of logsResult.rows) {
      const punchTime = new Date(row.punch_time);
      let key;
      if (
        shiftsCompactUi &&
        shift.attendanceMode === 'hours_based'
      ) {
        key = attributedCompactHoursBasedDateStr(punchTime, shift);
      } else if (
        shift.isOvernightClock &&
        (shift.attendanceMode === 'shift_based' || shift.attendanceMode === 'hours_based')
      ) {
        key = attributedShiftStartDateStr(punchTime, shift);
      } else {
        key = istYmdFromDate(punchTime);
      }
      if (key < monthFirstStr || key > monthLastStr) continue;
      if (!logsByDay.has(key)) {
        logsByDay.set(key, []);
      }
      logsByDay.get(key).push({
        punchTime,
        punchType: row.punch_type.toLowerCase(),
      });
    }

    /** Days where employee actually worked (workedMs > 0 or hoursInside > 0). */
    const presentDayKeys = new Set();
    let presentDays = 0;
    let presentWorkingDays = 0;
    let totalOvertimeMs = 0;
    let totalLateMs = 0;
    let totalLunchOverMs = 0;
    /** Number of days employee was late (for fixed deduction per late day). */
    let lateDays = 0;
    /** Number of days employee went over allotted lunch (for fixed deduction per day). */
    let lunchOverDays = 0;
    /** Number of half-days (each contributes 0.5 present / 0.5 absence). */
    let halfDayDays = 0;

    const allottedLunchMs = (shift.lunchMinutesAllotted ?? 60) * 60 * 1000;

    // Hours-based mode: payroll is hour-ratio based for all companies.
    // No half-day/full-day buckets are used; each day contributes workedHours/requiredHours.
    if (shift.attendanceMode === 'hours_based') {
      const required = Number(shift.requiredHoursPerDay || 8);
      const dayDetails = [];

      let rawAbsenceDays = 0;
      let rawAbsenceHours = 0;
      let overtimeHours = 0;

      // Iterate every calendar day up to lastDateToConsider so working days with no punches
      // are counted absent (logsByDay only had keys where at least one punch existed).
      for (let d = 1; d <= daysInMonth; d += 1) {
        const dayKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (dayKey > lastDateToConsider) {
          break;
        }
        const isHoliday = holidaySet.has(dayKey);
        const dayLogs = logsByDay.get(dayKey) || [];

        if (!dayLogs.length) {
          if (!isHoliday) {
            rawAbsenceDays += 1;
            rawAbsenceHours += required;
            dayDetails.push({
              date: dayKey,
              firstInTime: null,
              totalHoursInside: 0,
              late: false,
              minutesLate: 0,
              status: 'absent',
            });
          }
          continue;
        }

        const sorted = [...dayLogs].sort((a, b) => a.punchTime - b.punchTime);
        const hoursInside = computeHoursInsideForHoursBasedPayroll(sorted, shift, dayKey);
        const workedHoursCapped = Math.min(required, Math.max(0, Number(hoursInside || 0)));

        const presentFraction = required > 0 ? workedHoursCapped / required : 0;
        let statusLabel = 'absent';

        if (hoursInside >= required) {
          overtimeHours += hoursInside - required;
        }
        if (hoursInside >= required) {
          statusLabel = 'present';
        } else if (presentFraction > 0) {
          statusLabel = 'half_day';
        }

        let firstInTime = null;
        for (const log of sorted) {
          if (log.punchType === 'in') {
            firstInTime = log.punchTime;
            break;
          }
        }

        let isLate = false;
        let minutesLate = 0;
        if (firstInTime && !isHoliday) {
          const [y, mo, dNum] = dayKey.split('-').map(Number);
          const shiftStartMs = getShiftStartMsForDate(
            y,
            mo,
            dNum,
            shift.startHour,
            shift.startMinute
          );
          const allowedStartMs = shiftStartMs + shift.graceMs;
          if (firstInTime.getTime() > allowedStartMs) {
            isLate = true;
            const diffMs = firstInTime.getTime() - allowedStartMs;
            minutesLate = Math.round(diffMs / (60 * 1000));
            totalLateMs += diffMs;
            lateDays += 1;
          }
        }

        if (presentFraction > 0) {
          presentDayKeys.add(dayKey);
          presentDays += presentFraction;
          if (!isHoliday) {
            presentWorkingDays += presentFraction;
            if (presentFraction > 0 && presentFraction < 1) {
              halfDayDays += 1;
            }
          }
        } else if (!isHoliday) {
          rawAbsenceDays += 1;
        }
        if (!isHoliday) {
          rawAbsenceHours += Math.max(0, required - workedHoursCapped);
        }

        dayDetails.push({
          date: dayKey,
          firstInTime: firstInTime ? firstInTime.toISOString() : null,
          totalHoursInside: hoursInside,
          late: isLate,
          minutesLate,
          status: statusLabel,
        });
      }

      let effectiveWorkingDays = workingDays;
      if (treatHolidayAdjacentAbsenceAsWorking && holidaySet.size > 0) {
        let holidaysCountedAsWorking = 0;
        for (const holidayKey of holidaySet) {
          if (holidayKey > lastDateToConsider) continue;
          const prevKey = addDays(holidayKey, -1);
          const nextKey = addDays(holidayKey, 1);
          const absentPrev =
            prevKey >= firstDayStr &&
            prevKey <= lastDateToConsider &&
            !presentDayKeys.has(prevKey);
          const absentNext =
            nextKey >= firstDayStr &&
            nextKey <= lastDateToConsider &&
            !presentDayKeys.has(nextKey);
          if (absentPrev || absentNext) {
            holidaysCountedAsWorking += 1;
          }
        }
        effectiveWorkingDays = workingDays + holidaysCountedAsWorking;
      }

      let paidLeaveDaysAllowed = effectivePaidLeaveDaysAllowed(
        shift.paidLeaveDays,
        rawAbsenceDays,
        plForfeitIfAbsenceGt
      );
      let paidLeaveUsed = Math.min(paidLeaveDaysAllowed, rawAbsenceDays);
      let absenceDays = Math.max(0, rawAbsenceDays - paidLeaveUsed);
      // Hours-based payroll always applies paid leave against shortfall hours.
      const rawAbsenceDaysByHours = required > 0 ? rawAbsenceHours / required : 0;
      paidLeaveDaysAllowed = effectivePaidLeaveDaysAllowed(
        shift.paidLeaveDays,
        rawAbsenceDaysByHours,
        plForfeitIfAbsenceGt
      );
      const paidLeaveHoursAllowed = Math.max(0, paidLeaveDaysAllowed * required);
      const paidLeaveHoursUsed = Math.min(paidLeaveHoursAllowed, rawAbsenceHours);
      paidLeaveUsed = required > 0 ? paidLeaveHoursUsed / required : 0;
      absenceDays = required > 0 ? Math.max(0, rawAbsenceHours - paidLeaveHoursUsed) / required : 0;
      rawAbsenceDays = rawAbsenceDaysByHours;
      const unusedPaidLeaveDaysRaw = Math.max(
        0,
        Number(paidLeaveDaysAllowed || 0) - Number(paidLeaveUsed || 0)
      );
      const unusedPaidLeaveHoursRaw = Math.max(0, unusedPaidLeaveDaysRaw * required);
      const unusedPaidLeaveDays = Number(unusedPaidLeaveDaysRaw.toFixed(2));
      const unusedPaidLeaveHours = Number(unusedPaidLeaveHoursRaw.toFixed(2));
      const unusedPaidLeaveMinutes = Math.round(unusedPaidLeaveHoursRaw * 60);

      const overtimeHoursFinal = overtimeHours;
      const lateMinutes = totalLateMs / (60 * 1000);

      return {
        daysInMonth,
        workingDaysUpToDate: lastDateToConsider,
        workingDays,
        workingDaysInMonth,
        presentDays,
        presentWorkingDays,
        overtimeHours: overtimeHoursFinal,
        lateMinutes,
        lunchOverMinutes: 0,
        lateDays,
        lunchOverDays: 0,
        halfDayDays,
        lateDeductionMinutes: shift.lateDeductionMinutes,
        lateDeductionAmount: shift.lateDeductionAmount,
        lunchOverDeductionMinutes: 0,
        lunchOverDeductionAmount: 0,
        noLeaveIncentiveFromShift: shift.noLeaveIncentive,
        paidLeaveDaysAllowed,
        paidLeaveUsed,
        unusedPaidLeaveDays,
        unusedPaidLeaveHours,
        unusedPaidLeaveMinutes,
        rawAbsenceDays,
        absenceDays,
        attendanceMode: 'hours_based',
        requiredHoursPerDay: required,
        dayDetails,
      };
    }

    for (const [dayKey, dayLogs] of logsByDay.entries()) {
      if (!dayLogs.length || dayKey > lastDateToConsider) continue;

      const sorted = [...dayLogs].sort((a, b) => a.punchTime - b.punchTime);
      const logsForStatus = sorted.map((l) => ({
        punch_time: l.punchTime.toISOString(),
        punch_type: l.punchType,
      }));

      const status = computeDayStatus(logsForStatus, shift, dayKey);

      if (!status.present) {
        continue;
      }

      presentDayKeys.add(dayKey);
      const isHoliday = holidaySet.has(dayKey);

      const presentFraction = status.halfDay ? 0.5 : 1;
      presentDays += presentFraction;
      if (!isHoliday) {
        presentWorkingDays += presentFraction;
        if (status.halfDay) {
          halfDayDays += 1;
        }
      }

      if (status.overtimeHours && status.overtimeHours > 0) {
        totalOvertimeMs += status.overtimeHours * 60 * 60 * 1000;
      }

      if (status.late && !isHoliday) {
        const [y2, m2, d2] = dayKey.split('-').map(Number);
        const shiftStartMs = getShiftStartMsForDate(
          y2,
          m2,
          d2,
          shift.startHour,
          shift.startMinute
        );
        const allowedStartMs = shiftStartMs + shift.graceMs;
        const firstInTime = sorted.find((l) => l.punchType === 'in')?.punchTime || null;
        if (firstInTime) {
          totalLateMs += Math.max(0, firstInTime.getTime() - allowedStartMs);
          lateDays += 1;
        }
      }

      if (status.lunchOverMinutes && status.lunchOverMinutes > 0) {
        totalLunchOverMs += status.lunchOverMinutes * 60 * 1000;
        lunchOverDays += 1;
      }
    }

    let effectiveWorkingDays = workingDays;
    if (treatHolidayAdjacentAbsenceAsWorking && holidaySet.size > 0) {
      let holidaysCountedAsWorking = 0;
      for (const holidayKey of holidaySet) {
        if (holidayKey > lastDateToConsider) continue;
        const prevKey = addDays(holidayKey, -1);
        const nextKey = addDays(holidayKey, 1);
        const absentPrev = prevKey >= firstDayStr && prevKey <= lastDateToConsider && !presentDayKeys.has(prevKey);
        const absentNext = nextKey >= firstDayStr && nextKey <= lastDateToConsider && !presentDayKeys.has(nextKey);
        if (absentPrev || absentNext) {
          holidaysCountedAsWorking += 1;
        }
      }
      effectiveWorkingDays = workingDays + holidaysCountedAsWorking;
    }

    const rawAbsenceDays = Math.max(0, effectiveWorkingDays - presentWorkingDays);

    // Apply per-shift paid leave allowance: some companies allow a fixed number of paid leave
    // days per month (no salary loss). Treat up to paidLeaveDays as non-absence for payroll.
    const paidLeaveDaysAllowed = effectivePaidLeaveDaysAllowed(
      shift.paidLeaveDays,
      rawAbsenceDays,
      plForfeitIfAbsenceGt
    );
    const paidLeaveUsed = Math.min(paidLeaveDaysAllowed, rawAbsenceDays);
    const absenceDays = Math.max(0, rawAbsenceDays - paidLeaveUsed);
    const unusedPaidLeaveDaysRaw = Math.max(
      0,
      Number(paidLeaveDaysAllowed || 0) - Number(paidLeaveUsed || 0)
    );
    const unusedPaidLeaveHoursRaw = Math.max(
      0,
      unusedPaidLeaveDaysRaw *
        (shift.attendanceMode === 'hours_based'
          ? Number(shift.requiredHoursPerDay || 8)
          : 24)
    );
    const unusedPaidLeaveDays = Number(unusedPaidLeaveDaysRaw.toFixed(2));
    const unusedPaidLeaveHours = Number(unusedPaidLeaveHoursRaw.toFixed(2));
    const unusedPaidLeaveMinutes = Math.round(unusedPaidLeaveHoursRaw * 60);

    const overtimeHours = totalOvertimeMs / (60 * 60 * 1000);
    const lateMinutes = totalLateMs / (60 * 1000);
    const lunchOverMinutes = totalLunchOverMs / (60 * 1000);

    return {
      daysInMonth,
      workingDaysUpToDate: lastDateToConsider,
      workingDays,
      workingDaysInMonth,
      presentDays,
      presentWorkingDays,
      overtimeHours,
      lateMinutes,
      lunchOverMinutes,
      lateDays,
      lunchOverDays,
      halfDayDays,
      lateDeductionMinutes: shift.lateDeductionMinutes,
      lateDeductionAmount: shift.lateDeductionAmount,
      lunchOverDeductionMinutes: shift.lunchOverDeductionMinutes,
      lunchOverDeductionAmount: shift.lunchOverDeductionAmount,
      noLeaveIncentiveFromShift: shift.noLeaveIncentive,
      paidLeaveDaysAllowed,
      paidLeaveUsed,
      unusedPaidLeaveDays,
      unusedPaidLeaveHours,
      unusedPaidLeaveMinutes,
      rawAbsenceDays,
      absenceDays,
      attendanceMode: shift.attendanceMode || 'day_based',
      requiredHoursPerDay: shift.requiredHoursPerDay || 8,
      dayDetails: null,
    };
  } finally {
    client.release();
  }
}

/**
 * Get paid holiday dates (company holidays + weekly off days) for any range.
 * Weekly off days are derived from the employee's shift when available; otherwise fall back to company_weekly_offs.
 */
async function getHolidayDatesForRange(companyId, startDateStr, endDateStr, shiftWeeklyOffDays = null) {
  const start = String(startDateStr).slice(0, 10);
  const end = String(endDateStr).slice(0, 10);

  const [holidaysResult, companyWeeklyOffs] = await Promise.all([
    pool.query(
      `SELECT holiday_date
       FROM company_holidays
       WHERE company_id = $1
         AND holiday_date >= $2::date
         AND holiday_date <= $3::date`,
      [companyId, start, end]
    ),
    shiftWeeklyOffDays && Array.isArray(shiftWeeklyOffDays) && shiftWeeklyOffDays.length > 0
      ? Promise.resolve([])
      : getWeeklyOffs(companyId),
  ]);

  const shiftWeeklyOffs = Array.isArray(shiftWeeklyOffDays) ? shiftWeeklyOffDays : [];
  const weeklyOffDays =
    shiftWeeklyOffs.length > 0
      ? shiftWeeklyOffs
      : companyWeeklyOffs;

  const set = new Set(
    holidaysResult.rows.map((r) => r.holiday_date.toISOString().slice(0, 10))
  );

  // Add recurring weekly-off days
  let cur = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  while (cur.getTime() <= endDate.getTime()) {
    const dayKey = cur.toISOString().slice(0, 10);
    const dayOfWeek = cur.getUTCDay(); // 0=Sunday..6=Saturday
    if (weeklyOffDays.includes(dayOfWeek)) set.add(dayKey);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return set;
}

function parseYmd(ymdStr) {
  const [y, m, d] = String(ymdStr).slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

/**
 * Attendance summary for a date range (used for weekly payroll).
 * - Holidays/weekly-offs are treated as *paid* (count as presentDays) so they do not reduce salary.
 * - Weekly payroll uses no paid-leave adjustment by default (paidLeaveDaysAllowed = 0).
 */
async function getAttendanceSummaryForRange(companyId, employeeId, startDateStr, endDateStr, options = {}) {
  const {
    treatHolidayAdjacentAbsenceAsWorking = false,
    asOfDate = null,
    disablePaidLeave = true,
    holidayCountAsPresent = true,
  } = options;

  const client = await pool.connect();
  try {
    const startStr = String(startDateStr).slice(0, 10);
    const endStr = String(endDateStr).slice(0, 10);
    const lastDateToConsider = asOfDate ? String(asOfDate).slice(0, 10) : endStr;

    const shift = await getShiftForEmployee(client, companyId, employeeId);

    const companyPlRangeResult = await client.query(
      `SELECT paid_leave_forfeit_if_absence_gt, shifts_compact_ui FROM companies WHERE id = $1`,
      [companyId]
    );
    const plForfeitIfAbsenceGtRange = companyPlRangeResult.rows[0]?.paid_leave_forfeit_if_absence_gt;

    const needOvernightRange =
      shift.isOvernightClock &&
      (shift.attendanceMode === 'shift_based' || shift.attendanceMode === 'hours_based');
    const rangeStart = needOvernightRange ? addDays(startStr, -1) : startStr;
    const rangeEnd = needOvernightRange ? addDays(endStr, 1) : endStr;

    const [logsResult, holidaySet] = await Promise.all([
      client.query(
        `SELECT punch_time, punch_type
         FROM attendance_logs
         WHERE company_id = $1
           AND employee_id = $2
           AND ${SQL_PUNCH_IST_DATE} >= $3::date
           AND ${SQL_PUNCH_IST_DATE} <= $4::date
         ORDER BY punch_time ASC`,
        [companyId, employeeId, rangeStart, rangeEnd]
      ),
      getHolidayDatesForRange(companyId, startStr, endStr, shift.weeklyOffDays),
    ]);

    // Build logs by attendance day key
    const logsByDay = new Map();
    for (const row of logsResult.rows) {
      const punchTime = new Date(row.punch_time);
      let key;
      if (
        shift.isOvernightClock &&
        (shift.attendanceMode === 'shift_based' || shift.attendanceMode === 'hours_based')
      ) {
        key = attributedShiftStartDateStr(punchTime, shift);
      } else {
        key = istYmdFromDate(punchTime);
      }
      if (key < startStr || key > endStr) continue;
      if (!logsByDay.has(key)) logsByDay.set(key, []);
      logsByDay.get(key).push({
        punchTime,
        punchType: String(row.punch_type || '').toLowerCase(),
      });
    }

    // Count working days (non-holidays) up to lastDateToConsider.
    let workingDays = 0;
    let presentDays = 0;
    let presentWorkingDays = 0;
    let totalLateMs = 0;
    let totalLunchOverMs = 0;
    let lateDays = 0;
    let lunchOverDays = 0;
    let halfDayDays = 0;
    let totalOvertimeMs = 0;
    let rawAbsenceHours = 0;

    const presentDayKeys = new Set();
    const dayDetails = [];

    // Iterate day-by-day across the range (inclusive)
    let cur = new Date(`${startStr}T00:00:00Z`);
    const endConsider = new Date(`${lastDateToConsider}T00:00:00Z`);
    while (cur.getTime() <= endConsider.getTime()) {
      const dayKey = cur.toISOString().slice(0, 10);
      const isHoliday = holidaySet.has(dayKey);
      const dayLogs = logsByDay.get(dayKey) || [];

      if (shift.attendanceMode === 'hours_based') {
        const required = Number(shift.requiredHoursPerDay || 8);

        // Holiday/weekly-off is paid: count as full-day present.
        if (holidayCountAsPresent && isHoliday) {
          presentDayKeys.add(dayKey);
          presentDays += 1;
          // Keep holiday days out of presentWorkingDays (travel etc. should be excluded)
          dayDetails.push({
            date: dayKey,
            firstInTime: null,
            totalHoursInside: 0,
            late: false,
            minutesLate: 0,
            status: 'present',
          });
          cur.setUTCDate(cur.getUTCDate() + 1);
          continue;
        }

        const sorted = [...dayLogs].sort((a, b) => a.punchTime - b.punchTime);
        const hoursInside = computeHoursInsideForHoursBasedPayroll(sorted, shift, dayKey);
        const workedHoursCapped = Math.min(required, Math.max(0, Number(hoursInside || 0)));

        const presentFraction = required > 0 ? workedHoursCapped / required : 0;
        let statusLabel = 'absent';
        if (hoursInside >= required) {
          totalOvertimeMs += (hoursInside - required) * 60 * 60 * 1000;
        }
        if (hoursInside >= required) {
          statusLabel = 'present';
        } else if (presentFraction > 0) {
          statusLabel = 'half_day';
        }

        // Late detection (non-holiday only)
        let isLate = false;
        let minutesLate = 0;
        const firstInTime = sorted.find((l) => l.punchType === 'in')?.punchTime || null;
        if (firstInTime) {
          const { y, m, d } = parseYmd(dayKey);
          const shiftStartMs = getShiftStartMsForDate(
            y,
            m,
            d,
            shift.startHour,
            shift.startMinute
          );
          const allowedStartMs = shiftStartMs + shift.graceMs;
          if (firstInTime.getTime() > allowedStartMs) {
            isLate = true;
            const diffMs = firstInTime.getTime() - allowedStartMs;
            minutesLate = Math.round(diffMs / (60 * 1000));
            totalLateMs += diffMs;
            lateDays += 1;
          }
        }

        if (presentFraction > 0) {
          presentDayKeys.add(dayKey);
          presentDays += presentFraction;
          if (!isHoliday) {
            presentWorkingDays += presentFraction;
            if (presentFraction > 0 && presentFraction < 1) {
              halfDayDays += 1;
            }
          }
        } else if (!isHoliday) {
          // full absence => counted in effectiveWorkingDays - presentWorkingDays later
        }

        // Track workingDays for absence math (non-holidays only)
        if (!isHoliday) workingDays += 1;
        if (!isHoliday) {
          rawAbsenceHours += Math.max(0, required - workedHoursCapped);
        }

        dayDetails.push({
          date: dayKey,
          firstInTime: firstInTime ? firstInTime.toISOString() : null,
          totalHoursInside: hoursInside,
          late: isLate,
          minutesLate,
          status: statusLabel,
        });
      } else {
        // day_based / shift_based
        if (!isHoliday) workingDays += 1;

        // Holiday/weekly-off is paid: count as present even if there are no valid logs.
        if (holidayCountAsPresent && isHoliday && dayLogs.length === 0) {
          presentDayKeys.add(dayKey);
          presentDays += 1;
          cur.setUTCDate(cur.getUTCDate() + 1);
          continue;
        }

        const sorted = [...dayLogs].sort((a, b) => a.punchTime - b.punchTime);
        const logsForStatus = sorted.map((l) => ({
          punch_time: l.punchTime.toISOString(),
          punch_type: l.punchType,
        }));

        const status = computeDayStatus(logsForStatus, shift, dayKey);

        // If it's a holiday but status says absent (e.g. invalid punch pattern), still pay full day.
        const shouldCountPresent = status.present || (holidayCountAsPresent && isHoliday);
        if (!shouldCountPresent) {
          cur.setUTCDate(cur.getUTCDate() + 1);
          continue;
        }

        const presentFraction = isHoliday ? 1 : status.halfDay ? 0.5 : 1;
        presentDayKeys.add(dayKey);
        presentDays += presentFraction;
        if (!isHoliday) {
          presentWorkingDays += presentFraction;
          if (status.halfDay) {
            halfDayDays += 1;
          }
        }

        if (status.overtimeHours && status.overtimeHours > 0) {
          totalOvertimeMs += status.overtimeHours * 60 * 60 * 1000;
        }

        if (status.late && !isHoliday) {
          const { y, m, d } = parseYmd(dayKey);
          const shiftStartMs = getShiftStartMsForDate(
            y,
            m,
            d,
            shift.startHour,
            shift.startMinute
          );
          const allowedStartMs = shiftStartMs + shift.graceMs;
          const firstInTime = sorted.find((l) => l.punchType === 'in')?.punchTime || null;
          if (firstInTime) {
            totalLateMs += Math.max(0, firstInTime.getTime() - allowedStartMs);
            lateDays += 1;
          }
        }

        if (status.lunchOverMinutes && status.lunchOverMinutes > 0) {
          totalLunchOverMs += status.lunchOverMinutes * 60 * 1000;
          lunchOverDays += 1;
        }

        dayDetails.push({
          date: dayKey,
          firstInTime: status.firstInTime ? status.firstInTime.toISOString() : null,
          totalHoursInside: null,
          late: Boolean(status.late),
          minutesLate: status.minutesLate ?? 0,
          status: status.present ? (status.halfDay ? 'half_day' : 'present') : 'present',
        });
      }

      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    let effectiveWorkingDays = workingDays;
    if (treatHolidayAdjacentAbsenceAsWorking && holidaySet.size > 0) {
      let holidaysCountedAsWorking = 0;
      for (const holidayKey of holidaySet) {
        if (holidayKey > lastDateToConsider) continue;
        const prevKey = addDays(holidayKey, -1);
        const nextKey = addDays(holidayKey, 1);
        const absentPrev =
          prevKey >= startStr && prevKey <= lastDateToConsider && !presentDayKeys.has(prevKey);
        const absentNext =
          nextKey >= startStr && nextKey <= lastDateToConsider && !presentDayKeys.has(nextKey);
        if (absentPrev || absentNext) {
          holidaysCountedAsWorking += 1;
        }
      }
      effectiveWorkingDays = workingDays + holidaysCountedAsWorking;
    }

    let rawAbsenceDays = Math.max(0, effectiveWorkingDays - presentWorkingDays);
    let paidLeaveDaysAllowed = disablePaidLeave
      ? 0
      : effectivePaidLeaveDaysAllowed(shift.paidLeaveDays, rawAbsenceDays, plForfeitIfAbsenceGtRange);
    let paidLeaveUsed = disablePaidLeave ? 0 : Math.min(paidLeaveDaysAllowed, rawAbsenceDays);
    let absenceDays = Math.max(0, rawAbsenceDays - paidLeaveUsed);
    if (shift.attendanceMode === 'hours_based' && disablePaidLeave !== true) {
      const required = Number(shift.requiredHoursPerDay || 8);
      const rawAbsenceDaysByHours = required > 0 ? rawAbsenceHours / required : 0;
      paidLeaveDaysAllowed = effectivePaidLeaveDaysAllowed(
        shift.paidLeaveDays,
        rawAbsenceDaysByHours,
        plForfeitIfAbsenceGtRange
      );
      const paidLeaveHoursAllowed = Math.max(0, paidLeaveDaysAllowed * required);
      const paidLeaveHoursUsed = Math.min(paidLeaveHoursAllowed, rawAbsenceHours);
      paidLeaveUsed = required > 0 ? paidLeaveHoursUsed / required : 0;
      absenceDays = required > 0 ? Math.max(0, rawAbsenceHours - paidLeaveHoursUsed) / required : 0;
      rawAbsenceDays = rawAbsenceDaysByHours;
    }
    const unusedPaidLeaveDaysRaw = Math.max(
      0,
      Number(paidLeaveDaysAllowed || 0) - Number(paidLeaveUsed || 0)
    );
    const unusedPaidLeaveHoursRaw = Math.max(
      0,
      unusedPaidLeaveDaysRaw *
        (shift.attendanceMode === 'hours_based'
          ? Number(shift.requiredHoursPerDay || 8)
          : 24)
    );
    const unusedPaidLeaveDays = Number(unusedPaidLeaveDaysRaw.toFixed(2));
    const unusedPaidLeaveHours = Number(unusedPaidLeaveHoursRaw.toFixed(2));
    const unusedPaidLeaveMinutes = Math.round(unusedPaidLeaveHoursRaw * 60);

    const overtimeHours = totalOvertimeMs / (60 * 60 * 1000);
    const lateMinutes = totalLateMs / (60 * 1000);
    const lunchOverMinutes = totalLunchOverMs / (60 * 1000);

    const daysInRange = (() => {
      const a = new Date(`${startStr}T00:00:00Z`).getTime();
      const b = new Date(`${lastDateToConsider}T00:00:00Z`).getTime();
      const diffDays = Math.round((b - a) / (24 * 60 * 60 * 1000));
      return diffDays + 1;
    })();

    return {
      daysInRange,
      workingDaysUpToDate: lastDateToConsider,
      workingDays,
      presentDays,
      presentWorkingDays,
      overtimeHours,
      lateMinutes,
      lunchOverMinutes,
      lateDays,
      lunchOverDays,
      halfDayDays,
      lateDeductionMinutes: shift.lateDeductionMinutes,
      lateDeductionAmount: shift.lateDeductionAmount,
      lunchOverDeductionMinutes: shift.lunchOverDeductionMinutes,
      lunchOverDeductionAmount: shift.lunchOverDeductionAmount,
      noLeaveIncentiveFromShift: disablePaidLeave ? 0 : shift.noLeaveIncentive,
      paidLeaveDaysAllowed,
      paidLeaveUsed,
      unusedPaidLeaveDays,
      unusedPaidLeaveHours,
      unusedPaidLeaveMinutes,
      rawAbsenceDays,
      absenceDays,
      attendanceMode: shift.attendanceMode || 'day_based',
      requiredHoursPerDay: shift.requiredHoursPerDay || 8,
      dayDetails,
    };
  } finally {
    client.release();
  }
}

function getWeekEndDate(weekStartDateStr) {
  return addDays(String(weekStartDateStr).slice(0, 10), 6);
}

function getDaysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate(); // month1to12: 1=Jan..12=Dec
}

/**
 * Generate weekly payroll for one employee (Sun–Sat).
 */
async function generateWeeklyPayroll(
  companyId,
  employeeId,
  weekStartDateStr,
  payrollOptions = {}
) {
  const {
    includeOvertime = true,
    treatHolidayAdjacentAbsenceAsWorking = false,
    allowedBranchIds = null,
    apply_salary_advances: applySalaryAdvancesRaw = true,
    apply_advance_repayments: applyAdvanceRepaymentsRaw = true,
  } = payrollOptions;

  const applySalaryAdvances = applySalaryAdvancesRaw !== false;
  const applyAdvanceRepayments = applyAdvanceRepaymentsRaw !== false;

  const weekStart = String(weekStartDateStr).slice(0, 10);
  const weekEnd = getWeekEndDate(weekStart);

  const { y: endYear, m: endMonth } = parseYmd(weekEnd);
  const monthLastDay = getDaysInMonth(endYear, endMonth);
  const monthLastDayStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(monthLastDay).padStart(2, '0')}`;
  const shouldDeductEsi = weekEnd === monthLastDayStr;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const employeeResult = await client.query(
      `SELECT id, basic_salary, status, daily_travel_allowance, esi_amount, pf_amount, salary_type
       FROM employees
       WHERE company_id = $1 AND id = $2`,
      [companyId, employeeId]
    );

    if (employeeResult.rowCount === 0) {
      throw new AppError('Employee not found for this company', 404);
    }

    const employee = employeeResult.rows[0];

    await assertEmployeePayrollScope(companyId, employeeId, allowedBranchIds);

    if (employee.status !== 'active') {
      throw new AppError('Cannot generate payroll for inactive employee', 400);
    }

    const todayStr = todayIstYmd();
    const isCurrentWeek = todayStr >= weekStart && todayStr <= weekEnd;
    const asOfDate = isCurrentWeek ? todayStr : null;

    const { y: startYear, m: startMonth } = parseYmd(weekStart);
    const basicSalary = Number(employee.basic_salary || 0);
    const daysInStartMonth = getDaysInMonth(startYear, startMonth);
    const salaryType = String(employee.salary_type || 'monthly').toLowerCase();
    const dailyRate =
      salaryType === 'per_day'
        ? basicSalary
        : daysInStartMonth > 0
          ? basicSalary / daysInStartMonth
          : 0;
    const hourlyRate = dailyRate / 8;

    const summary = await getAttendanceSummaryForRange(companyId, employeeId, weekStart, weekEnd, {
      treatHolidayAdjacentAbsenceAsWorking,
      asOfDate,
      disablePaidLeave: true,
      holidayCountAsPresent: true,
    });

    const shiftConfig = await getShiftForEmployee(client, companyId, employeeId);

    const shiftHoursForRate =
      summary.attendanceMode === 'hours_based'
        ? Number(summary.requiredHoursPerDay || 8)
        : Number(shiftConfig.shiftMs || 0) / (60 * 60 * 1000);

    const effectiveOvertimeRate =
      shiftConfig.overtimeRateMode === 'auto'
        ? shiftHoursForRate > 0
          ? dailyRate / shiftHoursForRate
          : 0
        : Number(shiftConfig.overtimeRatePerHour || 0);

    const overtimePay =
      includeOvertime && shiftConfig.allowOvertime
        ? summary.overtimeHours * effectiveOvertimeRate
        : 0;
    const dailyTravelAllowance = Number(employee.daily_travel_allowance || 0);
    const travelAllowance = dailyTravelAllowance * (summary.presentWorkingDays ?? 0);

    // Weekly payroll ignores paid leave and incentives.
    const earnedBasic =
      salaryType === 'per_day'
        ? dailyRate * (summary.presentWorkingDays ?? 0)
        : dailyRate * (summary.presentDays ?? 0);

    let absenceDeduction = 0;
    if (salaryType !== 'per_day' && summary.attendanceMode === 'hours_based') {
      absenceDeduction = dailyRate * (summary.absenceDays || 0);
    }

    let lateDeduction = 0;
    if (
      (summary.lateDays || 0) > 0 &&
      summary.lateDeductionMinutes > 0 &&
      summary.lateDeductionAmount > 0
    ) {
      lateDeduction = summary.lateDays * summary.lateDeductionAmount;
    }

    let lunchOverDeduction = 0;
    if (
      (summary.lunchOverDays || 0) > 0 &&
      summary.lunchOverDeductionMinutes > 0 &&
      summary.lunchOverDeductionAmount > 0
    ) {
      lunchOverDeduction = summary.lunchOverDays * summary.lunchOverDeductionAmount;
    }

    const esiDeduction = shouldDeductEsi ? Number(employee.esi_amount || 0) : 0;
    const pfDeduction = shouldDeductEsi ? Number(employee.pf_amount || 0) : 0;
    const deductions = absenceDeduction + lateDeduction + lunchOverDeduction + esiDeduction + pfDeduction;

    const salaryAdvanceBase = applySalaryAdvances
      ? await getAdvanceForEmployeeMonth(companyId, employeeId, endYear, endMonth)
      : 0;

    const repaymentRowsResult = applyAdvanceRepayments
      ? await client.query(
          `SELECT
             r.id,
             r.loan_id,
             r.repayment_amount,
             r.status
           FROM employee_advance_repayments r
           INNER JOIN employee_advance_loans l
             ON l.id = r.loan_id
            AND l.company_id = r.company_id
           WHERE r.company_id = $1
             AND r.employee_id = $2
             AND r.year = $3
             AND r.month = $4
             AND r.status IN ('pending', 'deducted')
             AND l.status IN ('active', 'on_hold', 'cleared')
           ORDER BY r.id ASC`,
          [companyId, employeeId, endYear, endMonth]
        )
      : { rows: [] };

    const repaymentRows = repaymentRowsResult.rows || [];
    const pendingRepaymentRows = repaymentRows.filter((row) => row.status === 'pending');
    const monthRepaymentAdvance = repaymentRows.reduce(
      (sum, row) => sum + Number(row.repayment_amount || 0),
      0
    );

    const salaryAdvance = salaryAdvanceBase + monthRepaymentAdvance;

    const grossSalary = earnedBasic + overtimePay + travelAllowance;
    const netSalary = grossSalary - deductions - salaryAdvance;

    const weeklyOvertimeHoursBillable = shiftConfig.allowOvertime
      ? Number(summary.overtimeHours || 0)
      : 0;

    const insertResult = await client.query(
      `INSERT INTO weekly_payroll_records (
         company_id,
         employee_id,
         week_start_date,
         week_end_date,
         total_days,
         present_days,
         absence_days,
         overtime_hours,
         gross_salary,
         deductions,
         salary_advance,
         no_leave_incentive,
         net_salary
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (company_id, employee_id, week_start_date)
       DO UPDATE SET
         week_end_date = EXCLUDED.week_end_date,
         total_days = EXCLUDED.total_days,
         present_days = EXCLUDED.present_days,
         absence_days = EXCLUDED.absence_days,
         overtime_hours = EXCLUDED.overtime_hours,
         gross_salary = EXCLUDED.gross_salary,
         deductions = EXCLUDED.deductions,
         salary_advance = EXCLUDED.salary_advance,
         no_leave_incentive = EXCLUDED.no_leave_incentive,
         net_salary = EXCLUDED.net_salary,
         generated_at = NOW()
       RETURNING *`,
      [
        companyId,
        employeeId,
        weekStart,
        weekEnd,
        summary.daysInRange,
        summary.presentDays,
        summary.absenceDays,
        weeklyOvertimeHoursBillable,
        grossSalary,
        deductions,
        salaryAdvance,
        0,
        netSalary
      ]
    );

    if (applyAdvanceRepayments) {
      for (const repayment of pendingRepaymentRows) {
        await markRepaymentDeducted(
          companyId,
          repayment.loan_id,
          endYear,
          endMonth,
          Number(repayment.repayment_amount || 0),
          { client }
        );
      }
    }

    await client.query('COMMIT');

    return {
      summary,
      payroll: insertResult.rows[0],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function generateWeeklyPayrollForAllActive(companyId, weekStartDateStr, payrollOptions = {}) {
  const {
    allowedBranchIds = null,
    ...rest
  } = payrollOptions || {};

  const weekStart = String(weekStartDateStr).slice(0, 10);
  const client = await pool.connect();
  let employeeIds = [];
  try {
    if (allowedBranchIds != null && allowedBranchIds.length === 0) {
      employeeIds = [];
    } else if (allowedBranchIds != null) {
      const result = await client.query(
        `SELECT id
         FROM employees
         WHERE company_id = $1
           AND status = 'active'
           AND payroll_frequency = 'weekly'
           AND branch_id = ANY($2::bigint[])
         ORDER BY id`,
        [companyId, allowedBranchIds]
      );
      employeeIds = result.rows.map((r) => r.id);
    } else {
      const result = await client.query(
        `SELECT id
         FROM employees
         WHERE company_id = $1
           AND status = 'active'
           AND payroll_frequency = 'weekly'
         ORDER BY id`,
        [companyId]
      );
      employeeIds = result.rows.map((r) => r.id);
    }
  } finally {
    client.release();
  }

  const results = [];
  const errors = [];
  const options = { ...rest, allowedBranchIds };
  for (const employeeId of employeeIds) {
    try {
      const result = await generateWeeklyPayroll(companyId, employeeId, weekStart, options);
      results.push({ employee_id: employeeId, payroll_id: result.payroll?.id });
    } catch (err) {
      errors.push({ employee_id: employeeId, message: err.message || 'Failed to generate weekly payroll' });
    }
  }

  return {
    generated: results.length,
    failed: errors.length,
    results,
    errors,
  };
}

/**
 * List weekly payroll records (Sun–Sat) with optional filters + pagination.
 */
async function listWeeklyPayrollRecords(
  companyId,
  {
    week_start_date: weekStartDate,
    page = 1,
    limit = 20,
    employee_id: employeeId,
    allowedBranchIds = null,
  } = {}
) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  if (allowedBranchIds != null && allowedBranchIds.length === 0) {
    return { data: [], page: pageNum, limit: limitNum, total: 0 };
  }

  const conditions = ['w.company_id = $1'];
  const params = [companyId];
  let paramIndex = 2;

  if (weekStartDate != null && weekStartDate !== '') {
    conditions.push(`w.week_start_date = $${paramIndex}`);
    params.push(String(weekStartDate).slice(0, 10));
    paramIndex += 1;
  }

  if (employeeId != null && employeeId !== '') {
    conditions.push(`w.employee_id = $${paramIndex}`);
    params.push(Number(employeeId));
    paramIndex += 1;
  }

  if (allowedBranchIds != null) {
    conditions.push(`e.branch_id = ANY($${paramIndex}::bigint[])`);
    params.push(allowedBranchIds);
    paramIndex += 1;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total
     FROM weekly_payroll_records w
     INNER JOIN employees e ON e.id = w.employee_id AND e.company_id = w.company_id
     WHERE ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const listResult = await pool.query(
    `SELECT
       w.id,
       w.company_id,
       w.employee_id,
       w.week_start_date,
       w.week_end_date,
       w.total_days,
       w.present_days,
       w.absence_days,
       w.overtime_hours,
       w.gross_salary,
       w.deductions,
       w.salary_advance,
       w.no_leave_incentive,
       w.net_salary,
       w.generated_at,
       e.name AS employee_name,
       e.employee_code AS employee_code
     FROM weekly_payroll_records w
     INNER JOIN employees e ON e.id = w.employee_id AND e.company_id = w.company_id
     WHERE ${whereClause}
     ORDER BY w.week_start_date DESC, e.name ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limitNum, offset]
  );

  return {
    data: listResult.rows,
    page: pageNum,
    limit: limitNum,
    total,
  };
}

/**
 * Get weekly payroll breakdown for one employee for one week.
 * Used by weekly breakdown modal (no DB writes).
 */
async function getWeeklyPayrollBreakdown(
  companyId,
  employeeId,
  weekStartDateStr,
  options = {}
) {
  const {
    includeOvertime = true,
    treatHolidayAdjacentAbsenceAsWorking = false,
    allowedBranchIds = null,
  } = options;

  await assertEmployeePayrollScope(companyId, employeeId, allowedBranchIds);

  const weekStart = String(weekStartDateStr).slice(0, 10);
  const weekEnd = getWeekEndDate(weekStart);
  const { y: startYear, m: startMonth } = parseYmd(weekStart);
  const { y: endYear, m: endMonth } = parseYmd(weekEnd);

  const weekPayrollRowResult = await pool.query(
    `SELECT *
     FROM weekly_payroll_records
     WHERE company_id = $1 AND employee_id = $2 AND week_start_date = $3`,
    [companyId, employeeId, weekStart]
  );
  if (weekPayrollRowResult.rowCount === 0) {
    throw new AppError('Weekly payroll record not found', 404);
  }
  const weekPayrollRow = weekPayrollRowResult.rows[0];

  const todayStr = todayIstYmd();
  const isCurrentWeek = todayStr >= weekStart && todayStr <= weekEnd;
  const asOfDate = isCurrentWeek ? todayStr : null;
  const isWeekComplete = !isCurrentWeek || todayStr >= weekEnd;

  const employeeResult = await pool.query(
    `SELECT id, name, employee_code, basic_salary, status, daily_travel_allowance, esi_amount, pf_amount, salary_type
     FROM employees
     WHERE company_id = $1 AND id = $2`,
    [companyId, employeeId]
  );
  if (employeeResult.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }
  const employee = employeeResult.rows[0];

  const shiftSummary = await getAttendanceSummaryForRange(companyId, employeeId, weekStart, weekEnd, {
    treatHolidayAdjacentAbsenceAsWorking,
    asOfDate,
    disablePaidLeave: true,
    holidayCountAsPresent: true,
  });

  const daysInStartMonth = getDaysInMonth(startYear, startMonth);
  const basicSalary = Number(employee.basic_salary || 0);
  const salaryType = String(employee.salary_type || 'monthly').toLowerCase();
  const dailyRate =
    salaryType === 'per_day'
      ? basicSalary
      : daysInStartMonth > 0
        ? basicSalary / daysInStartMonth
        : 0;
  const hourlyRate = dailyRate / 8;

  const shiftClient = await pool.connect();
  let shiftConfig;
  try {
    shiftConfig = await getShiftForEmployee(shiftClient, companyId, employeeId);
  } finally {
    shiftClient.release();
  }
  const shiftHoursForRate =
    shiftSummary.attendanceMode === 'hours_based'
      ? Number(shiftSummary.requiredHoursPerDay || 8)
      : Number(shiftConfig.shiftMs || 0) / (60 * 60 * 1000);

  const effectiveOvertimeRate =
    shiftConfig.overtimeRateMode === 'auto'
      ? shiftHoursForRate > 0
        ? dailyRate / shiftHoursForRate
        : 0
      : Number(shiftConfig.overtimeRatePerHour || 0);

  const overtimePay =
    includeOvertime && shiftConfig.allowOvertime
      ? shiftSummary.overtimeHours * effectiveOvertimeRate
      : 0;
  const weeklyOvertimeHoursBillable = shiftConfig.allowOvertime
    ? Number(shiftSummary.overtimeHours || 0)
    : 0;
  const travelAllowance =
    Number(employee.daily_travel_allowance || 0) * (shiftSummary.presentWorkingDays ?? 0);

  const earnedBasic =
    salaryType === 'per_day'
      ? dailyRate * (shiftSummary.presentWorkingDays ?? 0)
      : dailyRate * (shiftSummary.presentDays ?? 0);

  let absenceDeduction = 0;
  if (salaryType !== 'per_day' && shiftSummary.attendanceMode === 'hours_based') {
    absenceDeduction = dailyRate * (shiftSummary.absenceDays || 0);
  }

  let lateDeduction = 0;
  if (
    (shiftSummary.lateDays || 0) > 0 &&
    shiftSummary.lateDeductionMinutes > 0 &&
    shiftSummary.lateDeductionAmount > 0
  ) {
    lateDeduction = shiftSummary.lateDays * shiftSummary.lateDeductionAmount;
  }

  let lunchOverDeduction = 0;
  if (
    (shiftSummary.lunchOverDays || 0) > 0 &&
    shiftSummary.lunchOverDeductionMinutes > 0 &&
    shiftSummary.lunchOverDeductionAmount > 0
  ) {
    lunchOverDeduction = shiftSummary.lunchOverDays * shiftSummary.lunchOverDeductionAmount;
  }

  const monthLastDay = getDaysInMonth(endYear, endMonth);
  const monthLastDayStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(monthLastDay).padStart(2, '0')}`;
  const shouldDeductEsi = weekEnd === monthLastDayStr;
  const esiDeduction = shouldDeductEsi ? Number(employee.esi_amount || 0) : 0;
  const pfDeduction = shouldDeductEsi ? Number(employee.pf_amount || 0) : 0;

  const grossSalary = earnedBasic + overtimePay + travelAllowance;
  const totalDeductions = absenceDeduction + lateDeduction + lunchOverDeduction + esiDeduction + pfDeduction;

  // Weekly payroll records currently don't store permission allocation/offset fields,
  // so for payslip breakdown we show permission offset as zero.
  // (Monthly breakdown uses the permission offset calculation.)
  const permissionHoursAllocated = 0;
  const permissionMinutesUsed = 0;
  const permissionOffsetAmount = 0;

  const pendingAdvanceBalanceResult = await pool.query(
    `SELECT COALESCE(SUM(outstanding_balance), 0) AS balance
     FROM employee_advance_loans
     WHERE company_id = $1
       AND employee_id = $2
       AND status IN ('active', 'on_hold')`,
    [companyId, employeeId]
  );
  const pendingAdvanceBalance = Number(pendingAdvanceBalanceResult.rows[0]?.balance || 0);

  const salaryAdvance = Number(weekPayrollRow.salary_advance || 0);
  const netSalary = Number(weekPayrollRow.net_salary || 0);

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      employee_code: employee.employee_code,
      basic_salary: basicSalary,
    },
    period: { week_start_date: weekStart, week_end_date: weekEnd },
    attendance: {
      workingDaysUpToDate: shiftSummary.workingDaysUpToDate,
      workingDays: shiftSummary.workingDays,
      daysInRange: shiftSummary.daysInRange,
      presentDays: shiftSummary.presentDays,
      presentWorkingDays: shiftSummary.presentWorkingDays,
      absenceDays: shiftSummary.absenceDays,
      overtimeHours: weeklyOvertimeHoursBillable,
      overtimeHoursRaw: Number(shiftSummary.overtimeHours || 0),
      allowOvertime: Boolean(shiftConfig.allowOvertime),
      lateMinutes: shiftSummary.lateMinutes,
      lunchOverMinutes: shiftSummary.lunchOverMinutes,
      lateDays: shiftSummary.lateDays,
      lunchOverDays: shiftSummary.lunchOverDays,
      halfDayDays: shiftSummary.halfDayDays,
      attendanceMode: shiftSummary.attendanceMode,
      requiredHoursPerDay: shiftSummary.requiredHoursPerDay,
      dayDetails: shiftSummary.dayDetails,
    },
    breakdown: {
      isWeekComplete,
      basicSalary: earnedBasic,
      overtimePay,
      overtimeRatePerHour: effectiveOvertimeRate,
      allowOvertime: Boolean(shiftConfig.allowOvertime),
      travelAllowance,
      noLeaveIncentive: 0,
      presentWorkingDays: shiftSummary.presentWorkingDays,
      grossSalary,
      absenceDeduction,
      lateDeduction,
      lunchOverDeduction,
      esiDeduction,
      pfDeduction,
      permissionHoursAllocated,
      permissionMinutesUsed,
      permissionOffsetAmount,
      totalDeductions,
      salaryAdvance,
      pendingAdvanceBalance,
      netSalary,
    },
    advance_repayments: [],
  };
}

/**
 * Parse request fields (aliases) into service-friendly flags.
 */

/**
 * @param {Object} [payrollOptions]
 * @param {boolean} [payrollOptions.includeOvertime=true] - If false, overtime is not added to gross.
 * @param {boolean} [payrollOptions.treatHolidayAdjacentAbsenceAsWorking=false] - If true, holidays adjacent to an absent day count as working (extra absence).
 */
async function generateMonthlyPayroll(companyId, employeeId, year, month, payrollOptions = {}) {
  const {
    includeOvertime = true,
    treatHolidayAdjacentAbsenceAsWorking = false,
    apply_advance_repayments: applyAdvanceRepaymentsRaw = true,
    noLeaveIncentive = 0,
    encashUnusedPaidLeave = false,
    allowedBranchIds = null,
  } = payrollOptions;
  const applyAdvanceRepayments = applyAdvanceRepaymentsRaw !== false;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const employeeResult = await client.query(
      `SELECT id, basic_salary, status, join_date, daily_travel_allowance, esi_amount, pf_amount, payroll_frequency, salary_type, permission_hours_override
       FROM employees
       WHERE company_id = $1 AND id = $2`,
      [companyId, employeeId]
    );

    if (employeeResult.rowCount === 0) {
      throw new AppError('Employee not found for this company', 404);
    }

    const employee = employeeResult.rows[0];

    await assertEmployeePayrollScope(companyId, employeeId, allowedBranchIds);

    if (employee.status !== 'active') {
      throw new AppError('Cannot generate payroll for inactive employee', 400);
    }

    if (String(employee.payroll_frequency || 'monthly').toLowerCase() !== 'monthly') {
      throw new AppError('This employee is configured for weekly payroll', 400);
    }

    const todayStr = todayIstYmd();
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const isCurrentMonth = year === ty && month === tm;
    const asOfDate = isCurrentMonth ? todayStr : null;
    const summary = await getAttendanceSummary(companyId, employeeId, year, month, {
      treatHolidayAdjacentAbsenceAsWorking,
      asOfDate,
    });
    const shiftConfig = await getShiftForEmployee(client, companyId, employeeId);

    const basicSalary = Number(employee.basic_salary || 0);
    const daysInMonth = summary.daysInMonth || 30;
    const salaryType = String(employee.salary_type || 'monthly').toLowerCase();
    const dailyRate =
      salaryType === 'per_day'
        ? basicSalary
        : daysInMonth > 0
          ? basicSalary / daysInMonth
          : 0;

    // Money conversions from "hours" should use the shift's configured duration:
    // - day_based / shift_based: use configured shift duration (start_time -> end_time)
    // - hours_based: use required_hours_per_day
    const shiftHoursForHourlyConversion =
      summary.attendanceMode === 'hours_based'
        ? Number(summary.requiredHoursPerDay || 8)
        : Number(shiftConfig.shiftMs || 0) / (60 * 60 * 1000);
    const hourlyRate =
      shiftHoursForHourlyConversion > 0 ? dailyRate / shiftHoursForHourlyConversion : dailyRate / 8;
    const workDayHoursForPermission =
      shiftHoursForHourlyConversion > 0 ? shiftHoursForHourlyConversion : 8;

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const isMonthComplete = !isCurrentMonth || td >= lastDayOfMonth;

    const allowOvertime = Boolean(shiftConfig.allowOvertime);
    const overtimeHoursBillable = allowOvertime ? Number(summary.overtimeHours || 0) : 0;
    const overtimePay =
      includeOvertime && allowOvertime ? Number(summary.overtimeHours || 0) * hourlyRate : 0;
    const presentWorkingDays = summary.presentWorkingDays ?? 0;
    const dailyTravelAllowance = Number(employee.daily_travel_allowance || 0);
    const travelAllowance = dailyTravelAllowance * presentWorkingDays;

    const paidLeaveDaysAllowed = Number(summary.paidLeaveDaysAllowed || 0);
    const paidLeaveUsed = Number(summary.paidLeaveUsed || 0);
    const { unusedPaidLeaveDays, paidLeaveEncashmentAmount } =
      computePaidLeaveEncashment({
        enabled: encashUnusedPaidLeave,
        isMonthComplete,
        paidLeaveDaysAllowed,
        paidLeaveUsed,
        dailyRate,
      });

    let earnedBasic = 0;
    let absenceDeduction = 0;
    if (salaryType === 'per_day') {
      if (isMonthComplete) {
        earnedBasic = dailyRate * Number(summary.workingDaysInMonth || summary.workingDays || 0);
        absenceDeduction = dailyRate * Number(summary.absenceDays || 0);
      } else {
        // Pay only for present working days up to `asOfDate`.
        earnedBasic = dailyRate * Number(summary.presentWorkingDays || 0);
        absenceDeduction = 0;
      }
    } else {
      const computed = computeMonthlyBaseAndAbsence({
        isMonthComplete,
        attendanceMode: summary.attendanceMode,
        basicSalary,
        dailyRate,
        presentDays: summary.presentDays,
        paidLeaveDaysAllowed,
        paidLeaveUsed: Number(summary.paidLeaveUsed || 0),
        absenceDays: summary.absenceDays,
      });
      earnedBasic = computed.earnedBasic;
      absenceDeduction = computed.absenceDeduction;
    }

    let lateDeduction = 0;
    if (
      (summary.lateDays || 0) > 0 &&
      summary.lateDeductionMinutes > 0 &&
      summary.lateDeductionAmount > 0
    ) {
      // Fixed amount per late day: e.g. late 5 days → 5 × amount
      lateDeduction = summary.lateDays * summary.lateDeductionAmount;
    }

    let lunchOverDeduction = 0;
    if (
      (summary.lunchOverDays || 0) > 0 &&
      summary.lunchOverDeductionMinutes > 0 &&
      summary.lunchOverDeductionAmount > 0
    ) {
      // Fixed amount per day they went over lunch: e.g. 3 days over → 3 × amount
      lunchOverDeduction = summary.lunchOverDays * summary.lunchOverDeductionAmount;
    }

    const grossSalary = earnedBasic + overtimePay + travelAllowance + paidLeaveEncashmentAmount;
    const esiDeduction = Number(employee.esi_amount || 0);
    const pfDeduction = Number(employee.pf_amount || 0);
    const deductionsBeforePermission = absenceDeduction + lateDeduction + lunchOverDeduction + esiDeduction + pfDeduction;
    const effectivePermissionHours =
      employee.permission_hours_override != null
        ? Number(employee.permission_hours_override || 0)
        : Number(shiftConfig.monthlyPermissionHours || 0);
    const permissionOffset = computePermissionOffset({
      allocatedHours: effectivePermissionHours,
      lateMinutes: summary.lateMinutes,
      absenceDays: summary.absenceDays,
      hourlyRate,
      deductionsBeforeOffset: deductionsBeforePermission,
      workDayHoursForPermission,
    });
    const deductions = deductionsBeforePermission - permissionOffset.offsetAmount;
    const oldSalaryAdvance = await getAdvanceForEmployeeMonth(companyId, employeeId, year, month);
    const repaymentRowsResult = applyAdvanceRepayments
      ? await client.query(
          `SELECT
             r.id,
             r.loan_id,
             r.repayment_amount,
             r.status
           FROM employee_advance_repayments r
           INNER JOIN employee_advance_loans l
             ON l.id = r.loan_id
            AND l.company_id = r.company_id
           WHERE r.company_id = $1
             AND r.employee_id = $2
             AND r.year = $3
             AND r.month = $4
             AND r.status IN ('pending', 'deducted')
             AND l.status IN ('active', 'on_hold', 'cleared')
           ORDER BY r.id ASC`,
          [companyId, employeeId, year, month]
        )
      : { rows: [] };
    const repaymentRows = repaymentRowsResult.rows;
    const pendingRepaymentRows = repaymentRows.filter((row) => row.status === 'pending');
    const monthRepaymentAdvance = repaymentRows.reduce((sum, row) => sum + Number(row.repayment_amount || 0), 0);
    const salaryAdvance = oldSalaryAdvance + monthRepaymentAdvance;
    const shiftIncentive = Number(summary.noLeaveIncentiveFromShift || 0);
    const globalIncentive = Number(noLeaveIncentive) || 0;
    const effectiveNoLeaveIncentive = shiftIncentive > 0 ? shiftIncentive : globalIncentive;
    const noLeaveIncentiveAmount =
      effectiveNoLeaveIncentive > 0 &&
      isMonthComplete &&
      Number(summary.rawAbsenceDays || 0) <= paidLeaveDaysAllowed
        ? effectiveNoLeaveIncentive
        : 0;
    const netSalary = grossSalary - deductions - salaryAdvance + noLeaveIncentiveAmount;

    const result = await client.query(
      `INSERT INTO payroll_records (
          company_id,
          employee_id,
          month,
          year,
          total_days,
          present_days,
          absence_days,
          overtime_hours,
          gross_salary,
          deductions,
          salary_advance,
          no_leave_incentive,
          treat_holiday_adjacent_absence_as_working,
          permission_hours_allocated,
          permission_minutes_used,
          permission_offset_amount,
          unused_paid_leave_days,
          paid_leave_encashment_amount,
          net_salary
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT (company_id, employee_id, year, month)
       DO UPDATE SET
          total_days = EXCLUDED.total_days,
          present_days = EXCLUDED.present_days,
          absence_days = EXCLUDED.absence_days,
          overtime_hours = EXCLUDED.overtime_hours,
          gross_salary = EXCLUDED.gross_salary,
          deductions = EXCLUDED.deductions,
          salary_advance = EXCLUDED.salary_advance,
          no_leave_incentive = EXCLUDED.no_leave_incentive,
          treat_holiday_adjacent_absence_as_working = EXCLUDED.treat_holiday_adjacent_absence_as_working,
          permission_hours_allocated = EXCLUDED.permission_hours_allocated,
          permission_minutes_used = EXCLUDED.permission_minutes_used,
          permission_offset_amount = EXCLUDED.permission_offset_amount,
          unused_paid_leave_days = EXCLUDED.unused_paid_leave_days,
          paid_leave_encashment_amount = EXCLUDED.paid_leave_encashment_amount,
          net_salary = EXCLUDED.net_salary,
          generated_at = NOW()
       RETURNING *`,
      [
        companyId,
        employeeId,
        month,
        year,
        summary.daysInMonth,
        summary.presentDays,
        summary.absenceDays,
        overtimeHoursBillable,
        grossSalary,
        deductions,
        salaryAdvance,
        noLeaveIncentiveAmount,
        treatHolidayAdjacentAbsenceAsWorking,
        permissionOffset.allocatedHours,
        permissionOffset.usedMinutes,
        permissionOffset.offsetAmount,
        unusedPaidLeaveDays,
        paidLeaveEncashmentAmount,
        netSalary,
      ]
    );

    if (applyAdvanceRepayments) {
      for (const repayment of pendingRepaymentRows) {
        await markRepaymentDeducted(
          companyId,
          repayment.loan_id,
          year,
          month,
          Number(repayment.repayment_amount || 0),
          { client }
        );
      }
    }

    await client.query('COMMIT');

    return {
      summary,
      payroll: result.rows[0],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get full payroll breakdown for one employee for a month (no DB write).
 * Used for detail modal. Returns attendance summary and salary breakdown.
 */
async function getPayrollBreakdown(companyId, employeeId, year, month, options = {}) {
  const {
    includeOvertime = true,
    treatHolidayAdjacentAbsenceAsWorking = false,
    encashUnusedPaidLeave = false,
    allowedBranchIds = null,
  } = options;

  await assertEmployeePayrollScope(companyId, employeeId, allowedBranchIds);

  const existingPayrollResult = await pool.query(
    `SELECT
       treat_holiday_adjacent_absence_as_working,
       salary_advance,
       no_leave_incentive,
       permission_hours_allocated,
       permission_minutes_used,
       permission_offset_amount,
       unused_paid_leave_days,
       paid_leave_encashment_amount
     FROM payroll_records
     WHERE company_id = $1 AND employee_id = $2 AND year = $3 AND month = $4`,
    [companyId, employeeId, year, month]
  );
  const persistedTreatHoliday =
    existingPayrollResult.rowCount > 0
      ? Boolean(existingPayrollResult.rows[0].treat_holiday_adjacent_absence_as_working)
      : false;
  const effectiveTreatHolidayAdjacentAbsenceAsWorking =
    options.treatHolidayAdjacentAbsenceAsWorking === true || persistedTreatHoliday;

  const todayStr = todayIstYmd();
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const isCurrentMonth = year === ty && month === tm;
  const asOfDate = isCurrentMonth ? todayStr : null;

  const employeeResult = await pool.query(
    `SELECT id, name, employee_code, basic_salary, status, daily_travel_allowance, esi_amount, pf_amount, shift_id, salary_type, permission_hours_override
     FROM employees
     WHERE company_id = $1 AND id = $2`,
    [companyId, employeeId]
  );

  if (employeeResult.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }

  const employee = employeeResult.rows[0];
  const shiftPermissionResult = await pool.query(
    `SELECT monthly_permission_hours
     FROM shifts
     WHERE company_id = $1 AND id = $2`,
    [companyId, employee.shift_id]
  );
  const shiftPermissionHours =
    shiftPermissionResult.rowCount > 0
      ? Number(shiftPermissionResult.rows[0].monthly_permission_hours || 0)
      : 0;
  const effectivePermissionHours =
    employee.permission_hours_override != null
      ? Number(employee.permission_hours_override || 0)
      : shiftPermissionHours;
  const summary = await getAttendanceSummary(companyId, employeeId, year, month, {
    treatHolidayAdjacentAbsenceAsWorking: effectiveTreatHolidayAdjacentAbsenceAsWorking,
    asOfDate,
  });

  const shiftConfig = await getShiftForEmployee(pool, companyId, employeeId);

  const basicSalary = Number(employee.basic_salary || 0);
  const daysInMonth = summary.daysInMonth || 30;
  const salaryType = String(employee.salary_type || 'monthly').toLowerCase();
  const dailyRate =
    salaryType === 'per_day'
      ? basicSalary
      : daysInMonth > 0
        ? basicSalary / daysInMonth
        : 0;

  // Money conversions from "hours" should use the shift's configured duration:
  // - day_based / shift_based: configured shift duration
  // - hours_based: required_hours_per_day
  const shiftHoursForHourlyConversion =
    summary.attendanceMode === 'hours_based'
      ? Number(summary.requiredHoursPerDay || 8)
      : Number(shiftConfig.shiftMs || 0) / (60 * 60 * 1000);
  const hourlyRate =
    shiftHoursForHourlyConversion > 0
      ? dailyRate / shiftHoursForHourlyConversion
      : dailyRate / 8;
  const workDayHoursForPermission =
    shiftHoursForHourlyConversion > 0 ? shiftHoursForHourlyConversion : 8;

  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const isMonthComplete = !isCurrentMonth || td >= lastDayOfMonth;

  const allowOvertime = Boolean(shiftConfig.allowOvertime);
  const overtimeHoursBillable = allowOvertime ? Number(summary.overtimeHours || 0) : 0;
  const overtimePay =
    includeOvertime && allowOvertime ? Number(summary.overtimeHours || 0) * hourlyRate : 0;
  const presentWorkingDays = summary.presentWorkingDays ?? 0;
  const dailyTravelAllowance = Number(employee.daily_travel_allowance || 0);
  const travelAllowance = dailyTravelAllowance * presentWorkingDays;

  const paidLeaveDaysAllowed = Number(summary.paidLeaveDaysAllowed || 0);
  const paidLeaveUsed = Number(summary.paidLeaveUsed || 0);
  const { unusedPaidLeaveDays: unusedPaidLeaveDaysComputed, paidLeaveEncashmentAmount: paidLeaveEncashmentComputed } =
    computePaidLeaveEncashment({
      enabled: encashUnusedPaidLeave,
      isMonthComplete,
      paidLeaveDaysAllowed,
      paidLeaveUsed,
      dailyRate,
    });

  let earnedBasic = 0;
  let absenceDeduction = 0;
  if (salaryType === 'per_day') {
    if (isMonthComplete) {
      earnedBasic = dailyRate * Number(summary.workingDaysInMonth || summary.workingDays || 0);
      absenceDeduction = dailyRate * Number(summary.absenceDays || 0);
    } else {
      earnedBasic = dailyRate * Number(summary.presentWorkingDays || 0);
      absenceDeduction = 0;
    }
  } else {
    const computed = computeMonthlyBaseAndAbsence({
      isMonthComplete,
      attendanceMode: summary.attendanceMode,
      basicSalary,
      dailyRate,
      presentDays: summary.presentDays,
      paidLeaveDaysAllowed,
      paidLeaveUsed: Number(summary.paidLeaveUsed || 0),
      absenceDays: summary.absenceDays,
    });
    earnedBasic = computed.earnedBasic;
    absenceDeduction = computed.absenceDeduction;
  }

  let lateDeduction = 0;
  if (
    (summary.lateDays || 0) > 0 &&
    summary.lateDeductionMinutes > 0 &&
    summary.lateDeductionAmount > 0
  ) {
    // Fixed amount per late day: e.g. late 5 days → 5 × amount
    lateDeduction = summary.lateDays * summary.lateDeductionAmount;
  }

  let lunchOverDeduction = 0;
  if (
    (summary.lunchOverDays || 0) > 0 &&
    summary.lunchOverDeductionMinutes > 0 &&
    summary.lunchOverDeductionAmount > 0
  ) {
    // Fixed amount per day they went over lunch: e.g. 3 days over → 3 × amount
    lunchOverDeduction = summary.lunchOverDays * summary.lunchOverDeductionAmount;
  }

  const grossSalaryComputed = earnedBasic + overtimePay + travelAllowance + paidLeaveEncashmentComputed;
  const esiDeduction = Number(employee.esi_amount || 0);
  const pfDeduction = Number(employee.pf_amount || 0);
  const deductionsBeforePermission = absenceDeduction + lateDeduction + lunchOverDeduction + esiDeduction + pfDeduction;
  const permissionOffsetComputed = computePermissionOffset({
    allocatedHours: effectivePermissionHours,
    lateMinutes: summary.lateMinutes,
    absenceDays: summary.absenceDays,
    hourlyRate,
    deductionsBeforeOffset: deductionsBeforePermission,
    workDayHoursForPermission,
  });
  const permissionHoursAllocated =
    existingPayrollResult.rowCount > 0
      ? Number(existingPayrollResult.rows[0].permission_hours_allocated || 0)
      : permissionOffsetComputed.allocatedHours;
  const permissionMinutesUsed =
    existingPayrollResult.rowCount > 0
      ? Number(existingPayrollResult.rows[0].permission_minutes_used || 0)
      : permissionOffsetComputed.usedMinutes;
  const permissionOffsetAmount =
    existingPayrollResult.rowCount > 0
      ? Number(existingPayrollResult.rows[0].permission_offset_amount || 0)
      : permissionOffsetComputed.offsetAmount;
  const unusedPaidLeaveDays =
    existingPayrollResult.rowCount > 0
      ? Number(existingPayrollResult.rows[0].unused_paid_leave_days || 0)
      : unusedPaidLeaveDaysComputed;
  const paidLeaveEncashmentAmount =
    existingPayrollResult.rowCount > 0
      ? Number(existingPayrollResult.rows[0].paid_leave_encashment_amount || 0)
      : paidLeaveEncashmentComputed;
  const grossSalary =
    existingPayrollResult.rowCount > 0
      ? grossSalaryComputed - paidLeaveEncashmentComputed + paidLeaveEncashmentAmount
      : grossSalaryComputed;
  const totalDeductions = deductionsBeforePermission - permissionOffsetAmount;
  const oldSalaryAdvance = await getAdvanceForEmployeeMonth(companyId, employeeId, year, month);
  const advanceRepaymentsResult = await pool.query(
    `SELECT
       r.loan_id,
       r.repayment_amount AS this_month_deduction,
       l.loan_amount AS original_loan_amount,
       l.loan_date,
       l.total_repaid AS total_repaid_so_far,
       GREATEST(ROUND((l.outstanding_balance - r.repayment_amount)::numeric, 2), 0) AS outstanding_balance_after
     FROM employee_advance_repayments r
     INNER JOIN employee_advance_loans l ON l.id = r.loan_id AND l.company_id = r.company_id
     WHERE r.company_id = $1
       AND r.employee_id = $2
       AND r.year = $3
       AND r.month = $4
       AND r.status IN ('pending', 'deducted')
     ORDER BY r.loan_id ASC`,
    [companyId, employeeId, year, month]
  );
  const advanceRepayments = advanceRepaymentsResult.rows.map((row) => ({
    loan_id: row.loan_id,
    original_loan_amount: Number(row.original_loan_amount || 0),
    loan_date: row.loan_date,
    this_month_deduction: Number(row.this_month_deduction || 0),
    total_repaid_so_far: Number(row.total_repaid_so_far || 0),
    outstanding_balance_after: Number(row.outstanding_balance_after || 0),
  }));
  const newSalaryAdvance = advanceRepayments.reduce((sum, row) => sum + Number(row.this_month_deduction || 0), 0);
  const computedSalaryAdvance = oldSalaryAdvance + newSalaryAdvance;
  const salaryAdvance =
    existingPayrollResult.rowCount > 0
      ? Number(existingPayrollResult.rows[0].salary_advance || 0)
      : computedSalaryAdvance;
  const noLeaveIncentive =
    existingPayrollResult.rowCount > 0
      ? Number(existingPayrollResult.rows[0].no_leave_incentive || 0)
      : 0;
  const pendingAdvanceBalanceResult = await pool.query(
    `SELECT COALESCE(SUM(outstanding_balance), 0) AS balance
     FROM employee_advance_loans
     WHERE company_id = $1
       AND employee_id = $2
       AND status IN ('active', 'on_hold')`,
    [companyId, employeeId]
  );
  const pendingAdvanceBalance = Number(pendingAdvanceBalanceResult.rows[0]?.balance || 0);
  const netSalary = grossSalary - totalDeductions - salaryAdvance + noLeaveIncentive;

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      employee_code: employee.employee_code,
      basic_salary: basicSalary,
    },
    period: { year, month },
    attendance: {
      workingDaysUpToDate: summary.workingDaysUpToDate,
      workingDays: summary.workingDays,
      daysInMonth: summary.daysInMonth,
      presentDays: summary.presentDays,
      presentWorkingDays: summary.presentWorkingDays,
      absenceDays: summary.absenceDays,
      overtimeHours: overtimeHoursBillable,
      overtimeHoursRaw: Number(summary.overtimeHours || 0),
      allowOvertime,
      lateMinutes: summary.lateMinutes,
      lunchOverMinutes: summary.lunchOverMinutes,
      lateDays: summary.lateDays,
      lunchOverDays: summary.lunchOverDays,
      halfDayDays: summary.halfDayDays,
      attendanceMode: summary.attendanceMode,
      requiredHoursPerDay: summary.requiredHoursPerDay,
      treatHolidayAdjacentAbsenceAsWorking: effectiveTreatHolidayAdjacentAbsenceAsWorking,
      dayDetails: summary.dayDetails,
    },
    breakdown: {
      isMonthComplete,
      basicSalary: earnedBasic,
      overtimePay,
      allowOvertime,
      travelAllowance,
      unusedPaidLeaveDays,
      paidLeaveEncashmentAmount,
      presentWorkingDays: summary.presentWorkingDays,
      grossSalary,
      absenceDeduction,
      lateDeduction,
      lunchOverDeduction,
      esiDeduction,
      pfDeduction,
      permissionHoursAllocated,
      permissionMinutesUsed,
      permissionOffsetAmount,
      totalDeductions,
      salaryAdvance,
      noLeaveIncentive,
      pendingAdvanceBalance,
      netSalary,
    },
    advance_repayments: advanceRepayments,
  };
}

/**
 * List payroll records with optional filters and pagination.
 * @returns { Promise<{ data: Array, page: number, limit: number, total: number }> }
 */
async function listPayrollRecords(
  companyId,
  { year, month, page = 1, limit = 20, employee_id: employeeId, allowedBranchIds = null } = {}
) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  if (allowedBranchIds != null && allowedBranchIds.length === 0) {
    return {
      data: [],
      page: pageNum,
      limit: limitNum,
      total: 0,
    };
  }

  const conditions = ['p.company_id = $1'];
  const params = [companyId];
  let paramIndex = 2;

  if (year != null && year !== '') {
    conditions.push(`p.year = $${paramIndex}`);
    params.push(Number(year));
    paramIndex += 1;
  }
  if (month != null && month !== '') {
    conditions.push(`p.month = $${paramIndex}`);
    params.push(Number(month));
    paramIndex += 1;
  }
  if (employeeId != null && employeeId !== '') {
    conditions.push(`p.employee_id = $${paramIndex}`);
    params.push(Number(employeeId));
    paramIndex += 1;
  }
  if (allowedBranchIds != null) {
    conditions.push(`e.branch_id = ANY($${paramIndex}::bigint[])`);
    params.push(allowedBranchIds);
    paramIndex += 1;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total
     FROM payroll_records p
     WHERE ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const listResult = await pool.query(
    `SELECT
        p.id,
        p.company_id,
        p.employee_id,
        p.year,
        p.month,
        p.total_days,
        p.present_days,
        p.absence_days,
        p.permission_hours_allocated,
        p.permission_minutes_used,
        p.permission_offset_amount,
        p.overtime_hours,
        p.gross_salary,
        p.deductions,
        p.salary_advance,
        p.no_leave_incentive,
        p.net_salary,
        p.generated_at,
        e.name AS employee_name,
        e.employee_code AS employee_code
     FROM payroll_records p
     INNER JOIN employees e ON e.id = p.employee_id AND e.company_id = p.company_id
     WHERE ${whereClause}
     ORDER BY p.year DESC, p.month DESC, e.name ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limitNum, offset]
  );

  return {
    data: listResult.rows,
    page: pageNum,
    limit: limitNum,
    total,
  };
}

/**
 * Generate payroll for all active employees for a given year/month.
 * @param {Object} [payrollOptions] - Same as generateMonthlyPayroll (includeOvertime, treatHolidayAdjacentAbsenceAsWorking).
 * @returns { Promise<{ generated: number, failed: number, results: Array, errors: Array }> }
 */
async function generateMonthlyPayrollForAllActive(companyId, year, month, payrollOptions = {}) {
  const { noLeaveIncentive = 0, allowedBranchIds = null, ...rest } = payrollOptions;
  const client = await pool.connect();
  let employeeIds = [];
  try {
    if (allowedBranchIds != null && allowedBranchIds.length === 0) {
      employeeIds = [];
    } else if (allowedBranchIds != null) {
      const result = await client.query(
        `SELECT id FROM employees
         WHERE company_id = $1
           AND status = 'active'
           AND payroll_frequency = 'monthly'
           AND branch_id = ANY($2::bigint[])
         ORDER BY id`,
        [companyId, allowedBranchIds]
      );
      employeeIds = result.rows.map((r) => r.id);
    } else {
      const result = await client.query(
        `SELECT id
         FROM employees
         WHERE company_id = $1
           AND status = 'active'
           AND payroll_frequency = 'monthly'
         ORDER BY id`,
        [companyId]
      );
      employeeIds = result.rows.map((r) => r.id);
    }
  } finally {
    client.release();
  }

  const results = [];
  const errors = [];
  const options = { ...rest, noLeaveIncentive, allowedBranchIds };
  for (const employeeId of employeeIds) {
    try {
      const result = await generateMonthlyPayroll(companyId, employeeId, year, month, options);
      results.push({ employee_id: employeeId, payroll_id: result.payroll?.id });
    } catch (err) {
      errors.push({
        employee_id: employeeId,
        message: err.message || 'Failed to generate payroll',
      });
    }
  }

  return {
    generated: results.length,
    failed: errors.length,
    results,
    errors,
  };
}

module.exports = {
  getAttendanceSummary,
  getPayrollBreakdown,
  getAttendanceSummaryForRange,
  getWeeklyPayrollBreakdown,
  generateMonthlyPayroll,
  generateMonthlyPayrollForAllActive,
  generateWeeklyPayroll,
  generateWeeklyPayrollForAllActive,
  listPayrollRecords,
  listWeeklyPayrollRecords,
};

