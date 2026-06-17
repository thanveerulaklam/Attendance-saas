#!/usr/bin/env node
/**
 * One-off repair: create employee_salary_payments if migration 065 was baselined without running.
 * Uses backend .env (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) — not DATABASE_URL.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

async function main() {
  const client = await pool.connect();
  try {
    const exists = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'employee_salary_payments'
       ) AS exists`
    );
    if (exists.rows[0]?.exists === true) {
      console.log('employee_salary_payments table already exists — nothing to do.');
      return;
    }

    const sqlPath = path.join(__dirname, '..', 'migrations', '065_employee_salary_payments.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Creating employee_salary_payments table...');
    await client.query(sql);
    console.log('Done. Restart the backend if payroll still fails, then reload the Payroll page.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Repair failed:', err.message || err);
  process.exit(1);
});
