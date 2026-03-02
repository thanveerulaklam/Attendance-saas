const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { getHolidayDatesForMonth } = require('./holidayService');
const { getAdvanceForEmployeeMonth } = require('./advanceService');

function getMonthBounds(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const daysInMonth = new Date(year, month, 0).getDate();
  return { start, end, daysInMonth };
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
       lunch_over_deduction_amount
     FROM shifts
     WHERE company_id = $1
     ORDER BY id
     LIMIT 1`,
    [companyId]
  );

  if (result.rowCount === 0) {
    throw new AppError('No shift configured for company', 400);
  }

  const row = result.rows[0];
  const [startHour, startMinute] = row.start_time.split(':').map(Number);
  const [endHour, endMinute] = row.end_time.split(':').map(Number);

  const shiftMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  const shiftMs = shiftMinutes * 60 * 1000;
  const graceMs = Number(row.grace_minutes || 0) * 60 * 1000;
  const lunchMinutesAllotted = Number(row.lunch_minutes) >= 0 ? Number(row.lunch_minutes) : 60;

  return {
    id: row.id,
    startHour,
    startMinute,
    shiftMs,
    graceMs,
    lunchMinutesAllotted,
    lateDeductionMinutes: Number(row.late_deduction_minutes || 0),
    lateDeductionAmount: Number(row.late_deduction_amount || 0),
    lunchOverDeductionMinutes: Number(row.lunch_over_deduction_minutes || 0),
    lunchOverDeductionAmount: Number(row.lunch_over_deduction_amount || 0),
  };
}

/** Add or subtract days from YYYY-MM-DD, return YYYY-MM-DD. */
function addDays(isoDateStr, delta) {
  const d = new Date(isoDateStr + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * For incomplete months (current month viewed before month-end), only count working days
 * and absence for dates that have already occurred. Avoids penalizing staff for future days.
 */
function getLastDateToConsider(year, month, asOfDate) {
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

  if (!isCurrentMonth || !asOfDate) {
    return lastDayStr;
  }
  const asOfStr = typeof asOfDate === 'string' ? asOfDate.slice(0, 10) : asOfDate.toISOString().slice(0, 10);
  return asOfStr < lastDayStr ? asOfStr : lastDayStr;
}

async function getAttendanceSummary(companyId, employeeId, year, month, options = {}) {
  const { treatHolidayAdjacentAbsenceAsWorking = false, asOfDate = null } = options;
  const client = await pool.connect();
  try {
    const { start, end, daysInMonth } = getMonthBounds(year, month);

    const shift = await getDefaultShiftForCompany(client, companyId);

    const [logsResult, holidaySet] = await Promise.all([
      client.query(
        `SELECT punch_time, punch_type
         FROM attendance_logs
         WHERE company_id = $1
           AND employee_id = $2
           AND punch_time >= $3
           AND punch_time < $4
         ORDER BY punch_time ASC`,
        [companyId, employeeId, start.toISOString(), end.toISOString()]
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
      const key = punchTime.toISOString().slice(0, 10);
      if (!logsByDay.has(key)) {
        logsByDay.set(key, []);
      }
      logsByDay.get(key).push({
        punchTime,
        punchType: row.punch_type.toLowerCase(),
      });
    }

    /** Days where employee actually worked (workedMs > 0). */
    const presentDayKeys = new Set();
    let presentDays = 0;
    let presentWorkingDays = 0;
    let totalOvertimeMs = 0;
    let totalLateMs = 0;
    let totalLunchOverMs = 0;

    const allottedLunchMs = (shift.lunchMinutesAllotted ?? 60) * 60 * 1000;

    for (const [dayKey, dayLogs] of logsByDay.entries()) {
      if (!dayLogs.length) continue;

      const sorted = [...dayLogs].sort((a, b) => a.punchTime - b.punchTime);
      let workedMs = 0;
      let lastIn = null;
      let firstInTime = null;
      let lunchStartTime = null;
      let lunchEndTime = null;

      for (const log of sorted) {
        if (log.punchType === 'in') {
          if (!firstInTime) firstInTime = log.punchTime;
          if (lunchStartTime != null && lunchEndTime == null) lunchEndTime = log.punchTime;
          lastIn = log.punchTime;
        } else if (log.punchType === 'out' && lastIn) {
          workedMs += Math.max(0, log.punchTime - lastIn);
          if (lunchStartTime == null) lunchStartTime = log.punchTime;
          lastIn = null;
        }
      }

      if (workedMs > 0 && dayKey <= lastDateToConsider) {
        presentDayKeys.add(dayKey);
        const isHoliday = holidaySet.has(dayKey);

        presentDays += 1;
        if (!isHoliday) {
          presentWorkingDays += 1;
        }

        const overtimeMs = workedMs - shift.shiftMs - shift.graceMs;
        if (overtimeMs > 0) {
          totalOvertimeMs += overtimeMs;
        }

        if (firstInTime && !holidaySet.has(dayKey)) {
          const dayStart = new Date(`${dayKey}T00:00:00.000Z`);
          const shiftStartMs =
            dayStart.getTime() +
            (shift.startHour * 60 + shift.startMinute) * 60 * 1000;
          const allowedStartMs = shiftStartMs + shift.graceMs;
          if (firstInTime.getTime() > allowedStartMs) {
            totalLateMs += firstInTime.getTime() - allowedStartMs;
          }
        }

        if (lunchStartTime != null && lunchEndTime != null) {
          const lunchMs = lunchEndTime - lunchStartTime;
          if (lunchMs > allottedLunchMs) {
            totalLunchOverMs += lunchMs - allottedLunchMs;
          }
        }
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

    const absenceDays = Math.max(0, effectiveWorkingDays - presentWorkingDays);

    const overtimeHours = totalOvertimeMs / (60 * 60 * 1000);
    const lateMinutes = totalLateMs / (60 * 1000);
    const lunchOverMinutes = totalLunchOverMs / (60 * 1000);

    return {
      daysInMonth,
      workingDaysUpToDate: lastDateToConsider,
      workingDays,
      workingDaysInMonth,
      presentDays,
      overtimeHours,
      lateMinutes,
      lunchOverMinutes,
      lateDeductionMinutes: shift.lateDeductionMinutes,
      lateDeductionAmount: shift.lateDeductionAmount,
      lunchOverDeductionMinutes: shift.lunchOverDeductionMinutes,
      lunchOverDeductionAmount: shift.lunchOverDeductionAmount,
      absenceDays,
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
      `SELECT id, basic_salary, status, join_date
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

    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    const asOfDate = isCurrentMonth ? now.toISOString().slice(0, 10) : null;
    const summary = await getAttendanceSummary(companyId, employeeId, year, month, {
      treatHolidayAdjacentAbsenceAsWorking,
      asOfDate,
    });

    const basicSalary = Number(employee.basic_salary || 0);
    const daysInMonth = summary.daysInMonth || 30;
    const dailyRate = daysInMonth > 0 ? basicSalary / daysInMonth : 0;
    const hourlyRate = dailyRate / 8;

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const isMonthComplete = !isCurrentMonth || now.getDate() >= lastDayOfMonth;

    const overtimePay = includeOvertime ? summary.overtimeHours * hourlyRate : 0;
    let earnedBasic;
    let absenceDeduction;
    if (isMonthComplete) {
      earnedBasic = basicSalary;
      absenceDeduction = summary.absenceDays * dailyRate;
    } else {
      earnedBasic = dailyRate * summary.presentDays;
      absenceDeduction = 0;
    }

    let lateDeduction = 0;
    if (
      (summary.lateMinutes || 0) > 0 &&
      summary.lateDeductionMinutes > 0 &&
      summary.lateDeductionAmount > 0
    ) {
      const blocks = Math.floor(
        summary.lateMinutes / summary.lateDeductionMinutes
      );
      if (blocks > 0) {
        lateDeduction = blocks * summary.lateDeductionAmount;
      }
    }

    let lunchOverDeduction = 0;
    if (
      (summary.lunchOverMinutes || 0) > 0 &&
      summary.lunchOverDeductionMinutes > 0 &&
      summary.lunchOverDeductionAmount > 0
    ) {
      const blocks = Math.floor(
        summary.lunchOverMinutes / summary.lunchOverDeductionMinutes
      );
      if (blocks > 0) {
        lunchOverDeduction = blocks * summary.lunchOverDeductionAmount;
      }
    }

    const grossSalary = earnedBasic + overtimePay;
    const deductions = absenceDeduction + lateDeduction + lunchOverDeduction;
    const salaryAdvance = await getAdvanceForEmployeeMonth(companyId, employeeId, year, month);
    const noLeaveIncentiveAmount = (Number(noLeaveIncentive) > 0 && summary.absenceDays === 0 && isMonthComplete)
      ? Number(noLeaveIncentive)
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

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const asOfDate = isCurrentMonth ? now.toISOString().slice(0, 10) : null;

  const employeeResult = await pool.query(
    `SELECT id, name, employee_code, basic_salary, status
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
  const isMonthComplete = !isCurrentMonth || now.getDate() >= lastDayOfMonth;

  const overtimePay = includeOvertime ? summary.overtimeHours * hourlyRate : 0;
  let earnedBasic;
  let absenceDeduction;
  if (isMonthComplete) {
    earnedBasic = basicSalary;
    absenceDeduction = summary.absenceDays * dailyRate;
  } else {
    earnedBasic = dailyRate * summary.presentDays;
    absenceDeduction = 0;
  }

  let lateDeduction = 0;
  if (
    (summary.lateMinutes || 0) > 0 &&
    summary.lateDeductionMinutes > 0 &&
    summary.lateDeductionAmount > 0
  ) {
    const blocks = Math.floor(summary.lateMinutes / summary.lateDeductionMinutes);
    if (blocks > 0) lateDeduction = blocks * summary.lateDeductionAmount;
  }

  let lunchOverDeduction = 0;
  if (
    (summary.lunchOverMinutes || 0) > 0 &&
    summary.lunchOverDeductionMinutes > 0 &&
    summary.lunchOverDeductionAmount > 0
  ) {
    const blocks = Math.floor(summary.lunchOverMinutes / summary.lunchOverDeductionMinutes);
    if (blocks > 0) lunchOverDeduction = blocks * summary.lunchOverDeductionAmount;
  }

  const grossSalary = earnedBasic + overtimePay;
  const totalDeductions = absenceDeduction + lateDeduction + lunchOverDeduction;
  const salaryAdvance = await getAdvanceForEmployeeMonth(companyId, employeeId, year, month);
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
      absenceDays: summary.absenceDays,
      overtimeHours: summary.overtimeHours,
      lateMinutes: summary.lateMinutes,
      lunchOverMinutes: summary.lunchOverMinutes,
    },
    breakdown: {
      isMonthComplete,
      basicSalary: earnedBasic,
      overtimePay,
      grossSalary,
      absenceDeduction,
      lateDeduction,
      lunchOverDeduction,
      totalDeductions,
      salaryAdvance,
      noLeaveIncentive,
      netSalary,
    },
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

