require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/database');

const DEFAULTS = {
  year: 2026,
  month: 3,
  employees: 20,
  company: 'QA Test Company',
  branch: 'QA Main Branch',
  resetCompany: true,
  adminEmail: 'qa-admin@test-company.local',
  adminPassword: 'Admin@123',
  shiftName: 'QA General Shift',
};

const WEEKEND_ISO_DAY = new Set([6, 7]); // Sat/Sun

function parseBoolean(v, defaultValue) {
  if (v == null || v === '') return defaultValue;
  const norm = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(norm)) return true;
  if (['0', 'false', 'no', 'n'].includes(norm)) return false;
  return defaultValue;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
    parsed[key] = value;
    if (value !== 'true') i += 1;
  }
  return {
    year: Number(parsed.year ?? process.env.TESTDATA_YEAR ?? DEFAULTS.year),
    month: Number(parsed.month ?? process.env.TESTDATA_MONTH ?? DEFAULTS.month),
    employees: Number(parsed.employees ?? process.env.TESTDATA_EMPLOYEES ?? DEFAULTS.employees),
    company: String(parsed.company ?? process.env.TESTDATA_COMPANY ?? DEFAULTS.company),
    branch: String(parsed.branch ?? process.env.TESTDATA_BRANCH ?? DEFAULTS.branch),
    resetCompany: parseBoolean(parsed['reset-company'] ?? process.env.TESTDATA_RESET_COMPANY, DEFAULTS.resetCompany),
    adminEmail: String(parsed['admin-email'] ?? process.env.TESTDATA_ADMIN_EMAIL ?? DEFAULTS.adminEmail),
    adminPassword: String(parsed['admin-password'] ?? process.env.TESTDATA_ADMIN_PASSWORD ?? DEFAULTS.adminPassword),
    shiftName: String(parsed['shift-name'] ?? process.env.TESTDATA_SHIFT_NAME ?? DEFAULTS.shiftName),
  };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function atUtcIso(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0)).toISOString();
}

function isoWeekday(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const wd = d.getUTCDay(); // 0 Sun ... 6 Sat
  return wd === 0 ? 7 : wd;
}

function scenarioForDay(employeeIndex, day) {
  const bucket = (employeeIndex * 31 + day * 17) % 100;
  if (bucket < 48) return 'regular';
  if (bucket < 62) return 'late';
  if (bucket < 72) return 'overtime';
  if (bucket < 80) return 'halfday';
  if (bucket < 87) return 'permission';
  if (bucket < 93) return 'missingOut';
  return 'absent';
}

function buildPunchesForScenario(year, month, day, scenario) {
  const startHour = 9;
  const startMin = 0;
  if (scenario === 'absent') return [];
  if (scenario === 'missingOut') {
    return [
      { punch_type: 'in', punch_time: atUtcIso(year, month, day, startHour + 0, startMin + 5) },
      { punch_type: 'out', punch_time: atUtcIso(year, month, day, 13, 0) },
      { punch_type: 'in', punch_time: atUtcIso(year, month, day, 14, 0) },
    ];
  }
  if (scenario === 'halfday') {
    return [
      { punch_type: 'in', punch_time: atUtcIso(year, month, day, 9, 0) },
      { punch_type: 'out', punch_time: atUtcIso(year, month, day, 12, 15) },
    ];
  }
  if (scenario === 'permission') {
    return [
      { punch_type: 'in', punch_time: atUtcIso(year, month, day, 10, 30) },
      { punch_type: 'out', punch_time: atUtcIso(year, month, day, 13, 0) },
      { punch_type: 'in', punch_time: atUtcIso(year, month, day, 14, 0) },
      { punch_type: 'out', punch_time: atUtcIso(year, month, day, 18, 0) },
    ];
  }
  if (scenario === 'late') {
    return [
      { punch_type: 'in', punch_time: atUtcIso(year, month, day, 9, 28) },
      { punch_type: 'out', punch_time: atUtcIso(year, month, day, 13, 0) },
      { punch_type: 'in', punch_time: atUtcIso(year, month, day, 14, 0) },
      { punch_type: 'out', punch_time: atUtcIso(year, month, day, 18, 10) },
    ];
  }
  if (scenario === 'overtime') {
    return [
      { punch_type: 'in', punch_time: atUtcIso(year, month, day, 8, 55) },
      { punch_type: 'out', punch_time: atUtcIso(year, month, day, 13, 0) },
      { punch_type: 'in', punch_time: atUtcIso(year, month, day, 14, 0) },
      { punch_type: 'out', punch_time: atUtcIso(year, month, day, 20, 5) },
    ];
  }
  return [
    { punch_type: 'in', punch_time: atUtcIso(year, month, day, 8, 58) },
    { punch_type: 'out', punch_time: atUtcIso(year, month, day, 13, 0) },
    { punch_type: 'in', punch_time: atUtcIso(year, month, day, 14, 0) },
    { punch_type: 'out', punch_time: atUtcIso(year, month, day, 18, 2) },
  ];
}

async function ensureCompany(client, companyName) {
  const existing = await client.query(
    `SELECT id FROM companies WHERE name = $1 ORDER BY id LIMIT 1`,
    [companyName]
  );
  if (existing.rowCount > 0) return Number(existing.rows[0].id);

  const created = await client.query(
    `INSERT INTO companies (name, email, phone, address)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      companyName,
      'qa@test-company.local',
      '+91-9000000000',
      'QA Dataset Address',
    ]
  );
  return Number(created.rows[0].id);
}

async function ensureBranch(client, companyId, branchName) {
  const existing = await client.query(
    `SELECT id FROM branches WHERE company_id = $1 AND name = $2 ORDER BY id LIMIT 1`,
    [companyId, branchName]
  );
  if (existing.rowCount > 0) return Number(existing.rows[0].id);

  const created = await client.query(
    `INSERT INTO branches (company_id, name) VALUES ($1, $2) RETURNING id`,
    [companyId, branchName]
  );
  return Number(created.rows[0].id);
}

async function ensureAdmin(client, companyId, email, password) {
  const existing = await client.query(
    `SELECT id FROM users WHERE company_id = $1 AND email = $2 LIMIT 1`,
    [companyId, email]
  );
  if (existing.rowCount > 0) return Number(existing.rows[0].id);

  const hash = await bcrypt.hash(password, 10);
  const created = await client.query(
    `INSERT INTO users (company_id, name, email, password, role)
     VALUES ($1, $2, $3, $4, 'admin')
     RETURNING id`,
    [companyId, 'QA Admin', email, hash]
  );
  return Number(created.rows[0].id);
}

async function ensureShift(client, companyId, shiftName) {
  const existing = await client.query(
    `SELECT id FROM shifts WHERE company_id = $1 ORDER BY id LIMIT 1`,
    [companyId]
  );
  if (existing.rowCount > 0) return Number(existing.rows[0].id);

  const created = await client.query(
    `INSERT INTO shifts (
       company_id, shift_name, start_time, end_time, grace_minutes, lunch_minutes,
       weekly_off_days, attendance_mode, monthly_permission_hours, half_day_hours
     )
     VALUES ($1, $2, '09:00', '18:00', 15, 60, '{0,6}', 'day_based', 4, 4)
     RETURNING id`,
    [companyId, shiftName]
  );
  return Number(created.rows[0].id);
}

async function ensureHolidays(client, companyId, year, month) {
  const holidays = [
    { day: 10, name: 'QA Holiday 1' },
    { day: 24, name: 'QA Holiday 2' },
  ].filter((h) => h.day <= daysInMonth(year, month));

  for (const h of holidays) {
    await client.query(
      `INSERT INTO company_holidays (company_id, holiday_date, name, kind)
       VALUES ($1, $2, $3, 'company')
       ON CONFLICT (company_id, holiday_date) DO NOTHING`,
      [companyId, ymd(year, month, h.day), h.name]
    );
  }
}

async function tableExists(client, tableName) {
  const r = await client.query(`SELECT to_regclass($1) AS reg`, [tableName]);
  return Boolean(r.rows[0] && r.rows[0].reg);
}

async function assertRequiredTables(client) {
  const required = ['companies', 'branches', 'employees', 'shifts', 'attendance_logs', 'users'];
  const missing = [];
  for (const t of required) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await tableExists(client, t))) missing.push(t);
  }
  if (missing.length > 0) {
    throw new Error(
      `Database schema is incomplete. Missing tables: ${missing.join(', ')}. Run backend migrations first (npm run migrate).`
    );
  }
}

async function clearCompanyData(client, companyId) {
  const optionalDeletes = [
    { table: 'payroll_records', sql: `DELETE FROM payroll_records WHERE company_id = $1` },
    { table: 'weekly_payroll_records', sql: `DELETE FROM weekly_payroll_records WHERE company_id = $1` },
    { table: 'attendance_logs', sql: `DELETE FROM attendance_logs WHERE company_id = $1` },
    { table: 'devices', sql: `DELETE FROM devices WHERE company_id = $1` },
    {
      table: 'user_branch_assignments',
      sql: `DELETE FROM user_branch_assignments WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)`,
    },
    { table: 'users', sql: `DELETE FROM users WHERE company_id = $1 AND email LIKE 'qa-%@test-company.local'` },
    { table: 'employees', sql: `DELETE FROM employees WHERE company_id = $1 AND employee_code LIKE 'TST-%'` },
  ];

  for (const stmt of optionalDeletes) {
    // Some installations may not have all later migration tables.
    if (await tableExists(client, stmt.table)) {
      await client.query(stmt.sql, [companyId]);
    }
  }
}

async function createOrUpdateEmployees(client, companyId, branchId, shiftId, count, year, month) {
  const employeeIds = [];
  for (let i = 1; i <= count; i += 1) {
    const code = `TST-${String(i).padStart(3, '0')}`;
    const name = `Test Employee ${String(i).padStart(2, '0')}`;
    const salary = 28000 + i * 500;
    const joinDate = ymd(year, month, 1);

    const upsert = await client.query(
      `INSERT INTO employees (
         company_id, branch_id, shift_id, employee_code, name, department,
         designation, basic_salary, join_date, status, payroll_frequency, permission_hours_override
       )
       VALUES ($1, $2, $3, $4, $5, 'Testing', 'QA Staff', $6, $7, 'active', 'monthly', 4)
       ON CONFLICT (company_id, employee_code)
       DO UPDATE SET
         branch_id = EXCLUDED.branch_id,
         shift_id = EXCLUDED.shift_id,
         name = EXCLUDED.name,
         department = EXCLUDED.department,
         designation = EXCLUDED.designation,
         basic_salary = EXCLUDED.basic_salary,
         status = 'active',
         payroll_frequency = 'monthly',
         permission_hours_override = 4
       RETURNING id`,
      [companyId, branchId, shiftId, code, name, salary, joinDate]
    );
    employeeIds.push(Number(upsert.rows[0].id));
  }
  return employeeIds;
}

async function insertAttendance(client, companyId, branchId, employeeIds, year, month) {
  const lastDay = daysInMonth(year, month);
  const counters = {
    regular: 0,
    late: 0,
    overtime: 0,
    halfday: 0,
    permission: 0,
    missingOut: 0,
    absent: 0,
    weeklyOff: 0,
    holiday: 0,
    punches: 0,
  };

  for (let e = 0; e < employeeIds.length; e += 1) {
    const employeeId = employeeIds[e];
    const employeeIndex = e + 1;

    for (let day = 1; day <= lastDay; day += 1) {
      const weekday = isoWeekday(year, month, day);
      const isWeekend = WEEKEND_ISO_DAY.has(weekday);
      const isHoliday = day === 10 || day === 24;

      if (isWeekend) counters.weeklyOff += 1;
      if (isHoliday) counters.holiday += 1;
      if (isWeekend || isHoliday) continue;

      const scenario = scenarioForDay(employeeIndex, day);
      counters[scenario] += 1;
      const punches = buildPunchesForScenario(year, month, day, scenario);
      if (punches.length === 0) continue;

      for (const punch of punches) {
        const deviceId = `QA-DEVICE-${String(employeeIndex).padStart(2, '0')}`;
        await client.query(
          `INSERT INTO attendance_logs (company_id, employee_id, punch_time, punch_type, device_id, branch_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (employee_id, punch_time) DO NOTHING`,
          [companyId, employeeId, punch.punch_time, punch.punch_type, deviceId, branchId]
        );
        counters.punches += 1;
      }
    }
  }
  return counters;
}

async function printVerification(client, companyId, year, month) {
  const checks = [];
  checks.push(
    await client.query(
      `SELECT COUNT(*)::int AS c FROM employees WHERE company_id = $1 AND employee_code LIKE 'TST-%'`,
      [companyId]
    )
  );
  checks.push(
    await client.query(
      `SELECT COUNT(*)::int AS c
       FROM attendance_logs
       WHERE company_id = $1
         AND EXTRACT(YEAR FROM punch_time AT TIME ZONE 'UTC') = $2
         AND EXTRACT(MONTH FROM punch_time AT TIME ZONE 'UTC') = $3`,
      [companyId, year, month]
    ),
  );
  checks.push(
    await client.query(
      `SELECT COUNT(*)::int AS c
       FROM (
         SELECT employee_id, DATE(punch_time AT TIME ZONE 'UTC') AS d, MIN(punch_time) AS first_in
         FROM attendance_logs
         WHERE company_id = $1
           AND punch_type = 'in'
           AND EXTRACT(YEAR FROM punch_time AT TIME ZONE 'UTC') = $2
           AND EXTRACT(MONTH FROM punch_time AT TIME ZONE 'UTC') = $3
         GROUP BY employee_id, DATE(punch_time AT TIME ZONE 'UTC')
       ) t
       WHERE EXTRACT(HOUR FROM first_in AT TIME ZONE 'UTC') > 9
          OR (EXTRACT(HOUR FROM first_in AT TIME ZONE 'UTC') = 9 AND EXTRACT(MINUTE FROM first_in AT TIME ZONE 'UTC') > 15)`,
      [companyId, year, month]
    ),
  );
  checks.push(
    await client.query(
      `SELECT COUNT(*)::int AS c
       FROM (
         SELECT employee_id, DATE(punch_time AT TIME ZONE 'UTC') AS d, MAX(punch_time) AS last_out
         FROM attendance_logs
         WHERE company_id = $1
           AND punch_type = 'out'
           AND EXTRACT(YEAR FROM punch_time AT TIME ZONE 'UTC') = $2
           AND EXTRACT(MONTH FROM punch_time AT TIME ZONE 'UTC') = $3
         GROUP BY employee_id, DATE(punch_time AT TIME ZONE 'UTC')
       ) t
       WHERE EXTRACT(HOUR FROM last_out AT TIME ZONE 'UTC') >= 20`,
      [companyId, year, month]
    ),
  );
  checks.push(
    await client.query(
      `SELECT COUNT(*)::int AS c
       FROM (
         SELECT employee_id, DATE(punch_time AT TIME ZONE 'UTC') AS d, COUNT(*) AS cnt
         FROM attendance_logs
         WHERE company_id = $1
           AND EXTRACT(YEAR FROM punch_time AT TIME ZONE 'UTC') = $2
           AND EXTRACT(MONTH FROM punch_time AT TIME ZONE 'UTC') = $3
         GROUP BY employee_id, DATE(punch_time AT TIME ZONE 'UTC')
       ) t
       WHERE cnt = 3`,
      [companyId, year, month]
    ),
  );
  checks.push(
    await client.query(
      `SELECT COUNT(*)::int AS c
       FROM (
         SELECT employee_id, DATE(punch_time AT TIME ZONE 'UTC') AS d, COUNT(*) AS cnt
         FROM attendance_logs
         WHERE company_id = $1
           AND EXTRACT(YEAR FROM punch_time AT TIME ZONE 'UTC') = $2
           AND EXTRACT(MONTH FROM punch_time AT TIME ZONE 'UTC') = $3
         GROUP BY employee_id, DATE(punch_time AT TIME ZONE 'UTC')
       ) t
       WHERE cnt = 2`,
      [companyId, year, month]
    ),
  );
  checks.push(
    await client.query(
      `SELECT COUNT(*)::int AS c
       FROM (
         SELECT employee_id, DATE(punch_time AT TIME ZONE 'UTC') AS d
         FROM attendance_logs
         WHERE company_id = $1
           AND EXTRACT(YEAR FROM punch_time AT TIME ZONE 'UTC') = $2
           AND EXTRACT(MONTH FROM punch_time AT TIME ZONE 'UTC') = $3
         GROUP BY employee_id, DATE(punch_time AT TIME ZONE 'UTC')
       ) p`,
      [companyId, year, month]
    )
  );

  const employeeCount = checks[0].rows[0].c;
  const punchCount = checks[1].rows[0].c;
  const lateDays = checks[2].rows[0].c;
  const overtimeDays = checks[3].rows[0].c;
  const missingOutDays = checks[4].rows[0].c;
  const halfDayDays = checks[5].rows[0].c;
  const presentDays = checks[6].rows[0].c;

  console.log('');
  console.log('Verification summary:');
  console.log(`- employees: ${employeeCount}`);
  console.log(`- punches: ${punchCount}`);
  console.log(`- present days (with at least one punch): ${presentDays}`);
  console.log(`- late days: ${lateDays}`);
  console.log(`- overtime-like days (last out >= 20:00): ${overtimeDays}`);
  console.log(`- missing-out days (3 punches): ${missingOutDays}`);
  console.log(`- half-day-like days (2 punches): ${halfDayDays}`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (!config.year || config.year < 2000) throw new Error('Valid --year is required');
  if (!config.month || config.month < 1 || config.month > 12) throw new Error('Valid --month is required');
  if (!config.employees || config.employees < 1) throw new Error('Valid --employees is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertRequiredTables(client);

    const companyId = await ensureCompany(client, config.company);
    if (config.resetCompany) {
      await clearCompanyData(client, companyId);
    }
    const branchId = await ensureBranch(client, companyId, config.branch);
    await ensureAdmin(client, companyId, config.adminEmail, config.adminPassword);
    const shiftId = await ensureShift(client, companyId, config.shiftName);
    await ensureHolidays(client, companyId, config.year, config.month);
    const employeeIds = await createOrUpdateEmployees(
      client,
      companyId,
      branchId,
      shiftId,
      config.employees,
      config.year,
      config.month
    );

    const counters = await insertAttendance(
      client,
      companyId,
      branchId,
      employeeIds,
      config.year,
      config.month
    );

    await client.query('COMMIT');

    console.log('Test dataset generation completed.');
    console.log(`Company: ${config.company} (id=${companyId})`);
    console.log(`Branch: ${config.branch} (id=${branchId})`);
    console.log(`Month: ${config.year}-${String(config.month).padStart(2, '0')}`);
    console.log(`Employees: ${employeeIds.length}`);
    console.log(`Inserted punches (attempted): ${counters.punches}`);
    console.log('Scenario counters:');
    console.log(`- regular: ${counters.regular}`);
    console.log(`- late: ${counters.late}`);
    console.log(`- overtime: ${counters.overtime}`);
    console.log(`- halfday: ${counters.halfday}`);
    console.log(`- permission: ${counters.permission}`);
    console.log(`- missingOut: ${counters.missingOut}`);
    console.log(`- absent: ${counters.absent}`);
    console.log(`- weekend days skipped: ${counters.weeklyOff}`);
    console.log(`- holiday days skipped: ${counters.holiday}`);

    await printVerification(client, companyId, config.year, config.month);
    console.log('');
    console.log(`Admin login: ${config.adminEmail} / ${config.adminPassword}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to generate test dataset:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
