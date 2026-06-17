const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

function parseDateOnly(value) {
  const str = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new AppError('date must be YYYY-MM-DD', 400);
  }
  const parsed = new Date(`${str}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError('date must be a valid date', 400);
  }
  return str;
}

async function assertEmployeeInScope(client, companyId, employeeId, allowedBranchIds) {
  const result = await client.query(
    `SELECT branch_id FROM employees WHERE company_id = $1 AND id = $2`,
    [companyId, Number(employeeId)]
  );
  if (result.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }
  if (allowedBranchIds != null) {
    if (
      allowedBranchIds.length === 0 ||
      !allowedBranchIds.includes(Number(result.rows[0].branch_id))
    ) {
      throw new AppError('Employee not found for this company', 404);
    }
  }
}

async function loadOverridesMap(client, companyId, employeeId, startDate, endDate) {
  const result = await client.query(
    `SELECT
       attendance_date::text AS date,
       override_status,
       note
     FROM attendance_day_overrides
     WHERE company_id = $1
       AND employee_id = $2
       AND attendance_date >= $3::date
       AND attendance_date <= $4::date`,
    [companyId, Number(employeeId), startDate, endDate]
  );
  const map = new Map();
  for (const row of result.rows) {
    map.set(String(row.date).slice(0, 10), row);
  }
  return map;
}

async function listOverrides(companyId, employeeId, startDate, endDate, allowedBranchIds = null) {
  const client = await pool.connect();
  try {
    await assertEmployeeInScope(client, companyId, employeeId, allowedBranchIds);
    const result = await client.query(
      `SELECT id, employee_id, attendance_date, override_status, note, created_at, updated_at
       FROM attendance_day_overrides
       WHERE company_id = $1
         AND employee_id = $2
         AND attendance_date >= $3::date
         AND attendance_date <= $4::date
       ORDER BY attendance_date ASC`,
      [companyId, Number(employeeId), startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function upsertDayOverride(
  companyId,
  { employee_id: employeeIdRaw, date, override_status: overrideStatus, note },
  createdByUserId,
  allowedBranchIds = null
) {
  const employeeId = Number(employeeIdRaw);
  const attendanceDate = parseDateOnly(date);
  const status = String(overrideStatus || '').trim().toLowerCase();

  if (!employeeId) throw new AppError('employee_id is required', 400);
  if (status !== 'on_duty') {
    throw new AppError('override_status must be "on_duty"', 400);
  }

  const client = await pool.connect();
  try {
    await assertEmployeeInScope(client, companyId, employeeId, allowedBranchIds);
    const noteStr = typeof note === 'string' ? note.trim() || null : null;

    const result = await client.query(
      `INSERT INTO attendance_day_overrides (
         company_id, employee_id, attendance_date, override_status, note, created_by
       )
       VALUES ($1, $2, $3::date, $4, $5, $6)
       ON CONFLICT (company_id, employee_id, attendance_date)
       DO UPDATE SET
         override_status = EXCLUDED.override_status,
         note = EXCLUDED.note,
         updated_at = NOW()
       RETURNING *`,
      [companyId, employeeId, attendanceDate, status, noteStr, createdByUserId || null]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function removeDayOverride(companyId, employeeIdRaw, date, allowedBranchIds = null) {
  const employeeId = Number(employeeIdRaw);
  const attendanceDate = parseDateOnly(date);
  if (!employeeId) throw new AppError('employee_id is required', 400);

  const client = await pool.connect();
  try {
    await assertEmployeeInScope(client, companyId, employeeId, allowedBranchIds);
    const result = await client.query(
      `DELETE FROM attendance_day_overrides
       WHERE company_id = $1
         AND employee_id = $2
         AND attendance_date = $3::date
       RETURNING id`,
      [companyId, employeeId, attendanceDate]
    );
    if (result.rowCount === 0) {
      throw new AppError('Override not found', 404);
    }
    return { removed: true };
  } finally {
    client.release();
  }
}

module.exports = {
  loadOverridesMap,
  listOverrides,
  upsertDayOverride,
  removeDayOverride,
};
