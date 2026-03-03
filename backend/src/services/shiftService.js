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
       lunch_minutes,
       weekly_off_days,
       late_deduction_minutes,
       late_deduction_amount,
       lunch_over_deduction_minutes,
       lunch_over_deduction_amount,
       no_leave_incentive,
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
  const parsed = parseShiftData(data);
  const {
    name,
    startTime,
    endTime,
    graceMinutes,
    lunchMinutes,
    uniqueWeeklyOff,
    lateDeductionMinutes,
    lateDeductionAmount,
    lunchOverDeductionMinutes,
    lunchOverDeductionAmount,
    noLeaveIncentive,
  } = parsed;

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
       lunch_minutes,
       weekly_off_days,
       late_deduction_minutes,
       late_deduction_amount,
       lunch_over_deduction_minutes,
       lunch_over_deduction_amount,
       no_leave_incentive
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING
       id,
       company_id,
       shift_name,
       start_time,
       end_time,
       grace_minutes,
       lunch_minutes,
       weekly_off_days,
       late_deduction_minutes,
       late_deduction_amount,
       lunch_over_deduction_minutes,
       lunch_over_deduction_amount,
       no_leave_incentive,
       created_at`,
    [
      companyId,
      name,
      startTime,
      endTime,
      graceMinutes,
      lunchMinutes,
      uniqueWeeklyOff,
      lateDeductionMinutes,
      lateDeductionAmount,
      lunchOverDeductionMinutes,
      lunchOverDeductionAmount,
      noLeaveIncentive,
    ]
  );

  return result.rows[0];
}

function parseShiftData(data) {
  const name = String(data.shift_name || '').trim();
  const startTime = String(data.start_time || '').trim();
  const endTime = String(data.end_time || '').trim();
  const graceMinutes = Number.isFinite(Number(data.grace_minutes))
    ? Number(data.grace_minutes)
    : 0;
  const lunchMinutes = Number.isFinite(Number(data.lunch_minutes)) && Number(data.lunch_minutes) >= 0
    ? Number(data.lunch_minutes)
    : 60;
  const lateDeductionMinutes = Number.isFinite(Number(data.late_deduction_minutes))
    ? Number(data.late_deduction_minutes)
    : 0;
  const lateDeductionAmount = Number.isFinite(Number(data.late_deduction_amount))
    ? Number(data.late_deduction_amount)
    : 0;
  const lunchOverDeductionMinutes = Number.isFinite(Number(data.lunch_over_deduction_minutes))
    ? Number(data.lunch_over_deduction_minutes)
    : 0;
  const lunchOverDeductionAmount = Number.isFinite(Number(data.lunch_over_deduction_amount))
    ? Number(data.lunch_over_deduction_amount)
    : 0;
  const noLeaveIncentive = Number.isFinite(Number(data.no_leave_incentive))
    ? Number(data.no_leave_incentive)
    : 0;
  const weeklyOffDays = Array.isArray(data.weekly_off_days)
    ? data.weekly_off_days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  const uniqueWeeklyOff = [...new Set(weeklyOffDays)];
  return {
    name,
    startTime,
    endTime,
    graceMinutes,
    lunchMinutes,
    uniqueWeeklyOff,
    lateDeductionMinutes,
    lateDeductionAmount,
    lunchOverDeductionMinutes,
    lunchOverDeductionAmount,
    noLeaveIncentive,
  };
}

async function updateShift(companyId, shiftId, data) {
  const parsed = parseShiftData(data);
  if (!parsed.name || !parsed.startTime || !parsed.endTime) {
    const error = new Error('shift_name, start_time and end_time are required');
    error.statusCode = 400;
    throw error;
  }

  const result = await pool.query(
    `UPDATE shifts SET
       shift_name = $2,
       start_time = $3,
       end_time = $4,
       grace_minutes = $5,
       lunch_minutes = $6,
       weekly_off_days = $7,
       late_deduction_minutes = $8,
       late_deduction_amount = $9,
       lunch_over_deduction_minutes = $10,
       lunch_over_deduction_amount = $11,
       no_leave_incentive = $12
     WHERE company_id = $1 AND id = $13
     RETURNING
       id,
       company_id,
       shift_name,
       start_time,
       end_time,
       grace_minutes,
       lunch_minutes,
       weekly_off_days,
       late_deduction_minutes,
       late_deduction_amount,
       lunch_over_deduction_minutes,
       lunch_over_deduction_amount,
       no_leave_incentive,
       created_at`,
    [
      companyId,
      parsed.name,
      parsed.startTime,
      parsed.endTime,
      parsed.graceMinutes,
      parsed.lunchMinutes,
      parsed.uniqueWeeklyOff,
      parsed.lateDeductionMinutes,
      parsed.lateDeductionAmount,
      parsed.lunchOverDeductionMinutes,
      parsed.lunchOverDeductionAmount,
      parsed.noLeaveIncentive,
      shiftId,
    ]
  );

  if (result.rowCount === 0) {
    const error = new Error('Shift not found');
    error.statusCode = 404;
    throw error;
  }
  return result.rows[0];
}

async function deleteShift(companyId, shiftId) {
  const result = await pool.query(
    'DELETE FROM shifts WHERE company_id = $1 AND id = $2 RETURNING id',
    [companyId, shiftId]
  );
  if (result.rowCount === 0) {
    const error = new Error('Shift not found');
    error.statusCode = 404;
    throw error;
  }
  return { deleted: true, id: shiftId };
}

module.exports = {
  listShifts,
  createShift,
  updateShift,
  deleteShift,
};

