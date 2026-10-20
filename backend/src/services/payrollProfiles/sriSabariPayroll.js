const { pool } = require('../../config/database');
const { AppError } = require('../../utils/AppError');
const { getCompanyTimezone } = require('../companyService');
const {
  ymdFromDate,
  sqlPunchLocalDate,
  getActiveCompanyTimezone,
  minutesFromMidnight,
  runWithCompanyTimezone,
} = require('../../utils/companyDate');
const {
  PROFILE_CODE,
  DEFAULT_CONFIG,
  mergeConfig,
  calculateSriSabari,
  applyDeferAndCarry,
  isSriSabariProfile,
  addDays,
} = require('./sriSabari');

async function loadCompanyProfile(client, companyId) {
  const db = client || pool;
  const result = await db.query(
    `SELECT payroll_profile, payroll_profile_config
     FROM companies
     WHERE id = $1`,
    [companyId]
  );
  const row = result.rows[0];
  if (!row || !isSriSabariProfile(row.payroll_profile)) return null;
  return {
    profile: row.payroll_profile,
    config: mergeConfig(row.payroll_profile_config || DEFAULT_CONFIG),
  };
}

async function loadPunches(client, companyId, employeeId, rangeStart, rangeEnd) {
  const db = client || pool;
  const from = addDays(rangeStart, -1);
  const to = addDays(rangeEnd, 1);
  const tz = getActiveCompanyTimezone();
  const result = await db.query(
    `SELECT punch_time, punch_type
     FROM attendance_logs
     WHERE company_id = $1
       AND employee_id = $2
       AND ${sqlPunchLocalDate(tz)} >= $3::date
       AND ${sqlPunchLocalDate(tz)} <= $4::date
     ORDER BY punch_time ASC`,
    [companyId, employeeId, from, to]
  );
  return result.rows.map((row) => {
    const at = new Date(row.punch_time).getTime();
    const ymd = ymdFromDate(row.punch_time, tz);
    return {
      type: String(row.punch_type || '').toLowerCase(),
      at,
      ymd,
      minutes: minutesFromMidnight(row.punch_time, tz),
    };
  });
}

async function loadPendingCarry(client, companyId, employeeId) {
  const db = client || pool;
  const result = await db.query(
    `SELECT id, amount, note, source, line_key, origin_period
     FROM payroll_carry_items
     WHERE company_id = $1 AND employee_id = $2 AND status = 'pending'
     ORDER BY id ASC`,
    [companyId, employeeId]
  );
  return result.rows;
}

function assertEmployeeReady(employee) {
  const gender = String(employee.gender || '').toLowerCase();
  if (gender !== 'male' && gender !== 'female') {
    throw new AppError('Set gender to male or female before payroll for this store', 400);
  }
  if (!(Number(employee.basic_salary) > 0)) {
    throw new AppError('Set an hourly rate before payroll for this store', 400);
  }
}

/**
 * Returns null when the company is not on the Sri Sabari profile.
 * Otherwise the settlement for one monthly or weekly run, including deferrals.
 */
async function settleSriSabari(client, {
  companyId,
  employee,
  rangeStart,
  rangeEnd,
  asOfDate = null,
  deferKeys = [],
}) {
  const profile = await loadCompanyProfile(client, companyId);
  if (!profile) return null;
  assertEmployeeReady(employee);
  const punches = await loadPunches(client, companyId, employee.id, rangeStart, rangeEnd);
  const pendingCarry = await loadPendingCarry(client, companyId, employee.id);
  let calculated;
  try {
    calculated = calculateSriSabari({
      rangeStart,
      rangeEnd,
      asOfDate,
      gender: employee.gender,
      weekOffDay:
        employee.week_off_day == null || employee.week_off_day === ''
          ? null
          : Number(employee.week_off_day),
      hourlyRate: Number(employee.basic_salary),
      config: profile.config,
      punches,
    });
  } catch (err) {
    throw new AppError(err.message || 'Sri Sabari payroll failed', err.statusCode || 400);
  }
  const settled = applyDeferAndCarry(calculated, { deferKeys, pendingCarry });
  return {
    ...settled,
    config: profile.config,
    breakdown: {
      profile: PROFILE_CODE,
      payslipLines: settled.payslipLines,
      deferrable: calculated.deferrable,
      deferredLines: settled.deferredLines,
      broughtForward: settled.broughtForward,
      hourlyPay: settled.hourlyPay,
      otPay: settled.otPay,
      sundayBonus: settled.sundayBonus,
      weekBonus: settled.weekBonus,
      lateDeduction: settled.lateDeduction,
      shortDeduction: settled.shortDeduction,
      absenceDeduction: settled.absenceDeduction,
      insideHours: settled.insideHours,
    },
  };
}

async function releaseCarryForPayroll(client, companyId, kind, payrollId) {
  if (!payrollId) return;
  await client.query(
    `UPDATE payroll_carry_items
     SET status = 'pending', applied_payroll_id = NULL, applied_payroll_kind = NULL, applied_at = NULL
     WHERE company_id = $1
       AND applied_payroll_kind = $2
       AND applied_payroll_id = $3
       AND status = 'applied'`,
    [companyId, kind, payrollId]
  );
}

async function finalizeSriSabariCarry(client, companyId, employeeId, settlement, { kind, payrollId, originPeriod }) {
  if (!settlement) return;
  await releaseCarryForPayroll(client, companyId, kind, payrollId);
  for (const line of settlement.deferredLines || []) {
    const existing = await client.query(
      `SELECT id FROM payroll_carry_items
       WHERE company_id = $1 AND employee_id = $2 AND line_key = $3 AND status = 'pending'
       LIMIT 1`,
      [companyId, employeeId, line.key]
    );
    if (existing.rowCount > 0) continue;
    await client.query(
      `INSERT INTO payroll_carry_items
         (company_id, employee_id, amount, note, source, status, origin_period, line_key)
       VALUES ($1, $2, $3, $4, 'deferred_rule', 'pending', $5, $6)`,
      [companyId, employeeId, line.amount, line.label, originPeriod, line.key]
    );
  }
  for (const item of settlement.carryApplied || []) {
    await client.query(
      `UPDATE payroll_carry_items
       SET status = 'applied',
           applied_payroll_kind = $3,
           applied_payroll_id = $4,
           applied_at = NOW()
       WHERE company_id = $1 AND id = $2 AND status = 'pending'`,
      [companyId, item.id, kind, payrollId]
    );
  }
}

async function saveRuleBreakdown(client, table, id, breakdown) {
  const allowed = table === 'weekly_payroll_records' ? 'weekly_payroll_records' : 'payroll_records';
  await client.query(
    `UPDATE ${allowed} SET rule_breakdown = $2::jsonb WHERE id = $1`,
    [id, JSON.stringify(breakdown)]
  );
}

async function createManualCarry(companyId, employeeId, { amount, note }) {
  const profile = await loadCompanyProfile(null, companyId);
  if (!profile) {
    throw new AppError('Carry forward is only available for this store payroll profile', 400);
  }
  const value = Number(amount);
  if (!(value > 0)) throw new AppError('Amount must be greater than zero', 400);
  const result = await pool.query(
    `INSERT INTO payroll_carry_items
       (company_id, employee_id, amount, note, source, status, origin_period, line_key)
     VALUES ($1, $2, $3, $4, 'manual', 'pending', NULL, NULL)
     RETURNING id, amount, note, source, status, line_key, origin_period, created_at`,
    [companyId, employeeId, value, note ? String(note).slice(0, 300) : null]
  );
  return result.rows[0];
}

async function listCarry(companyId, employeeId) {
  const profile = await loadCompanyProfile(null, companyId);
  if (!profile) return [];
  const result = await pool.query(
    `SELECT id, amount, note, source, status, line_key, origin_period, created_at, applied_at
     FROM payroll_carry_items
     WHERE company_id = $1 AND employee_id = $2
     ORDER BY status ASC, id DESC
     LIMIT 50`,
    [companyId, employeeId]
  );
  return result.rows;
}

async function previewForEmployee(companyId, employeeId, { rangeStart, rangeEnd, asOfDate = null }) {
  const employeeResult = await pool.query(
    `SELECT id, gender, week_off_day, basic_salary, status
     FROM employees
     WHERE company_id = $1 AND id = $2`,
    [companyId, employeeId]
  );
  if (employeeResult.rowCount === 0) throw new AppError('Employee not found for this company', 404);
  const settlement = await previewSriSabariLines(companyId, employeeResult.rows[0], {
    rangeStart,
    rangeEnd,
    asOfDate,
  });
  const pending = await listCarry(companyId, employeeId);
  return {
    settlement,
    pending: pending.filter((row) => row.status === 'pending'),
  };
}

async function previewSriSabariLines(companyId, employee, { rangeStart, rangeEnd, asOfDate = null }) {
  const tz = await getCompanyTimezone(companyId);
  return runWithCompanyTimezone(tz, () =>
    settleSriSabari(pool, {
      companyId,
      employee,
      rangeStart,
      rangeEnd,
      asOfDate,
      deferKeys: [],
    })
  );
}

async function updateProfileConfig(companyId, config) {
  const profile = await loadCompanyProfile(null, companyId);
  if (!profile) {
    throw new AppError('Payroll timings can be edited only for this store profile', 400);
  }
  const merged = mergeConfig(config);
  const result = await pool.query(
    `UPDATE companies
     SET payroll_profile_config = $2::jsonb
     WHERE id = $1
     RETURNING payroll_profile, payroll_profile_config`,
    [companyId, JSON.stringify(merged)]
  );
  return result.rows[0];
}

module.exports = {
  loadCompanyProfile,
  settleSriSabari,
  finalizeSriSabariCarry,
  saveRuleBreakdown,
  createManualCarry,
  listCarry,
  updateProfileConfig,
  previewSriSabariLines,
  previewForEmployee,
  releaseCarryForPayroll,
};
