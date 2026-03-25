#!/usr/bin/env node
/**
 * Inserts four manual punches for hours-based shift QA (expected ~12.27h total for 10h required).
 *
 *   IN  06:59, OUT 07:03, IN 09:34, OUT 21:46 (same calendar day, Asia/Kolkata)
 *
 * Usage:
 *   node scripts/manual-test-hours-based-punches.js --company=1 --employee=42
 *   node scripts/manual-test-hours-based-punches.js --company=1 --employee=42 --date=2026-03-25
 *   node scripts/manual-test-hours-based-punches.js --company=1 --employee=42 --replace
 *   node scripts/manual-test-hours-based-punches.js --list-employees-for-company=4
 *
 * --employee must be the database id (not the on-screen employee code). Use --list-employees-for-company to see ids.
 * --replace  Deletes existing punches for that employee on that date first (UTC day window, same as API).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../src/config/database');
const { addManualPunch } = require('../src/services/attendanceService');

const TZ = 'Asia/Kolkata';

function parseArgs() {
  const out = { companyId: null, employeeId: null, date: null, replace: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--replace') out.replace = true;
    else if (a.startsWith('--company=')) out.companyId = Number(a.slice('--company='.length));
    else if (a.startsWith('--employee=')) out.employeeId = Number(a.slice('--employee='.length));
    else if (a.startsWith('--date=')) out.date = a.slice('--date='.length).trim();
  }
  return out;
}

function todayYmdKolkata() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function assertEmployeeForCompany(companyId, employeeId) {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT id, company_id, name, employee_code, status FROM employees WHERE id = $1`,
      [employeeId]
    );
    if (r.rowCount === 0) {
      throw new Error(
        `No employee with id=${employeeId}. The number in the app is often the employee code, not the database id. ` +
          `Run: npm run manual-test-punches -- --list-employees-for-company=${companyId}`
      );
    }
    const row = r.rows[0];
    if (Number(row.company_id) !== Number(companyId)) {
      throw new Error(
        `Employee id=${employeeId} is "${row.name}" (code ${row.employee_code}) under company_id=${row.company_id}, not ${companyId}. ` +
          `Re-run with --company=${row.company_id} or pick an id from that company.`
      );
    }
    if (row.status !== 'active') {
      throw new Error(
        `Employee ${employeeId} (${row.name}) has status="${row.status}". Activate the employee in the app first.`
      );
    }
  } finally {
    client.release();
  }
}

async function listEmployeesForCompany(companyId) {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT id, employee_code, name, status FROM employees WHERE company_id = $1 ORDER BY name`,
      [companyId]
    );
    console.log(`Employees for company_id=${companyId} (use --employee=<id> with the id column):\n`);
    console.table(r.rows);
  } finally {
    client.release();
  }
}

async function main() {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--list-employees-for-company=')) {
      const cid = Number(a.slice('--list-employees-for-company='.length));
      if (!cid) {
        console.error('Usage: --list-employees-for-company=<company_id>');
        process.exit(1);
      }
      await listEmployeesForCompany(cid);
      return;
    }
  }

  const { companyId, employeeId, date: dateArg, replace } = parseArgs();
  if (!companyId || !employeeId) {
    console.error(
      'Usage: node scripts/manual-test-hours-based-punches.js --company=<id> --employee=<id> [--date=YYYY-MM-DD] [--replace]\n' +
        '       node scripts/manual-test-hours-based-punches.js --list-employees-for-company=<id>'
    );
    process.exit(1);
  }

  await assertEmployeeForCompany(companyId, employeeId);

  const ymd = dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg) ? dateArg : todayYmdKolkata();
  const [y, m, d] = ymd.split('-').map(Number);
  const dayStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));

  const punches = [
    { punch_time: `${ymd}T06:59:00+05:30`, punchType: 'in' },
    { punch_time: `${ymd}T07:03:00+05:30`, punchType: 'out' },
    { punch_time: `${ymd}T09:34:00+05:30`, punchType: 'in' },
    { punch_time: `${ymd}T21:46:00+05:30`, punchType: 'out' },
  ];

  const client = await pool.connect();
  try {
    if (replace) {
      const del = await client.query(
        `DELETE FROM attendance_logs
         WHERE company_id = $1 AND employee_id = $2
           AND punch_time >= $3 AND punch_time < $4`,
        [companyId, employeeId, dayStart.toISOString(), dayEnd.toISOString()]
      );
      console.log(`Removed ${del.rowCount} existing punch(es) for employee ${employeeId} on ${ymd}.`);
    }
  } finally {
    client.release();
  }

  for (const p of punches) {
    const result = await addManualPunch(companyId, {
      employeeId,
      punch_time: p.punch_time,
      punchType: p.punchType,
    });
    console.log(`${p.punchType.toUpperCase()} ${p.punch_time} → id ${result.punch.id}`);
  }

  console.log('\nDone. Expected: total inside ≈12.27h, present/full day for required 10h (hours_based).');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
