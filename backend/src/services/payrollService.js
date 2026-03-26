const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { istYmdFromDate, todayIstYmd, SQL_PUNCH_IST_DATE, addDaysIst } = require('../utils/istDate');
const { computeDayStatus, attributedShiftStartDateStr } = require('./attendanceService');
const { getHolidayDatesForMonth } = require('./holidayService');
const { getAdvanceForEmployeeMonth } = require('./advanceService');
const { markRepaymentDeducted } = require('./advanceLoanService');

const COMPANY_TZ = process.env.COMPANY_TIMEZONE || 'Asia/Kolkata';
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
    attendanceMode,
    requiredHoursPerDay,
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
       attendance_mode,
       required_hours_per_day
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
    const result = await client.query(
      `SELECT
         id, start_time, end_time, grace_minutes, lunch_minutes,
         late_deduction_minutes, late_deduction_amount,
         lunch_over_deduction_minutes, lunch_over_deduction_amount,
         no_leave_incentive,
         paid_leave_days,
         attendance_mode,
         required_hours_per_day
       FROM shifts
       WHERE company_id = $1 AND id = $2`,
      [companyId, shiftId]
    );
    if (result.rowCount > 0) {
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

function computeHoursInsideForDay(dayLogs) {
  if (!dayLogs || dayLogs.length === 0) return 0;
  const sorted = [...dayLogs].sort((a, b) => a.punchTime - b.punchTime);
  let totalMinutes = 0;
  let lastIn = null;
  const maxSessionMinutes = 24 * 60;

  for (const log of sorted) {
    if (log.punchType === 'in') {
      lastIn = log.punchTime;
    } else if (log.punchType === 'out' && lastIn) {
      const diffMin = (log.punchTime - lastIn) / (60 * 1000);
      if (diffMin >= 0 && diffMin <= maxSessionMinutes) {
        totalMinutes += diffMin;
      }
      lastIn = null;
    }
  }
  return totalMinutes / 60;
}

async function getAttendanceSummary(companyId, employeeId, year, month, options = {}) {
  const { treatHolidayAdjacentAbsenceAsWorking = false, asOfDate = null } = options;
  const client = await pool.connect();
  try {
    const { daysInMonth } = getMonthBounds(year, month);
    const monthFirstStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthLastStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const shift = await getShiftForEmployee(client, companyId, employeeId);

    const needOvernightRange =
      shift.attendanceMode === 'shift_based' && shift.isOvernightClock;
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
      getHolidayDatesForMonth(companyId, year, month),
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
      if (shift.attendanceMode === 'hours_based') {
        key = istYmdFromDate(punchTime);
      } else if (shift.attendanceMode === 'shift_based' && shift.isOvernightClock) {
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

    const allottedLunchMs = (shift.lunchMinutesAllotted ?? 60) * 60 * 1000;

    // Hours-based mode: compute presence/absence and overtime purely from total hours inside,
    // but still track late arrivals (first punch) using the same late logic.
    if (shift.attendanceMode === 'hours_based') {
      const required = Number(shift.requiredHoursPerDay || 8);
      const dayDetails = [];

      let rawAbsenceDays = 0;
      let overtimeHours = 0;

      for (const [dayKey, dayLogs] of logsByDay.entries()) {
        if (dayKey > lastDateToConsider) {
          continue;
        }
        const isHoliday = holidaySet.has(dayKey);
        if (!dayLogs.length) {
          if (!isHoliday) {
            rawAbsenceDays += 1;
          }
          continue;
        }

        const sorted = [...dayLogs].sort((a, b) => a.punchTime - b.punchTime);
        const hoursInside = computeHoursInsideForDay(sorted);

        let presentFraction = 0;
        let statusLabel = 'absent';

        if (hoursInside >= required) {
          presentFraction = 1;
          statusLabel = 'present';
          overtimeHours += hoursInside - required;
        } else if (hoursInside >= required * 0.5) {
          presentFraction = 0.5;
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
          const [y, mo, d] = dayKey.split('-').map(Number);
          const shiftStartMs = getShiftStartMsForDate(
            y,
            mo,
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
          }
        } else if (!isHoliday) {
          rawAbsenceDays += 1;
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

      // For hours_based, rawAbsenceDays is already tracked per working day (non-holiday).
      const paidLeaveDaysAllowed = Number(shift.paidLeaveDays || 0);
      const paidLeaveUsed = Math.min(paidLeaveDaysAllowed, rawAbsenceDays);
      const absenceDays = Math.max(0, rawAbsenceDays - paidLeaveUsed);

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
        lateDeductionMinutes: shift.lateDeductionMinutes,
        lateDeductionAmount: shift.lateDeductionAmount,
        lunchOverDeductionMinutes: 0,
        lunchOverDeductionAmount: 0,
        noLeaveIncentiveFromShift: shift.noLeaveIncentive,
        paidLeaveDaysAllowed,
        paidLeaveUsed,
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
    const paidLeaveDaysAllowed = Number(shift.paidLeaveDays || 0);
    const paidLeaveUsed = Math.min(paidLeaveDaysAllowed, rawAbsenceDays);
    const absenceDays = Math.max(0, rawAbsenceDays - paidLeaveUsed);

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
      lateDeductionMinutes: shift.lateDeductionMinutes,
      lateDeductionAmount: shift.lateDeductionAmount,
      lunchOverDeductionMinutes: shift.lunchOverDeductionMinutes,
      lunchOverDeductionAmount: shift.lunchOverDeductionAmount,
      noLeaveIncentiveFromShift: shift.noLeaveIncentive,
      paidLeaveDaysAllowed,
      paidLeaveUsed,
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
 * @param {Object} [payrollOptions]
 * @param {boolean} [payrollOptions.includeOvertime=true] - If false, overtime is not added to gross.
 * @param {boolean} [payrollOptions.treatHolidayAdjacentAbsenceAsWorking=false] - If true, holidays adjacent to an absent day count as working (extra absence).
 */
async function generateMonthlyPayroll(companyId, employeeId, year, month, payrollOptions = {}) {
  const { includeOvertime = true, treatHolidayAdjacentAbsenceAsWorking = false, noLeaveIncentive = 0 } = payrollOptions;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const employeeResult = await client.query(
      `SELECT id, basic_salary, status, join_date, daily_travel_allowance, esi_amount
       FROM employees
       WHERE company_id = $1 AND id = $2`,
      [companyId, employeeId]
    );

    if (employeeResult.rowCount === 0) {
      throw new AppError('Employee not found for this company', 404);
    }

    const employee = employeeResult.rows[0];

    if (employee.status !== 'active') {
      throw new AppError('Cannot generate payroll for inactive employee', 400);
    }

    const todayStr = todayIstYmd();
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const isCurrentMonth = year === ty && month === tm;
    const asOfDate = isCurrentMonth ? todayStr : null;
    const summary = await getAttendanceSummary(companyId, employeeId, year, month, {
      treatHolidayAdjacentAbsenceAsWorking,
      asOfDate,
    });

    const basicSalary = Number(employee.basic_salary || 0);
    const daysInMonth = summary.daysInMonth || 30;
    const dailyRate = daysInMonth > 0 ? basicSalary / daysInMonth : 0;
    const hourlyRate = dailyRate / 8;

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const isMonthComplete = !isCurrentMonth || td >= lastDayOfMonth;

    const overtimePay = includeOvertime ? summary.overtimeHours * hourlyRate : 0;
    const presentWorkingDays = summary.presentWorkingDays ?? 0;
    const dailyTravelAllowance = Number(employee.daily_travel_allowance || 0);
    const travelAllowance = dailyTravelAllowance * presentWorkingDays;

    const paidLeaveDaysAllowed = Number(summary.paidLeaveDaysAllowed || 0);

    let earnedBasic;
    let absenceDeduction = 0;
    if (isMonthComplete) {
      // For full months, pay for all worked days plus the shift's paid leave allowance.
      // Example: 30-day month, 27 present, 4 paid leave → salary for 31 days.
      earnedBasic = dailyRate * (summary.presentDays + paidLeaveDaysAllowed);
    } else {
      // For partial months, pay only for days actually worked.
      earnedBasic = dailyRate * summary.presentDays;
    }
    // For hours_based shifts, apply salary deduction based on hours-driven absences.
    if (summary.attendanceMode === 'hours_based') {
      absenceDeduction = dailyRate * (summary.absenceDays || 0);
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

    const grossSalary = earnedBasic + overtimePay + travelAllowance;
    const esiDeduction = Number(employee.esi_amount || 0);
    const deductions = absenceDeduction + lateDeduction + lunchOverDeduction + esiDeduction;
    const oldSalaryAdvance = await getAdvanceForEmployeeMonth(companyId, employeeId, year, month);
    const repaymentRowsResult = await client.query(
      `SELECT
         r.id,
         r.loan_id,
         r.repayment_amount
       FROM employee_advance_repayments r
       INNER JOIN employee_advance_loans l
         ON l.id = r.loan_id
        AND l.company_id = r.company_id
       WHERE r.company_id = $1
         AND r.employee_id = $2
         AND r.year = $3
         AND r.month = $4
         AND r.status = 'pending'
         AND l.status = 'active'
       ORDER BY r.id ASC`,
      [companyId, employeeId, year, month]
    );
    const repaymentRows = repaymentRowsResult.rows;
    const newRepaymentAdvance = repaymentRows.reduce((sum, row) => sum + Number(row.repayment_amount || 0), 0);
    const salaryAdvance = oldSalaryAdvance + newRepaymentAdvance;
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
          overtime_hours,
          gross_salary,
          deductions,
          salary_advance,
          no_leave_incentive,
          net_salary
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (company_id, employee_id, year, month)
       DO UPDATE SET
          total_days = EXCLUDED.total_days,
          present_days = EXCLUDED.present_days,
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
        month,
        year,
        summary.daysInMonth,
        summary.presentDays,
        summary.overtimeHours,
        grossSalary,
        deductions,
        salaryAdvance,
        noLeaveIncentiveAmount,
        netSalary,
      ]
    );

    for (const repayment of repaymentRows) {
      await markRepaymentDeducted(
        companyId,
        repayment.loan_id,
        year,
        month,
        Number(repayment.repayment_amount || 0),
        { client }
      );
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
  const { includeOvertime = true, treatHolidayAdjacentAbsenceAsWorking = false } = options;

  const todayStr = todayIstYmd();
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const isCurrentMonth = year === ty && month === tm;
  const asOfDate = isCurrentMonth ? todayStr : null;

  const employeeResult = await pool.query(
    `SELECT id, name, employee_code, basic_salary, status, daily_travel_allowance, esi_amount
     FROM employees
     WHERE company_id = $1 AND id = $2`,
    [companyId, employeeId]
  );

  if (employeeResult.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }

  const employee = employeeResult.rows[0];
  const summary = await getAttendanceSummary(companyId, employeeId, year, month, {
    treatHolidayAdjacentAbsenceAsWorking,
    asOfDate,
  });

  const basicSalary = Number(employee.basic_salary || 0);
  const daysInMonth = summary.daysInMonth || 30;
  const dailyRate = daysInMonth > 0 ? basicSalary / daysInMonth : 0;
  const hourlyRate = dailyRate / 8;

  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const isMonthComplete = !isCurrentMonth || td >= lastDayOfMonth;

  const overtimePay = includeOvertime ? summary.overtimeHours * hourlyRate : 0;
  const presentWorkingDays = summary.presentWorkingDays ?? 0;
  const dailyTravelAllowance = Number(employee.daily_travel_allowance || 0);
  const travelAllowance = dailyTravelAllowance * presentWorkingDays;

  const paidLeaveDaysAllowed = Number(summary.paidLeaveDaysAllowed || 0);

  let earnedBasic;
  let absenceDeduction = 0;
  if (isMonthComplete) {
    earnedBasic = dailyRate * (summary.presentDays + paidLeaveDaysAllowed);
  } else {
    earnedBasic = dailyRate * summary.presentDays;
  }
  if (summary.attendanceMode === 'hours_based') {
    absenceDeduction = dailyRate * (summary.absenceDays || 0);
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

  const grossSalary = earnedBasic + overtimePay + travelAllowance;
  const esiDeduction = Number(employee.esi_amount || 0);
  const totalDeductions = absenceDeduction + lateDeduction + lunchOverDeduction + esiDeduction;
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
  const salaryAdvance = oldSalaryAdvance + newSalaryAdvance;
  let noLeaveIncentive = 0;
  const recordResult = await pool.query(
    `SELECT no_leave_incentive FROM payroll_records
     WHERE company_id = $1 AND employee_id = $2 AND year = $3 AND month = $4`,
    [companyId, employeeId, year, month]
  );
  if (recordResult.rowCount > 0 && Number(recordResult.rows[0].no_leave_incentive) > 0) {
    noLeaveIncentive = Number(recordResult.rows[0].no_leave_incentive);
  }
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
      overtimeHours: summary.overtimeHours,
      lateMinutes: summary.lateMinutes,
      lunchOverMinutes: summary.lunchOverMinutes,
      lateDays: summary.lateDays,
      lunchOverDays: summary.lunchOverDays,
      attendanceMode: summary.attendanceMode,
      requiredHoursPerDay: summary.requiredHoursPerDay,
      dayDetails: summary.dayDetails,
    },
    breakdown: {
      isMonthComplete,
      basicSalary: earnedBasic,
      overtimePay,
      travelAllowance,
      presentWorkingDays: summary.presentWorkingDays,
      grossSalary,
      absenceDeduction,
      lateDeduction,
      lunchOverDeduction,
      esiDeduction,
      totalDeductions,
      salaryAdvance,
      noLeaveIncentive,
      netSalary,
    },
    advance_repayments: advanceRepayments,
  };
}

/**
 * List payroll records with optional filters and pagination.
 * @returns { Promise<{ data: Array, page: number, limit: number, total: number }> }
 */
async function listPayrollRecords(companyId, { year, month, page = 1, limit = 20, employee_id: employeeId } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

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
  const { noLeaveIncentive = 0, ...rest } = payrollOptions;
  const client = await pool.connect();
  let employeeIds = [];
  try {
    const result = await client.query(
      `SELECT id FROM employees WHERE company_id = $1 AND status = 'active' ORDER BY id`,
      [companyId]
    );
    employeeIds = result.rows.map((r) => r.id);
  } finally {
    client.release();
  }

  const results = [];
  const errors = [];
  const options = { ...rest, noLeaveIncentive };
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
  generateMonthlyPayroll,
  generateMonthlyPayrollForAllActive,
  listPayrollRecords,
};

