/**
 * One-command end-to-end test for mobile attendance (QR + geofence).
 *
 * Simulates the employee mobile app against your local backend:
 *   1. Enables mobile attendance on a company
 *   2. Sets a branch geofence
 *   3. Sets an employee's attendance_channel to 'both'
 *   4. Provisions an employee app login
 *   5. Logs in as the employee (HTTP)
 *   6. Issues a QR nonce (what the kiosk QR would contain)
 *   7. Punches via POST /api/employee-app/punch (HTTP)
 *   8. Runs negative tests (reused nonce, outside geofence)
 *
 * Usage:
 *   node scripts/test-mobile-punch.js                 # uses mzoneapps local (company #5)
 *   node scripts/test-mobile-punch.js --company 5     # explicit company id
 *   node scripts/test-mobile-punch.js --employee 9    # specific employee (e.g. thanveer)
 *
 * Default company: "mzoneapps local" (admin web login: local@mzoneapps.com)
 * Employee app login created by script: mobile-test@mzoneapps.local / Mobile@123
 *
 * Requires the backend dev server running on BACKEND_URL (default http://localhost:3000).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../src/config/database');
const { provisionEmployeeAppAccess } = require('../src/services/employeeAppService');
const { issueQrNonce } = require('../src/services/mobileQrService');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const DEFAULT_COMPANY_NAME = process.env.MOBILE_TEST_COMPANY || 'mzoneapps local';
const TEST_EMAIL = 'mobile-test@mzoneapps.local';
const TEST_PASSWORD = 'Mobile@123';

// Test office location (MG Road, Bengaluru); the simulated phone reports the same spot.
const OFFICE = { latitude: 12.9716, longitude: 77.5946 };

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--company') args.company = Number(argv[i + 1]);
    if (argv[i] === '--employee') args.employee = Number(argv[i + 1]);
  }
  return args;
}

function ok(msg) {
  console.log(`  \x1b[32mPASS\x1b[0m  ${msg}`);
}
function fail(msg) {
  console.log(`  \x1b[31mFAIL\x1b[0m  ${msg}`);
  process.exitCode = 1;
}
function step(msg) {
  console.log(`\n\x1b[36m${msg}\x1b[0m`);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON response
  }
  return { status: res.status, json };
}

async function pickCompany(preferredId) {
  if (preferredId) {
    const r = await pool.query(`SELECT id, name, status FROM companies WHERE id = $1`, [preferredId]);
    if (r.rowCount === 0) throw new Error(`Company ${preferredId} not found`);
    return r.rows[0];
  }
  const byName = await pool.query(
    `SELECT id, name, status FROM companies
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
     LIMIT 1`,
    [DEFAULT_COMPANY_NAME]
  );
  if (byName.rowCount > 0) {
    return byName.rows[0];
  }
  const r = await pool.query(
    `SELECT c.id, c.name, c.status
     FROM companies c
     WHERE c.status NOT IN ('pending', 'declined', 'locked')
       AND (c.is_active IS DISTINCT FROM FALSE)
       AND EXISTS (SELECT 1 FROM employees e WHERE e.company_id = c.id AND e.status = 'active')
     ORDER BY c.id
     LIMIT 1`
  );
  if (r.rowCount === 0) {
    throw new Error(
      `Company "${DEFAULT_COMPANY_NAME}" not found and no fallback company available. ` +
      'Run: npm run seed:testdata'
    );
  }
  return r.rows[0];
}

async function pickEmployee(companyId, preferredId) {
  if (preferredId) {
    const r = await pool.query(
      `SELECT id, name, branch_id FROM employees WHERE company_id = $1 AND id = $2 AND status = 'active'`,
      [companyId, preferredId]
    );
    if (r.rowCount === 0) throw new Error(`Active employee ${preferredId} not found in company ${companyId}`);
    return r.rows[0];
  }
  const r = await pool.query(
    `SELECT id, name, branch_id FROM employees
     WHERE company_id = $1 AND status = 'active'
     ORDER BY id LIMIT 1`,
    [companyId]
  );
  if (r.rowCount === 0) throw new Error(`No active employee in company ${companyId}`);
  return r.rows[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Sanity: is the server up?
  try {
    await fetch(`${BASE_URL}/api/health`);
  } catch {
    console.error(`Backend not reachable at ${BASE_URL}. Start it first: cd backend && npm run dev`);
    process.exit(1);
  }

  step('1. Picking test company and employee');
  const company = await pickCompany(args.company);
  const employee = await pickEmployee(company.id, args.employee);
  const branchId = Number(employee.branch_id);
  console.log(`  Company:  #${company.id} ${company.name}`);
  console.log(`  Admin UI: log in at http://localhost:5173 with local@mzoneapps.com`);
  console.log(`  Employee: #${employee.id} ${employee.name} (branch ${branchId})`);

  step('2. Enabling mobile attendance on company');
  await pool.query(`UPDATE companies SET mobile_attendance_enabled = TRUE WHERE id = $1`, [company.id]);
  ok('companies.mobile_attendance_enabled = true');

  step('3. Setting branch geofence (office at MG Road, Bengaluru, radius 200m)');
  await pool.query(
    `UPDATE branches
     SET latitude = $2, longitude = $3, geofence_radius_m = 200, mobile_attendance_enabled = TRUE
     WHERE id = $1`,
    [branchId, OFFICE.latitude, OFFICE.longitude]
  );
  ok(`branch #${branchId} geofence set`);

  step("4. Setting employee attendance_channel = 'both'");
  await pool.query(`UPDATE employees SET attendance_channel = 'both' WHERE id = $1`, [employee.id]);
  ok(`employee #${employee.id} can punch via device and mobile`);

  step('5. Provisioning employee app login');
  await provisionEmployeeAppAccess(company.id, employee.id, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    name: employee.name,
  });
  ok(`login: ${TEST_EMAIL} / ${TEST_PASSWORD}`);

  step('6. Employee login via API (what the mobile app does first)');
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  if (login.status !== 200 || !login.json?.data?.token) {
    fail(`login failed (${login.status}): ${login.json?.message}`);
    process.exit(1);
  }
  const token = login.json.data.token;
  ok('got employee JWT');

  step('7. GET /api/employee-app/me');
  const me = await api('/api/employee-app/me', { token });
  if (me.status === 200) {
    ok(`me: ${me.json.data.employee.name} @ ${me.json.data.branch.name}, today: ${me.json.data.today.status}`);
  } else {
    fail(`/me failed (${me.status}): ${me.json?.message}`);
  }

  step('8. Issuing QR nonce (this is what the office kiosk QR encodes)');
  const qr = await issueQrNonce(company.id, branchId);
  ok(`nonce issued, expires ${qr.expires_at}`);

  step('9. Punching: POST /api/employee-app/punch (phone at office, GPS accuracy 10m)');
  const punch = await api('/api/employee-app/punch', {
    method: 'POST',
    token,
    body: {
      qr_nonce: qr.nonce,
      latitude: OFFICE.latitude,
      longitude: OFFICE.longitude,
      location_accuracy_m: 10,
    },
  });
  if (punch.status === 201) {
    const p = punch.json.data.punch;
    ok(`punch accepted: ${p.punch_type.toUpperCase()} at ${p.punch_time} (device_id=${p.device_id})`);
    ok(`today status: ${punch.json.data.today.status}`);
  } else {
    fail(`punch rejected (${punch.status}): ${punch.json?.code || ''} ${punch.json?.message}`);
  }

  step('10. Negative test: reusing the same QR nonce (should be rejected)');
  const replay = await api('/api/employee-app/punch', {
    method: 'POST',
    token,
    body: {
      qr_nonce: qr.nonce,
      latitude: OFFICE.latitude,
      longitude: OFFICE.longitude,
      location_accuracy_m: 10,
    },
  });
  if (replay.status === 422 && replay.json?.code === 'QR_INVALID') {
    ok('reused nonce rejected with QR_INVALID');
  } else {
    fail(`expected 422 QR_INVALID, got ${replay.status} ${replay.json?.code}`);
  }

  step('11. Negative test: punching from home, 5km away (should be rejected)');
  const qr2 = await issueQrNonce(company.id, branchId);
  const far = await api('/api/employee-app/punch', {
    method: 'POST',
    token,
    body: {
      qr_nonce: qr2.nonce,
      latitude: OFFICE.latitude + 0.045, // ~5 km north
      longitude: OFFICE.longitude,
      location_accuracy_m: 10,
    },
  });
  if (far.status === 422 && far.json?.code === 'OUTSIDE_GEOFENCE') {
    ok('far-away punch rejected with OUTSIDE_GEOFENCE');
  } else {
    fail(`expected 422 OUTSIDE_GEOFENCE, got ${far.status} ${far.json?.code}`);
  }

  step('12. Verifying data in attendance_logs');
  const logs = await pool.query(
    `SELECT id, punch_time, punch_type, device_id, punch_source
     FROM attendance_logs
     WHERE company_id = $1 AND employee_id = $2 AND device_id = 'mobile'
     ORDER BY id DESC LIMIT 3`,
    [company.id, employee.id]
  );
  console.log(`  Latest mobile punches for employee #${employee.id}:`);
  for (const row of logs.rows) {
    console.log(`    #${row.id}  ${row.punch_type.toUpperCase()}  ${row.punch_time.toISOString()}  (${row.device_id}/${row.punch_source})`);
  }

  const attempts = await pool.query(
    `SELECT status, reject_reason FROM mobile_punch_attempts
     WHERE company_id = $1 ORDER BY id DESC LIMIT 3`,
    [company.id]
  );
  console.log('  Latest punch attempts (audit):');
  for (const row of attempts.rows) {
    console.log(`    ${row.status}${row.reject_reason ? ` (${row.reject_reason})` : ''}`);
  }

  console.log('\n\x1b[1mDone.\x1b[0m Mobile punches are now visible on the Attendance page for this employee.');
  console.log('Run again to punch OUT (in/out alternates automatically).');
  await pool.end();
}

main().catch(async (err) => {
  console.error(`\nError: ${err.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
