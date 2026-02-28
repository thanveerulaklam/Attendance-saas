const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
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
 * Process attendance logs (shared by connector push and direct device webhook).
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
        log.punchType,
        log.deviceId || String(device.id)
      );
    });

    await client.query(
      `INSERT INTO attendance_logs (company_id, employee_id, punch_time, punch_type, device_id)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    await client.query(
      `UPDATE devices SET last_seen_at = NOW() WHERE id = $1`,
      [device.id]
    );

    await client.query('COMMIT');

    auditService.log(companyId, null, 'device.push', 'device', device.id, { logs_count: validLogs.length }).catch(() => {});

    const result = { inserted: validLogs.length };
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

