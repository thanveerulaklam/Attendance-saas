const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { todayIstYmd, pgDateToYmd } = require('../utils/istDate');

const flagCache = new Map();

async function isShiftRotationEnabled(companyId) {
  const id = Number(companyId);
  if (!Number.isInteger(id) || id < 1) return false;
  if (flagCache.has(id)) return flagCache.get(id);
  const r = await pool.query(
    `SELECT enable_shift_rotation FROM companies WHERE id = $1`,
    [id]
  );
  const enabled = r.rows[0]?.enable_shift_rotation === true;
  flagCache.set(id, enabled);
  return enabled;
}

function clearShiftRotationFlagCache(companyId) {
  if (companyId != null) flagCache.delete(Number(companyId));
  else flagCache.clear();
}

async function getDefaultShiftId(client, companyId) {
  const r = await client.query(
    `SELECT id FROM shifts WHERE company_id = $1 ORDER BY id LIMIT 1`,
    [companyId]
  );
  return r.rows[0]?.id ?? null;
}

/**
 * One-time backfill when factory mode is enabled: one open assignment per employee.
 */
async function backfillInitialAssignments(companyId, createdBy = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT 1 FROM employee_shift_assignments WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );
    if (existing.rowCount > 0) {
      await client.query('COMMIT');
      return { inserted: 0, skipped: true };
    }

    const defaultShiftId = await getDefaultShiftId(client, companyId);
    const emps = await client.query(
      `SELECT id, shift_id, join_date FROM employees WHERE company_id = $1`,
      [companyId]
    );

    let inserted = 0;
    for (const emp of emps.rows) {
      const shiftId = emp.shift_id ?? defaultShiftId;
      if (!shiftId) continue;
      const effectiveFrom =
        emp.join_date != null ? pgDateToYmd(emp.join_date) : todayIstYmd();
      await client.query(
        `INSERT INTO employee_shift_assignments
           (company_id, employee_id, shift_id, effective_from, source, created_by)
         VALUES ($1, $2, $3, $4::date, 'initial', $5)
         ON CONFLICT (employee_id, effective_from) DO NOTHING`,
        [companyId, emp.id, shiftId, effectiveFrom, createdBy]
      );
      inserted += 1;
      if (!emp.shift_id) {
        await client.query(
          `UPDATE employees SET shift_id = $1 WHERE company_id = $2 AND id = $3`,
          [shiftId, companyId, emp.id]
        );
      }
    }

    await client.query('COMMIT');
    return { inserted, skipped: false };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore rollback errors */
    }
    const wrapped = new Error(
      err?.message || 'Failed to initialize shift assignments'
    );
    wrapped.statusCode = 500;
    throw wrapped;
  } finally {
    client.release();
  }
}

async function assertShiftRotationEnabled(companyId) {
  const enabled = await isShiftRotationEnabled(companyId);
  if (!enabled) {
    throw new AppError('Shift rotation is not enabled for this company', 403);
  }
}

module.exports = {
  isShiftRotationEnabled,
  clearShiftRotationFlagCache,
  backfillInitialAssignments,
  assertShiftRotationEnabled,
  getDefaultShiftId,
};
