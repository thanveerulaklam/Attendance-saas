const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { addDaysIst, todayIstYmd, pgDateToYmd } = require('../utils/istDate');
const { assertShiftRotationEnabled } = require('./shiftRotationPolicyService');

async function resolveShiftIdForEmployeeOnDate(client, companyId, employeeId, dateStr, fallbackShiftId) {
  const r = await client.query(
    `SELECT shift_id FROM employee_shift_assignments
     WHERE company_id = $1 AND employee_id = $2
       AND effective_from <= $3::date
       AND (effective_to IS NULL OR effective_to >= $3::date)
     ORDER BY effective_from DESC
     LIMIT 1`,
    [companyId, employeeId, dateStr]
  );
  if (r.rowCount > 0) return r.rows[0].shift_id;
  return fallbackShiftId ?? null;
}

/**
 * Bulk resolve shift_id for many employees on one date.
 * @returns {Map<number, number|null>}
 */
async function resolveShiftIdsForEmployeesOnDate(client, companyId, employeeIds, dateStr, employeesById) {
  const map = new Map();
  if (!employeeIds.length) return map;

  const r = await client.query(
    `SELECT DISTINCT ON (employee_id)
            employee_id, shift_id
     FROM employee_shift_assignments
     WHERE company_id = $1
       AND employee_id = ANY($2::bigint[])
       AND effective_from <= $3::date
       AND (effective_to IS NULL OR effective_to >= $3::date)
     ORDER BY employee_id, effective_from DESC`,
    [companyId, employeeIds, dateStr]
  );

  for (const row of r.rows) {
    map.set(Number(row.employee_id), Number(row.shift_id));
  }
  for (const eid of employeeIds) {
    if (!map.has(eid)) {
      const emp = employeesById?.get(eid);
      map.set(eid, emp?.shift_id ?? null);
    }
  }
  return map;
}

async function getAssignmentsForEmployeeInRange(
  client,
  companyId,
  employeeId,
  startDateStr,
  endDateStr
) {
  const r = await client.query(
    `SELECT shift_id, effective_from, effective_to
     FROM employee_shift_assignments
     WHERE company_id = $1 AND employee_id = $2
       AND effective_from <= $4::date
       AND (effective_to IS NULL OR effective_to >= $3::date)
     ORDER BY effective_from ASC`,
    [companyId, employeeId, startDateStr, endDateStr]
  );
  return r.rows;
}

function resolveShiftIdFromAssignments(rows, dateStr, fallbackShiftId) {
  let match = null;
  let matchFrom = '';
  for (const row of rows || []) {
    const from = pgDateToYmd(row.effective_from);
    const to = row.effective_to ? pgDateToYmd(row.effective_to) : null;
    if (from <= dateStr && (!to || to >= dateStr) && from >= matchFrom) {
      match = row;
      matchFrom = from;
    }
  }
  return match ? Number(match.shift_id) : fallbackShiftId ?? null;
}

async function assignShiftBulk(companyId, { employeeIds, shiftId, effectiveFrom, notes, source, rotationGroupId, createdBy }) {
  await assertShiftRotationEnabled(companyId);

  const ids = [...new Set((employeeIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const sid = Number(shiftId);
  const fromDate = String(effectiveFrom || '').slice(0, 10);
  if (!ids.length) throw new AppError('At least one employee is required', 400);
  if (!Number.isInteger(sid) || sid < 1) throw new AppError('Valid shift_id is required', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) throw new AppError('effective_from must be YYYY-MM-DD', 400);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const shiftCheck = await client.query(
      `SELECT id FROM shifts WHERE company_id = $1 AND id = $2`,
      [companyId, sid]
    );
    if (shiftCheck.rowCount === 0) throw new AppError('Shift not found', 404);

    const empCheck = await client.query(
      `SELECT id FROM employees WHERE company_id = $1 AND id = ANY($2::bigint[])`,
      [companyId, ids]
    );
    if (empCheck.rowCount !== ids.length) throw new AppError('One or more employees not found', 404);

    const prevDay = addDaysIst(fromDate, -1);
    const src = source || 'manual';

    for (const eid of ids) {
      await client.query(
        `UPDATE employee_shift_assignments
         SET effective_to = $4::date
         WHERE company_id = $1 AND employee_id = $2
           AND effective_from < $3::date
           AND (effective_to IS NULL OR effective_to >= $3::date)`,
        [companyId, eid, fromDate, prevDay]
      );

      await client.query(
        `DELETE FROM employee_shift_assignments
         WHERE company_id = $1 AND employee_id = $2 AND effective_from = $3::date`,
        [companyId, eid, fromDate]
      );

      await client.query(
        `INSERT INTO employee_shift_assignments
           (company_id, employee_id, shift_id, effective_from, source, rotation_group_id, notes, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)`,
        [companyId, eid, sid, fromDate, src, rotationGroupId ?? null, notes ?? null, createdBy ?? null]
      );

      if (fromDate <= todayIstYmd()) {
        await client.query(
          `UPDATE employees SET shift_id = $1 WHERE company_id = $2 AND id = $3`,
          [sid, companyId, eid]
        );
      }
    }

    await client.query('COMMIT');
    return { assigned: ids.length, shift_id: sid, effective_from: fromDate };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listAssignments(companyId, { employeeId, limit = 50, page = 1 } = {}) {
  await assertShiftRotationEnabled(companyId);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
  const pageNum = Math.max(1, Number(page) || 1);
  const offset = (pageNum - 1) * limitNum;

  const params = [companyId];
  let where = 'WHERE a.company_id = $1';
  if (employeeId) {
    params.push(Number(employeeId));
    where += ` AND a.employee_id = $${params.length}`;
  }

  const countR = await pool.query(
    `SELECT COUNT(*)::int AS total FROM employee_shift_assignments a ${where}`,
    params
  );
  const total = countR.rows[0]?.total ?? 0;

  params.push(limitNum, offset);
  const r = await pool.query(
    `SELECT a.id, a.company_id, a.employee_id, a.shift_id, a.effective_from, a.effective_to,
            a.source, a.rotation_group_id, a.notes, a.created_at,
            e.name AS employee_name, e.employee_code, s.shift_name,
            prev.shift_name AS previous_shift_name
     FROM employee_shift_assignments a
     JOIN employees e ON e.id = a.employee_id
     JOIN shifts s ON s.id = a.shift_id
     LEFT JOIN LATERAL (
       SELECT s2.shift_name FROM employee_shift_assignments a2
       JOIN shifts s2 ON s2.id = a2.shift_id
       WHERE a2.employee_id = a.employee_id AND a2.effective_from < a.effective_from
       ORDER BY a2.effective_from DESC LIMIT 1
     ) prev ON TRUE
     ${where}
     ORDER BY a.effective_from DESC, a.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: r.rows, total, page: pageNum, limit: limitNum };
}

async function getEmployeeAssignmentHistory(companyId, employeeId) {
  await assertShiftRotationEnabled(companyId);
  const r = await pool.query(
    `SELECT a.id, a.shift_id, a.effective_from, a.effective_to, a.source, a.notes,
            s.shift_name,
            prev.shift_name AS previous_shift_name
     FROM employee_shift_assignments a
     JOIN shifts s ON s.id = a.shift_id
     LEFT JOIN LATERAL (
       SELECT s2.shift_name FROM employee_shift_assignments a2
       JOIN shifts s2 ON s2.id = a2.shift_id
       WHERE a2.company_id = a.company_id AND a2.employee_id = a.employee_id
         AND a2.effective_from < a.effective_from
       ORDER BY a2.effective_from DESC LIMIT 1
     ) prev ON TRUE
     WHERE a.company_id = $1 AND a.employee_id = $2
     ORDER BY a.effective_from DESC`,
    [companyId, employeeId]
  );
  return r.rows;
}

async function getCurrentAssignment(companyId, employeeId) {
  await assertShiftRotationEnabled(companyId);
  const today = todayIstYmd();
  const r = await pool.query(
    `SELECT a.id, a.shift_id, a.effective_from, a.effective_to, a.source, s.shift_name
     FROM employee_shift_assignments a
     JOIN shifts s ON s.id = a.shift_id
     WHERE a.company_id = $1 AND a.employee_id = $2
       AND a.effective_from <= $3::date
       AND (a.effective_to IS NULL OR a.effective_to >= $3::date)
     ORDER BY a.effective_from DESC
     LIMIT 1`,
    [companyId, employeeId, today]
  );
  return r.rows[0] || null;
}

/**
 * Effective shift per active employee on a calendar date (assignment row or employees.shift_id).
 * @param {number} [filterShiftId] - when set, only return employees on this shift
 */
async function listEffectiveShiftAssignments(companyId, asOfDate, filterShiftId = null) {
  await assertShiftRotationEnabled(companyId);
  const asOf = String(asOfDate || todayIstYmd()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new AppError('as_of must be YYYY-MM-DD', 400);
  }

  const params = [companyId, asOf];
  let shiftFilter = '';
  if (filterShiftId != null && filterShiftId !== '') {
    const sid = Number(filterShiftId);
    if (!Number.isInteger(sid) || sid < 1) throw new AppError('Invalid shift_id', 400);
    params.push(sid);
    shiftFilter = ` AND COALESCE(esa.shift_id, e.shift_id) = $${params.length}`;
  }

  const r = await pool.query(
    `SELECT e.id AS employee_id,
            e.name AS employee_name,
            e.employee_code,
            e.department,
            COALESCE(esa.shift_id, e.shift_id) AS shift_id,
            s.shift_name,
            esa.effective_from,
            esa.source
     FROM employees e
     LEFT JOIN LATERAL (
       SELECT a.shift_id, a.effective_from, a.source
       FROM employee_shift_assignments a
       WHERE a.company_id = e.company_id
         AND a.employee_id = e.id
         AND a.effective_from <= $2::date
         AND (a.effective_to IS NULL OR a.effective_to >= $2::date)
       ORDER BY a.effective_from DESC
       LIMIT 1
     ) esa ON TRUE
     LEFT JOIN shifts s ON s.id = COALESCE(esa.shift_id, e.shift_id)
     WHERE e.company_id = $1
       AND e.status = 'active'
       AND COALESCE(esa.shift_id, e.shift_id) IS NOT NULL
       ${shiftFilter}
     ORDER BY e.name ASC`,
    params
  );

  return { as_of: asOf, data: r.rows };
}

module.exports = {
  resolveShiftIdForEmployeeOnDate,
  resolveShiftIdsForEmployeesOnDate,
  getAssignmentsForEmployeeInRange,
  resolveShiftIdFromAssignments,
  assignShiftBulk,
  listAssignments,
  getEmployeeAssignmentHistory,
  getCurrentAssignment,
  listEffectiveShiftAssignments,
};
