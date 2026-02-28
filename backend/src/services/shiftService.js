const { pool } = require('../config/database');

async function listShifts(companyId, { page = 1, limit = 50 } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  const countResult = await pool.query(
    'SELECT COUNT(*) AS total FROM shifts WHERE company_id = $1',
    [companyId]
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const result = await pool.query(
    `SELECT
       id,
       company_id,
       shift_name,
       start_time,
       end_time,
       grace_minutes,
       late_deduction_minutes,
       late_deduction_amount,
       created_at
     FROM shifts
     WHERE company_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [companyId, limitNum, offset]
  );

  return { data: result.rows, total, page: pageNum, limit: limitNum };
}

async function createShift(companyId, data) {
  const name = String(data.shift_name || '').trim();
  const startTime = String(data.start_time || '').trim();
  const endTime = String(data.end_time || '').trim();
  const graceMinutes = Number.isFinite(Number(data.grace_minutes))
    ? Number(data.grace_minutes)
    : 0;
  const lateDeductionMinutes = Number.isFinite(Number(data.late_deduction_minutes))
    ? Number(data.late_deduction_minutes)
    : 0;
  const lateDeductionAmount = Number.isFinite(Number(data.late_deduction_amount))
    ? Number(data.late_deduction_amount)
    : 0;

  if (!name || !startTime || !endTime) {
    const error = new Error('shift_name, start_time and end_time are required');
    error.statusCode = 400;
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO shifts (
       company_id,
       shift_name,
       start_time,
       end_time,
       grace_minutes,
       late_deduction_minutes,
       late_deduction_amount
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING
       id,
       company_id,
       shift_name,
       start_time,
       end_time,
       grace_minutes,
       late_deduction_minutes,
       late_deduction_amount,
       created_at`,
    [companyId, name, startTime, endTime, graceMinutes, lateDeductionMinutes, lateDeductionAmount]
  );

  return result.rows[0];
}

module.exports = {
  listShifts,
  createShift,
};

