#!/usr/bin/env node
/**
 * Check whether an employee's punches exist in DB for a date.
 * Usage: node scripts/check-employee-punch.js 83 2026-06-22
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../src/config/database');
const { SQL_PUNCH_IST_DATE } = require('../src/utils/istDate');

const code = String(process.argv[2] || '').trim();
const dateStr = String(process.argv[3] || '').trim();

if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  console.error('Usage: node scripts/check-employee-punch.js <employee_code> <YYYY-MM-DD>');
  process.exit(1);
}

(async () => {
  const emp = await pool.query(
    `SELECT e.id, e.name, e.employee_code, e.branch_id, e.status, b.name AS branch_name
     FROM employees e
     LEFT JOIN branches b ON b.id = e.branch_id
     WHERE e.employee_code = $1
     ORDER BY e.company_id
     LIMIT 5`,
    [code]
  );
  console.log('Employee(s):', emp.rows);

  if (emp.rowCount === 0) {
    await pool.end();
    process.exit(1);
  }

  for (const row of emp.rows) {
    const logs = await pool.query(
      `SELECT id, punch_time, punch_type, device_id, branch_id,
              ${SQL_PUNCH_IST_DATE} AS ist_date
       FROM attendance_logs
       WHERE employee_id = $1 AND ${SQL_PUNCH_IST_DATE} = $2::date
       ORDER BY punch_time`,
      [row.id, dateStr]
    );
    console.log(`\nPunches for ${row.name} (${row.employee_code}) on ${dateStr}:`, logs.rows);
  }

  const devices = await pool.query(
    `SELECT id, name, adms_sn, adms_attlog_stamp, adms_force_full_sync, last_seen_at
     FROM devices WHERE adms_sn IS NOT NULL ORDER BY id`
  );
  console.log('\nDevices:', devices.rows);
  await pool.end();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
