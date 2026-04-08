const { pool } = require('../config/database');

async function fetchCompanyShiftPolicy(companyId) {
  const r = await pool.query(
    `SELECT hours_based_shifts_only, shifts_compact_ui FROM companies WHERE id = $1`,
    [companyId]
  );
  return r.rows[0] || { hours_based_shifts_only: false, shifts_compact_ui: false };
}

/** Tharagai-style: do not persist manual deduction / incentive columns; payroll uses worked hours. */
function applyNeutralLegacyFieldsForCompact(parsed) {
  return {
    ...parsed,
    uniqueWeeklyOff: [],
    lateDeductionMinutes: 0,
    lateDeductionAmount: 0,
    lunchOverDeductionMinutes: 0,
    lunchOverDeductionAmount: 0,
    noLeaveIncentive: 0,
    allowOvertime: false,
    overtimeRatePerHour: 0,
    overtimeRateMode: 'fixed',
  };
}

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
       paid_leave_days,
       attendance_mode,
       monthly_permission_hours,
       half_day_hours,
       full_day_hours,
       required_hours_per_day,
       allow_overtime,
       overtime_rate_per_hour,
       overtime_rate_mode,
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
  validateShiftTimes(parsed);
  const {
    name,
    startTime,
    endTime,
    graceMinutes,
    lunchMinutes,
    paidLeaveDays,
    attendanceMode,
    monthlyPermissionHours,
    halfDayHours,
    fullDayHours,
    requiredHoursPerDay,
    allowOvertime,
    overtimeRatePerHour,
    overtimeRateMode,
  } = parsed;

  if (!name || !startTime || !endTime) {
    const error = new Error('shift_name, start_time and end_time are required');
    error.statusCode = 400;
    throw error;
  }

  const policy = await fetchCompanyShiftPolicy(companyId);
  if (policy.hours_based_shifts_only === true && attendanceMode !== 'hours_based') {
    const err = new Error(
      'This company only allows hours-based shifts. Change attendance mode to Hours based or contact support.'
    );
    err.statusCode = 400;
    throw err;
  }
  const parsedForDb =
    policy.shifts_compact_ui === true ? applyNeutralLegacyFieldsForCompact(parsed) : parsed;

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
       no_leave_incentive,
       paid_leave_days,
       attendance_mode,
       monthly_permission_hours,
       half_day_hours,
       full_day_hours,
       required_hours_per_day,
       allow_overtime,
      overtime_rate_per_hour,
      overtime_rate_mode
     )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
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
       paid_leave_days,
       attendance_mode,
       monthly_permission_hours,
       half_day_hours,
       full_day_hours,
       required_hours_per_day,
       allow_overtime,
       overtime_rate_per_hour,
       overtime_rate_mode,
       created_at`,
    [
      companyId,
      name,
      startTime,
      endTime,
      graceMinutes,
      lunchMinutes,
      parsedForDb.uniqueWeeklyOff,
      parsedForDb.lateDeductionMinutes,
      parsedForDb.lateDeductionAmount,
      parsedForDb.lunchOverDeductionMinutes,
      parsedForDb.lunchOverDeductionAmount,
      parsedForDb.noLeaveIncentive,
      paidLeaveDays,
      attendanceMode,
      monthlyPermissionHours,
      halfDayHours,
      fullDayHours,
      requiredHoursPerDay,
      allowOvertime,
      overtimeRatePerHour,
      overtimeRateMode,
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
  const paidLeaveDays = Number.isFinite(Number(data.paid_leave_days))
    ? Math.max(0, Number(data.paid_leave_days))
    : 0;
  const modeRaw = String(data.attendance_mode || 'day_based').toLowerCase();
  let attendanceMode = 'day_based';
  if (modeRaw === 'hours_based') attendanceMode = 'hours_based';
  else if (modeRaw === 'shift_based') attendanceMode = 'shift_based';
  else if (modeRaw === 'day_based') attendanceMode = 'day_based';
  const requiredHoursPerDayRaw = Number(data.required_hours_per_day);
  const requiredHoursPerDay = Number.isFinite(requiredHoursPerDayRaw)
    ? Math.min(24, Math.max(1, requiredHoursPerDayRaw))
    : 8;
  const halfDayHoursRaw = Number(data.half_day_hours);
  const halfDayHours = Number.isFinite(halfDayHoursRaw)
    ? Math.min(24, Math.max(0, halfDayHoursRaw))
    : null;
  const rawFullDay = data.full_day_hours;
  let fullDayHours = null;
  if (rawFullDay !== null && rawFullDay !== undefined && rawFullDay !== '') {
    const n = Number(rawFullDay);
    if (Number.isFinite(n)) {
      fullDayHours = Math.min(24, Math.max(0, n));
    }
  }
  const monthlyPermissionHoursRaw = Number(data.monthly_permission_hours);
  const monthlyPermissionHours = Number.isFinite(monthlyPermissionHoursRaw)
    ? Math.max(0, monthlyPermissionHoursRaw)
    : 0;
  const allowOvertime = data.allow_overtime !== false;
  const overtimeRatePerHourRaw = Number(data.overtime_rate_per_hour);
  const overtimeRatePerHour = Number.isFinite(overtimeRatePerHourRaw)
    ? Math.max(0, overtimeRatePerHourRaw)
    : 0;
  const overtimeRateModeRaw = String(data.overtime_rate_mode || 'fixed').toLowerCase();
  const overtimeRateMode =
    overtimeRateModeRaw === 'auto' ? 'auto' : 'fixed';
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
    paidLeaveDays,
    attendanceMode,
    monthlyPermissionHours,
    halfDayHours,
    fullDayHours,
    requiredHoursPerDay,
    allowOvertime,
    overtimeRatePerHour,
    overtimeRateMode,
  };
}

function validateShiftTimes(parsed) {
  const sm = /^(\d{1,2}):(\d{2})/.exec(String(parsed.startTime || '').trim());
  const em = /^(\d{1,2}):(\d{2})/.exec(String(parsed.endTime || '').trim());
  if (!sm || !em) return;
  const startMin = Number(sm[1]) * 60 + Number(sm[2]);
  const endMin = Number(em[1]) * 60 + Number(em[2]);
  const { attendanceMode } = parsed;
  if (attendanceMode === 'day_based' && endMin < startMin) {
    const err = new Error(
      'Day-based shift must end on the same calendar day after start time. Use Shift based (overnight) for night shifts.'
    );
    err.statusCode = 400;
    throw err;
  }
  if (attendanceMode === 'shift_based' && endMin >= startMin) {
    const err = new Error(
      'Shift based (overnight) requires end time before start time on the clock (e.g. 22:00 to 06:00).'
    );
    err.statusCode = 400;
    throw err;
  }
}

async function updateShift(companyId, shiftId, data) {
  const parsed = parseShiftData(data);
  validateShiftTimes(parsed);
  if (!parsed.name || !parsed.startTime || !parsed.endTime) {
    const error = new Error('shift_name, start_time and end_time are required');
    error.statusCode = 400;
    throw error;
  }

  const policy = await fetchCompanyShiftPolicy(companyId);
  if (policy.hours_based_shifts_only === true && parsed.attendanceMode !== 'hours_based') {
    const err = new Error(
      'This company only allows hours-based shifts. Change attendance mode to Hours based or contact support.'
    );
    err.statusCode = 400;
    throw err;
  }
  const parsedForDb =
    policy.shifts_compact_ui === true ? applyNeutralLegacyFieldsForCompact(parsed) : parsed;

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
       no_leave_incentive = $12,
       paid_leave_days = $13,
       attendance_mode = $14,
       required_hours_per_day = $15,
       half_day_hours = $16,
       full_day_hours = $17,
       monthly_permission_hours = $18,
       allow_overtime = $19,
       overtime_rate_per_hour = $20,
       overtime_rate_mode = $21
     WHERE company_id = $1 AND id = $22
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
       paid_leave_days,
       attendance_mode,
       monthly_permission_hours,
       half_day_hours,
       full_day_hours,
       required_hours_per_day,
       allow_overtime,
       overtime_rate_per_hour,
       overtime_rate_mode,
       created_at`,
    [
      companyId,
      parsedForDb.name,
      parsedForDb.startTime,
      parsedForDb.endTime,
      parsedForDb.graceMinutes,
      parsedForDb.lunchMinutes,
      parsedForDb.uniqueWeeklyOff,
      parsedForDb.lateDeductionMinutes,
      parsedForDb.lateDeductionAmount,
      parsedForDb.lunchOverDeductionMinutes,
      parsedForDb.lunchOverDeductionAmount,
      parsedForDb.noLeaveIncentive,
      parsedForDb.paidLeaveDays,
      parsedForDb.attendanceMode,
      parsedForDb.requiredHoursPerDay,
      parsedForDb.halfDayHours,
      parsedForDb.fullDayHours,
      parsedForDb.monthlyPermissionHours,
      parsedForDb.allowOvertime,
      parsedForDb.overtimeRatePerHour,
      parsedForDb.overtimeRateMode,
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

