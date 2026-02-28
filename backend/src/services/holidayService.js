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

module.exports = {
  listHolidays,
  createHoliday,
  deleteHoliday,
};

