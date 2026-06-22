const { pool } = require('../config/database');

/**
 * Persist punches we could not import so ops can recover them (never silent loss).
 */
async function recordAdmsRejections(companyId, deviceId, admsSn, rejections) {
  if (!rejections || rejections.length === 0) return;

  const values = [];
  const placeholders = [];
  rejections.forEach((r, idx) => {
    const base = idx * 7;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
    );
    values.push(
      companyId,
      deviceId,
      admsSn || null,
      String(r.employeeCode || '').trim(),
      r.punchTime instanceof Date ? r.punchTime.toISOString() : r.punchTime || null,
      r.reason,
      r.rawLine || null
    );
  });

  await pool.query(
    `INSERT INTO adms_punch_rejections
       (company_id, device_id, adms_sn, employee_code, punch_time, reason, raw_line)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

module.exports = { recordAdmsRejections };
