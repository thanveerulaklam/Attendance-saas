#!/usr/bin/env node
/**
 * List recent ADMS punches we could not import (unknown code, wrong branch, parse failure).
 * Usage: node scripts/list-adms-rejections.js [company_id] [hours_back]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../src/config/database');

const companyId = process.argv[2] ? Number(process.argv[2]) : null;
const hoursBack = process.argv[3] ? Number(process.argv[3]) : 48;

(async () => {
  const params = [hoursBack];
  let where = `created_at >= NOW() - ($1::int || ' hours')::interval`;
  if (companyId) {
    params.push(companyId);
    where += ` AND company_id = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT id, company_id, adms_sn, employee_code, punch_time, reason, created_at,
            LEFT(raw_line, 80) AS raw_preview
     FROM adms_punch_rejections
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT 200`,
    params
  );

  console.log(`Rejections (last ${hoursBack}h${companyId ? `, company ${companyId}` : ''}):`, result.rowCount);
  for (const row of result.rows) {
    console.log(row);
  }
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
