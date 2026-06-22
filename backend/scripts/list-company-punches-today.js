#!/usr/bin/env node
/**
 * List today's attendance punches for a company (IST date).
 * Usage: node scripts/list-company-punches-today.js 5 2026-06-22
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../src/config/database');
const { SQL_PUNCH_IST_DATE } = require('../src/utils/istDate');

const companyId = Number(process.argv[2]);
const dateStr = String(process.argv[3] || '').trim();

if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  console.error('Usage: node scripts/list-company-punches-today.js <company_id> <YYYY-MM-DD>');
  process.exit(1);
}

(async () => {
  const r = await pool.query(
    `SELECT e.employee_code, e.name, al.punch_time, al.punch_type, al.device_id
     FROM attendance_logs al
     JOIN employees e ON e.id = al.employee_id
     WHERE al.company_id = $1 AND ${SQL_PUNCH_IST_DATE} = $2::date
     ORDER BY al.punch_time`,
    [companyId, dateStr]
  );
  console.log(`Company ${companyId} punches on ${dateStr}: ${r.rowCount} row(s)`);
  for (const row of r.rows) {
    const t = new Date(row.punch_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.log(`  ${row.employee_code} ${row.name} | ${t} ${row.punch_type} | device ${row.device_id}`);
  }
  const codes = new Set(r.rows.map((x) => x.employee_code));
  console.log(`Unique employee codes with punches: ${codes.size}`);
  await pool.end();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
