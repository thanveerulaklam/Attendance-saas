const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { ymdFromDb, applyHolidayOverrides } = require('../utils/holidayDayOverrides');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function listHolidays(companyId, { year, month } = {}) {
  const conditions = ['company_id = $1'];
  const params = [companyId];
  let paramIndex = 2;

  if (year) {
    conditions.push(`EXTRACT(YEAR FROM holiday_date) = $${paramIndex}`);
    params.push(Number(year));
    paramIndex += 1;
  }
  if (month) {
    conditions.push(`EXTRACT(MONTH FROM holiday_date) = $${paramIndex}`);
    params.push(Number(month));
    paramIndex += 1;
  }

  const whereClause = conditions.join(' AND ');

  const result = await pool.query(
    `SELECT id, holiday_date, name, kind
     FROM company_holidays
     WHERE ${whereClause}
     ORDER BY holiday_date ASC`,
    params
  );

  return result.rows;
}

async function createHoliday(companyId, data) {
  const date = data.holiday_date || data.date;
  const name = (data.name || '').trim() || null;
  const kind = (data.kind || 'public').trim();

  if (!date) {
    throw new AppError('holiday_date is required', 400);
  }

  const result = await pool.query(
    `INSERT INTO company_holidays (company_id, holiday_date, name, kind)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, holiday_date)
     DO UPDATE SET name = COALESCE(EXCLUDED.name, company_holidays.name),
                   kind = EXCLUDED.kind
     RETURNING id, holiday_date, name, kind`,
    [companyId, date, name, kind]
  );

  return result.rows[0];
}

async function deleteHoliday(companyId, id) {
  const result = await pool.query(
    `DELETE FROM company_holidays
     WHERE company_id = $1 AND id = $2
     RETURNING id`,
    [companyId, id]
  );

  if (result.rowCount === 0) {
    throw new AppError('Holiday not found', 404);
  }
}

/**
 * Get weekly off days for a company. day_of_week: 0=Sunday, 6=Saturday.
 * @returns {Promise<number[]>} e.g. [0, 6] for Sun + Sat
 */
async function getWeeklyOffs(companyId) {
  const result = await pool.query(
    `SELECT day_of_week FROM company_weekly_offs
     WHERE company_id = $1
     ORDER BY day_of_week`,
    [companyId]
  );
  return result.rows.map((r) => Number(r.day_of_week));
}

/**
 * Set weekly off days. Replaces existing. days: array of 0-6 (e.g. [0, 6] for Sun, Sat).
 */
async function setWeeklyOffs(companyId, days) {
  const raw = Array.isArray(days) ? days : [];
  const validDays = raw.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const uniqueDays = [...new Set(validDays)];

  const client = await pool.connect();
  try {
    await client.query(
      'DELETE FROM company_weekly_offs WHERE company_id = $1',
      [companyId]
    );
    if (uniqueDays.length > 0) {
      for (const day of uniqueDays) {
        await client.query(
          `INSERT INTO company_weekly_offs (company_id, day_of_week)
           VALUES ($1, $2)
           ON CONFLICT (company_id, day_of_week) DO NOTHING`,
          [companyId, day]
        );
      }
    }
    return getWeeklyOffs(companyId);
  } finally {
    client.release();
  }
}

/**
 * Get all holiday date strings (YYYY-MM-DD) for a month: specific dates + weekly off days.
 * Uses default (first) shift's weekly_off_days when set; else company_weekly_offs.
 * Used by payroll to compute working days (paid holidays = no loss of pay).
 */
async function getHolidayDatesForMonth(companyId, year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const [holidaysResult, shiftResult, companyWeeklyResult, overrideResult] = await Promise.all([
    pool.query(
      `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date
       FROM company_holidays
       WHERE company_id = $1
         AND holiday_date >= $2::date
         AND holiday_date < $3::date`,
      [companyId, startStr, endStr]
    ),
    pool.query(
      `SELECT weekly_off_days FROM shifts WHERE company_id = $1 ORDER BY id LIMIT 1`,
      [companyId]
    ),
    pool.query(
      'SELECT day_of_week FROM company_weekly_offs WHERE company_id = $1',
      [companyId]
    ),
    pool.query(
      `SELECT to_char(override_date, 'YYYY-MM-DD') AS override_date, effect
       FROM company_day_overrides
       WHERE company_id = $1
         AND override_date >= $2::date
         AND override_date < $3::date`,
      [companyId, startStr, endStr]
    ),
  ]);

  const set = new Set(
    holidaysResult.rows.map((r) => ymdFromDb(r.holiday_date)).filter(Boolean)
  );

  let weeklyOffDays = [];
  const shiftRow = shiftResult.rows[0];
  if (shiftRow && shiftRow.weekly_off_days && Array.isArray(shiftRow.weekly_off_days) && shiftRow.weekly_off_days.length > 0) {
    weeklyOffDays = shiftRow.weekly_off_days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  }
  if (weeklyOffDays.length === 0) {
    weeklyOffDays = companyWeeklyResult.rows.map((r) => Number(r.day_of_week));
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(Date.UTC(year, month - 1, d));
    const dayOfWeek = date.getUTCDay();
    if (weeklyOffDays.includes(dayOfWeek)) {
      set.add(date.toISOString().slice(0, 10));
    }
  }

  applyHolidayOverrides(set, overrideResult.rows);
  return set;
}

function assertOverrideDate(date) {
  const ymd = String(date || '').slice(0, 10);
  if (!DATE_RE.test(ymd)) {
    throw new AppError('A valid date (YYYY-MM-DD) is required', 400);
  }
  return ymd;
}

function assertOverrideEffect(effect) {
  const value = String(effect || '').trim().toLowerCase();
  if (value !== 'working' && value !== 'holiday') {
    throw new AppError('effect must be "working" or "holiday"', 400);
  }
  return value;
}

function monthBounds(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) return null;
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${String(m).padStart(2, '0')}-01`,
    to: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

function resolveOverrideRange({ from, to, year, month } = {}) {
  if (from || to) {
    return { from: assertOverrideDate(from), to: assertOverrideDate(to) };
  }
  const bounds = monthBounds(year, month);
  if (!bounds) {
    throw new AppError('from and to, or year and month, are required', 400);
  }
  return bounds;
}

async function listDayOverrides(companyId, range) {
  const { from, to } = resolveOverrideRange(range);
  const result = await pool.query(
    `SELECT id, to_char(override_date, 'YYYY-MM-DD') AS override_date, effect, note
     FROM company_day_overrides
     WHERE company_id = $1
       AND override_date >= $2::date
       AND override_date <= $3::date
     ORDER BY override_date ASC`,
    [companyId, from, to]
  );
  return result.rows.map((row) => ({
    id: row.id,
    override_date: ymdFromDb(row.override_date),
    effect: row.effect,
    note: row.note || null,
  }));
}

async function upsertDayOverride(companyId, data, userId = null) {
  const date = assertOverrideDate(data.date || data.override_date);
  const effect = assertOverrideEffect(data.effect);
  const note = data.note != null && String(data.note).trim() !== ''
    ? String(data.note).trim().slice(0, 255)
    : null;
  const result = await pool.query(
    `INSERT INTO company_day_overrides (
       company_id, override_date, effect, note, created_by, updated_at
     )
     VALUES ($1, $2::date, $3, $4, $5, NOW())
     ON CONFLICT (company_id, override_date)
     DO UPDATE SET effect = EXCLUDED.effect,
                   note = EXCLUDED.note,
                   updated_at = NOW()
     RETURNING id, to_char(override_date, 'YYYY-MM-DD') AS override_date, effect, note`,
    [companyId, date, effect, note, userId || null]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    override_date: ymdFromDb(row.override_date),
    effect: row.effect,
    note: row.note || null,
  };
}

async function deleteDayOverride(companyId, date) {
  const ymd = assertOverrideDate(date);
  const result = await pool.query(
    `DELETE FROM company_day_overrides
     WHERE company_id = $1 AND override_date = $2::date
     RETURNING id`,
    [companyId, ymd]
  );
  if (result.rowCount === 0) {
    throw new AppError('Day override not found', 404);
  }
  return { override_date: ymd };
}

module.exports = {
  listHolidays,
  createHoliday,
  deleteHoliday,
  getWeeklyOffs,
  setWeeklyOffs,
  getHolidayDatesForMonth,
  listDayOverrides,
  upsertDayOverride,
  deleteDayOverride,
};

