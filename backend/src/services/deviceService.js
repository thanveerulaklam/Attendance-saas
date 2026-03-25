const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { istYmdFromDate } = require('../utils/istDate');
const crypto = require('crypto');
const { getCompanyById, isSubscriptionAllowed } = require('./companyService');
const auditService = require('./auditService');

async function findActiveDeviceByApiKey(apiKey) {
  const result = await pool.query(
    `SELECT id, company_id, name
     FROM devices
     WHERE api_key = $1 AND is_active = TRUE`,
    [apiKey]
  );

  if (result.rowCount === 0) {
    throw new AppError('Invalid device API key', 401);
  }

  return result.rows[0];
}

function generateApiKey() {
  // 32 bytes → 64-char hex string
  return crypto.randomBytes(32).toString('hex');
}

async function createDevice(companyId, { name }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw new AppError('Device name is required', 400);
  }

  const apiKey = generateApiKey();

  const result = await pool.query(
    `INSERT INTO devices (company_id, name, api_key)
     VALUES ($1, $2, $3)
     RETURNING id, company_id, name, api_key, is_active, last_seen_at, created_at`,
    [companyId, trimmedName, apiKey]
  );

  return result.rows[0];
}

async function listDevices(companyId, { page = 1, limit = 50 } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  const countResult = await pool.query(
    'SELECT COUNT(*) AS total FROM devices WHERE company_id = $1',
    [companyId]
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const result = await pool.query(
    `SELECT id, company_id, name, api_key, is_active, last_seen_at, created_at
     FROM devices
     WHERE company_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [companyId, limitNum, offset]
  );

  return { data: result.rows, total, page: pageNum, limit: limitNum };
}

async function updateDevice(companyId, id, { name }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw new AppError('Device name is required', 400);
  }

  const result = await pool.query(
    `UPDATE devices
     SET name = $3
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, name, api_key, is_active, last_seen_at, created_at`,
    [companyId, id, trimmedName]
  );

  if (result.rowCount === 0) {
    throw new AppError('Device not found for this company', 404);
  }

  return result.rows[0];
}

async function toggleDeviceActive(companyId, id, isActive) {
  const result = await pool.query(
    `UPDATE devices
     SET is_active = $3
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, name, api_key, is_active, last_seen_at, created_at`,
    [companyId, id, Boolean(isActive)]
  );

  if (result.rowCount === 0) {
    throw new AppError('Device not found for this company', 404);
  }

  return result.rows[0];
}

async function regenerateApiKey(companyId, id) {
  const apiKey = generateApiKey();

  const result = await pool.query(
    `UPDATE devices
     SET api_key = $3
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, name, api_key, is_active, last_seen_at, created_at`,
    [companyId, id, apiKey]
  );

  if (result.rowCount === 0) {
    throw new AppError('Device not found for this company', 404);
  }

  return result.rows[0];
}

/**
 * Infer punch_type from order: first punch of day = IN, second = OUT, etc.
 * Merges existing DB punches with incoming logs per (employee_id, day), sorts by time, assigns alternating IN/OUT.
 * Mutates logs[].punchType so caller can insert with correct types.
 */
function inferPunchTypesFromSequence(validLogs, employeeMap, existingRows) {
  const toDateKey = (ts) => istYmdFromDate(ts);

  const byEmployeeDay = new Map();
  for (const row of existingRows) {
    const eid = row.employee_id;
    const key = `${eid}|${toDateKey(row.punch_time)}`;
    if (!byEmployeeDay.has(key)) byEmployeeDay.set(key, []);
    byEmployeeDay.get(key).push({ punch_time: row.punch_time, punch_type: row.punch_type });
  }
  for (const log of validLogs) {
    const eid = employeeMap[log.employeeCode];
    const punchTime = log.punchTime instanceof Date ? log.punchTime : new Date(log.punchTime);
    const key = `${eid}|${toDateKey(punchTime)}`;
    if (!byEmployeeDay.has(key)) byEmployeeDay.set(key, []);
    byEmployeeDay.get(key).push({ punch_time: punchTime, punch_type: null, _log: log });
  }

  for (const list of byEmployeeDay.values()) {
    list.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));
    list.forEach((entry, i) => {
      const type = i % 2 === 0 ? 'in' : 'out';
      if (entry._log) entry._log.punchType = type;
    });
  }
}

/**
 * Process attendance logs (shared by connector push and direct device webhook).
 * IN/OUT is inferred from punch order per employee per day when not reliably provided by the device.
 * @param {string} apiKey - Device API key
 * @param {Array<{ employeeCode: string, punchTime: Date, punchType: 'in'|'out', deviceId?: string }>} logs
 * @returns {{ inserted: number, skipped_unknown_codes?: string[] }}
 */
async function processDeviceLogs(apiKey, logs) {
  if (!logs || logs.length === 0) {
    throw new AppError('logs must be a non-empty array', 400);
  }

  const device = await findActiveDeviceByApiKey(apiKey);
  const companyId = device.company_id;

  const company = await getCompanyById(companyId);
  if (!company || !isSubscriptionAllowed(company)) {
    throw new AppError('Subscription has expired. Please renew to sync device logs.', 403);
  }

  const uniqueCodes = [...new Set(logs.map((l) => l.employeeCode))];
  const employeeResult = await pool.query(
    `SELECT id, employee_code
     FROM employees
     WHERE company_id = $1 AND employee_code = ANY($2::text[])`,
    [companyId, uniqueCodes]
  );

  const employeeMap = Object.create(null);
  for (const row of employeeResult.rows) {
    employeeMap[row.employee_code] = row.id;
  }

  const unknownCodes = uniqueCodes.filter((code) => !employeeMap[code]);
  if (unknownCodes.length > 0 && unknownCodes.length === uniqueCodes.length) {
    throw new AppError(`Unknown employee_code for this company: ${unknownCodes[0]}`, 400);
  }

  const validLogs = logs.filter((log) => employeeMap[log.employeeCode]);
  if (validLogs.length === 0) {
    throw new AppError(`Unknown employee_code for this company: ${unknownCodes.join(', ')}`, 400);
  }

  const employeeIds = [...new Set(validLogs.map((l) => employeeMap[l.employeeCode]))];
  const times = validLogs.map((l) => (l.punchTime instanceof Date ? l.punchTime : new Date(l.punchTime)).getTime());
  const minTime = new Date(Math.min(...times));
  const maxTime = new Date(Math.max(...times));

  const existingResult = await pool.query(
    `SELECT employee_id, punch_time, punch_type
     FROM attendance_logs
     WHERE company_id = $1 AND employee_id = ANY($2::bigint[])
       AND punch_time >= $3 AND punch_time <= $4
     ORDER BY employee_id, punch_time`,
    [companyId, employeeIds, minTime, maxTime]
  );
  inferPunchTypesFromSequence(validLogs, employeeMap, existingResult.rows);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const values = [];
    const placeholders = [];
    validLogs.forEach((log, idx) => {
      const base = idx * 5;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
      );
      values.push(
        companyId,
        employeeMap[log.employeeCode],
        log.punchTime instanceof Date ? log.punchTime.toISOString() : new Date(log.punchTime).toISOString(),
        (log.punchType || 'in').toLowerCase(),
        log.deviceId || String(device.id)
      );
    });

    const insertResult = await client.query(
      `INSERT INTO attendance_logs (company_id, employee_id, punch_time, punch_type, device_id)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (employee_id, punch_time) DO NOTHING
       RETURNING id`,
      values
    );

    const insertedCount = insertResult.rowCount || 0;

    await client.query(
      `UPDATE devices SET last_seen_at = NOW() WHERE id = $1`,
      [device.id]
    );

    await client.query('COMMIT');

    auditService.log(companyId, null, 'device.push', 'device', device.id, { logs_count: insertedCount }).catch(() => {});

    const result = { inserted: insertedCount };
    if (unknownCodes.length > 0) result.skipped_unknown_codes = unknownCodes;
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  findActiveDeviceByApiKey,
  createDevice,
  listDevices,
  updateDevice,
  toggleDeviceActive,
  regenerateApiKey,
  processDeviceLogs,
};

