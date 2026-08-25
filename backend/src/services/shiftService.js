const { pool } = require('../config/database');
const {
  parseBreaksInput,
  normalizeLateMode,
  normalizeOvertimePayMode,
  normalizeOvertimeWindow,
} = require('../utils/shiftRules');

function breakRowToApi(row) {
  return {
    id: Number(row.id),
    name: row.name,
    allotted_minutes: Number(row.allotted_minutes || 0),
    window_start: row.window_start ? String(row.window_start).slice(0, 5) : null,
    window_end: row.window_end ? String(row.window_end).slice(0, 5) : null,
    tracking: row.tracking || 'punch',
    paid: row.paid === true,
    over_deduction_mode: row.over_deduction_mode || 'none',
    over_deduction_amount: Number(row.over_deduction_amount || 0),
    over_deduction_minutes: Number(row.over_deduction_minutes || 0),
    sort_order: Number(row.sort_order || 0),
  };
}

async function loadBreaksByShiftIds(shiftIds, client = pool) {
  const ids = [...new Set((shiftIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const result = await client.query(
    `SELECT
       id, company_id, shift_id, name, allotted_minutes, window_start, window_end,
       tracking, paid, over_deduction_mode, over_deduction_amount, over_deduction_minutes, sort_order
     FROM shift_breaks
     WHERE shift_id = ANY($1::bigint[])
     ORDER BY sort_order ASC, id ASC`,
    [ids]
  );
  for (const row of result.rows) {
    const sid = Number(row.shift_id);
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push(breakRowToApi(row));
  }
  return map;
}

async function attachBreaksToShiftRows(rows, client = pool) {
  const map = await loadBreaksByShiftIds(
    rows.map((r) => r.id),
    client
  );
  return rows.map((row) => ({
    ...row,
    breaks: map.get(Number(row.id)) || [],
  }));
}

function lunchFieldsFromBreaks(breaks) {
  const lunch =
    (breaks || []).find((b) => String(b.name).toLowerCase() === 'lunch') || (breaks || [])[0];
  if (!lunch) {
    return {
      lunchMinutes: 0,
      lunchOverDeductionMinutes: 0,
      lunchOverDeductionAmount: 0,
    };
  }
  return {
    lunchMinutes: Number(lunch.allottedMinutes || 0),
    lunchOverDeductionMinutes: Number(lunch.overDeductionMinutes || 0),
    lunchOverDeductionAmount: Number(lunch.overDeductionAmount || 0),
  };
}

function defaultBreaksFromLunchFields(parsed) {
  return [
    {
      name: 'Lunch',
      allottedMinutes: parsed.lunchMinutes,
      windowStart: null,
      windowEnd: null,
      tracking: 'punch',
      paid: false,
      overDeductionMode:
        parsed.lunchOverDeductionAmount > 0 && parsed.lunchOverDeductionMinutes > 0
          ? 'per_day'
          : 'none',
      overDeductionAmount: parsed.lunchOverDeductionAmount,
      overDeductionMinutes: parsed.lunchOverDeductionMinutes,
      sortOrder: 0,
    },
  ];
}

async function replaceShiftBreaks(client, companyId, shiftId, breaks) {
  await client.query(`DELETE FROM shift_breaks WHERE shift_id = $1 AND company_id = $2`, [
    shiftId,
    companyId,
  ]);
  const list = Array.isArray(breaks) ? breaks : [];
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    await client.query(
      `INSERT INTO shift_breaks (
         company_id, shift_id, name, allotted_minutes, window_start, window_end,
         tracking, paid, over_deduction_mode, over_deduction_amount, over_deduction_minutes, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        companyId,
        shiftId,
        b.name,
        b.allottedMinutes,
        b.windowStart,
        b.windowEnd,
        b.tracking,
        b.paid,
        b.overDeductionMode,
        b.overDeductionAmount,
        b.overDeductionMinutes,
        Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : i,
      ]
    );
  }
}

const SHIFT_COLUMNS = `
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
       late_deduction_mode,
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
       overtime_pay_mode,
       overtime_window,
       created_at`;

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
    lateDeductionMode: 'per_day',
    overtimePayMode: 'per_hour',
    overtimeWindow: 'total_extra',
    breaks: (parsed.breaks || []).map((b) => ({
      ...b,
      overDeductionMode: 'none',
      overDeductionAmount: 0,
      overDeductionMinutes: 0,
    })),
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
    `SELECT ${SHIFT_COLUMNS}
     FROM shifts
     WHERE company_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [companyId, limitNum, offset]
  );

  const data = await attachBreaksToShiftRows(result.rows);
  return { data, total, page: pageNum, limit: limitNum };
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
  const resolved = resolveBreaksForSave(parsedForDb);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
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
         late_deduction_mode,
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
         overtime_pay_mode,
         overtime_window
       )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       RETURNING ${SHIFT_COLUMNS}`,
      [
        companyId,
        parsedForDb.name,
        parsedForDb.startTime,
        parsedForDb.endTime,
        parsedForDb.graceMinutes,
        resolved.lunchMinutes,
        parsedForDb.uniqueWeeklyOff,
        parsedForDb.lateDeductionMinutes,
        parsedForDb.lateDeductionAmount,
        parsedForDb.lateDeductionMode,
        resolved.lunchOverDeductionMinutes,
        resolved.lunchOverDeductionAmount,
        parsedForDb.noLeaveIncentive,
        parsedForDb.paidLeaveDays,
        parsedForDb.attendanceMode,
        parsedForDb.monthlyPermissionHours,
        parsedForDb.halfDayHours,
        parsedForDb.fullDayHours,
        parsedForDb.requiredHoursPerDay,
        parsedForDb.allowOvertime,
        parsedForDb.overtimeRatePerHour,
        parsedForDb.overtimeRateMode,
        parsedForDb.overtimePayMode,
        parsedForDb.overtimeWindow,
      ]
    );
    const created = result.rows[0];
    await replaceShiftBreaks(client, companyId, created.id, resolved.breaks);
    await client.query('COMMIT');
    const withBreaks = await attachBreaksToShiftRows([created], client);
    return withBreaks[0];
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

function resolveBreaksForSave(parsed) {
  if (Array.isArray(parsed.breaks) && parsed.breaks.length > 0) {
    const lunch = lunchFieldsFromBreaks(parsed.breaks);
    return { breaks: parsed.breaks, ...lunch };
  }
  const breaks = defaultBreaksFromLunchFields(parsed);
  return {
    breaks,
    lunchMinutes: parsed.lunchMinutes,
    lunchOverDeductionMinutes: parsed.lunchOverDeductionMinutes,
    lunchOverDeductionAmount: parsed.lunchOverDeductionAmount,
  };
}

function parseShiftData(data) {
  const name = String(data.shift_name || '').trim();
  const startTime = String(data.start_time || '').trim();
  const endTime = String(data.end_time || '').trim();
  const graceMinutes = Number.isFinite(Number(data.grace_minutes))
    ? Number(data.grace_minutes)
    : 0;
  const modeRaw = String(data.attendance_mode || 'day_based').toLowerCase();
  let attendanceMode = 'day_based';
  if (modeRaw === 'hours_based') attendanceMode = 'hours_based';
  else if (modeRaw === 'day_based') attendanceMode = 'day_based';
  const defaultLunchMinutes = attendanceMode === 'hours_based' ? 0 : 60;
  const lunchMinutes = Number.isFinite(Number(data.lunch_minutes)) && Number(data.lunch_minutes) >= 0
    ? Number(data.lunch_minutes)
    : defaultLunchMinutes;
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
  const requiredHoursPerDayRaw = Number(data.required_hours_per_day);
  const requiredHoursPerDay = Number.isFinite(requiredHoursPerDayRaw)
    ? Math.min(24, Math.max(1, requiredHoursPerDayRaw))
    : 8;
  const halfDayHoursRaw = Number(data.half_day_hours);
  const halfDayHours = Number.isFinite(halfDayHoursRaw)
    ? Math.min(24, Math.max(0, halfDayHoursRaw))
    : 0;
  const fullDayRaw = Number(data.full_day_hours);
  const fullDayHours = Number.isFinite(fullDayRaw)
    ? Math.min(24, Math.max(0, fullDayRaw))
    : 0;
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
  const lateDeductionMode = normalizeLateMode(data.late_deduction_mode);
  const overtimePayMode = normalizeOvertimePayMode(data.overtime_pay_mode);
  const overtimeWindow = normalizeOvertimeWindow(data.overtime_window);
  const weeklyOffDays = Array.isArray(data.weekly_off_days)
    ? data.weekly_off_days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  const uniqueWeeklyOff = [...new Set(weeklyOffDays)];
  const breaks = parseBreaksInput(data.breaks);
  return {
    name,
    startTime,
    endTime,
    graceMinutes,
    lunchMinutes,
    uniqueWeeklyOff,
    lateDeductionMinutes,
    lateDeductionAmount,
    lateDeductionMode,
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
    overtimePayMode,
    overtimeWindow,
    breaks,
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
      'Day-based shift must end on the same calendar day after start time.'
    );
    err.statusCode = 400;
    throw err;
  }
  if (attendanceMode === 'day_based') {
    const half = Number(parsed.halfDayHours);
    const full = Number(parsed.fullDayHours);
    if (!Number.isFinite(half) || half <= 0) {
      const err = new Error('Minimum half-day required hours must be greater than 0 for day-based shifts.');
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isFinite(full) || full <= 0) {
      const err = new Error('Minimum full-day required hours must be greater than 0 for day-based shifts.');
      err.statusCode = 400;
      throw err;
    }
    if (full <= half) {
      const err = new Error('Minimum full-day required hours must be greater than minimum half-day required hours.');
      err.statusCode = 400;
      throw err;
    }
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
  const resolved = resolveBreaksForSave(parsedForDb);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE shifts SET
         shift_name = $2,
         start_time = $3,
         end_time = $4,
         grace_minutes = $5,
         lunch_minutes = $6,
         weekly_off_days = $7,
         late_deduction_minutes = $8,
         late_deduction_amount = $9,
         late_deduction_mode = $10,
         lunch_over_deduction_minutes = $11,
         lunch_over_deduction_amount = $12,
         no_leave_incentive = $13,
         paid_leave_days = $14,
         attendance_mode = $15,
         required_hours_per_day = $16,
         half_day_hours = $17,
         full_day_hours = $18,
         monthly_permission_hours = $19,
         allow_overtime = $20,
         overtime_rate_per_hour = $21,
         overtime_rate_mode = $22,
         overtime_pay_mode = $23,
         overtime_window = $24
       WHERE company_id = $1 AND id = $25
       RETURNING ${SHIFT_COLUMNS}`,
      [
        companyId,
        parsedForDb.name,
        parsedForDb.startTime,
        parsedForDb.endTime,
        parsedForDb.graceMinutes,
        resolved.lunchMinutes,
        parsedForDb.uniqueWeeklyOff,
        parsedForDb.lateDeductionMinutes,
        parsedForDb.lateDeductionAmount,
        parsedForDb.lateDeductionMode,
        resolved.lunchOverDeductionMinutes,
        resolved.lunchOverDeductionAmount,
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
        parsedForDb.overtimePayMode,
        parsedForDb.overtimeWindow,
        shiftId,
      ]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      const error = new Error('Shift not found');
      error.statusCode = 404;
      throw error;
    }
    await replaceShiftBreaks(client, companyId, shiftId, resolved.breaks);
    await client.query('COMMIT');
    const withBreaks = await attachBreaksToShiftRows(result.rows, client);
    return withBreaks[0];
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
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
  loadBreaksByShiftIds,
};

