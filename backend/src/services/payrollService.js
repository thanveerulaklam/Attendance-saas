const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

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
       late_deduction_minutes,
       late_deduction_amount
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

  return {
    id: row.id,
    startHour,
    startMinute,
    shiftMs,
    graceMs,
    lateDeductionMinutes: Number(row.late_deduction_minutes || 0),
    lateDeductionAmount: Number(row.late_deduction_amount || 0),
  };
}

async function getAttendanceSummary(companyId, employeeId, year, month) {
  const client = await pool.connect();
  try {
    const { start, end, daysInMonth } = getMonthBounds(year, month);

    const shift = await getDefaultShiftForCompany(client, companyId);

    const [logsResult, holidaysResult] = await Promise.all([
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
      client.query(
        `SELECT holiday_date
         FROM company_holidays
         WHERE company_id = $1
           AND holiday_date >= $2::date
           AND holiday_date < $3::date`,
        [companyId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
      ),
    ]);

    const holidaySet = new Set(
      holidaysResult.rows.map((r) => r.holiday_date.toISOString().slice(0, 10))
    );
    const workingDays = daysInMonth - holidaySet.size;

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

    let presentDays = 0;
    let presentWorkingDays = 0;
    let totalOvertimeMs = 0;
    let totalLateMs = 0;

    for (const [dayKey, dayLogs] of logsByDay.entries()) {
      if (!dayLogs.length) continue;

      let workedMs = 0;
      let lastIn = null;
      let firstInTime = null;

      for (const log of dayLogs) {
        if (log.punchType === 'in') {
          if (!firstInTime) firstInTime = log.punchTime;
          lastIn = log.punchTime;
        } else if (log.punchType === 'out' && lastIn) {
          workedMs += Math.max(0, log.punchTime - lastIn);
          lastIn = null;
        }
      }

      if (workedMs > 0) {
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
      }
    }

    const overtimeHours = totalOvertimeMs / (60 * 60 * 1000);
    const lateMinutes = totalLateMs / (60 * 1000);

    return {
      daysInMonth,
      workingDays,
      presentDays,
      overtimeHours,
      lateMinutes,
      lateDeductionMinutes: shift.lateDeductionMinutes,
      lateDeductionAmount: shift.lateDeductionAmount,
      absenceDays: Math.max(0, workingDays - presentWorkingDays),
    };
  } finally {
    client.release();
  }
}

async function generateMonthlyPayroll(companyId, employeeId, year, month) {
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

    const summary = await getAttendanceSummary(companyId, employeeId, year, month);

    const basicSalary = Number(employee.basic_salary || 0);
    const workingDays = summary.workingDays || summary.daysInMonth || 30;
    const dailyRate = workingDays > 0 ? basicSalary / workingDays : 0;
    const hourlyRate = dailyRate / 8;

    const overtimePay = summary.overtimeHours * hourlyRate;
    const absenceDeduction = summary.absenceDays * dailyRate;

    let lateDeduction = 0;
    if (
      summary.lateMinutes > 0 &&
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

    const grossSalary = basicSalary + overtimePay;
    const deductions = absenceDeduction + lateDeduction;
    const salaryAdvance = 0;
    const netSalary = grossSalary - deductions - salaryAdvance;

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
          net_salary
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (company_id, employee_id, year, month)
       DO UPDATE SET
          total_days = EXCLUDED.total_days,
          present_days = EXCLUDED.present_days,
          overtime_hours = EXCLUDED.overtime_hours,
          gross_salary = EXCLUDED.gross_salary,
          deductions = EXCLUDED.deductions,
          salary_advance = EXCLUDED.salary_advance,
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

module.exports = {
  getAttendanceSummary,
  generateMonthlyPayroll,
  listPayrollRecords,
};

