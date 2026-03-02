const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

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

  const [holidaysResult, shiftResult, companyWeeklyResult] = await Promise.all([
    pool.query(
      `SELECT holiday_date FROM company_holidays
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
  ]);

  const set = new Set(
    holidaysResult.rows.map((r) => r.holiday_date.toISOString().slice(0, 10))
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

  return set;
}

module.exports = {
  listHolidays,
  createHoliday,
  deleteHoliday,
  getWeeklyOffs,
  setWeeklyOffs,
  getHolidayDatesForMonth,
};

