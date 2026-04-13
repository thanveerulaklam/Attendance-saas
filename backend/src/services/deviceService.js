const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { istYmdFromDate } = require('../utils/istDate');
const crypto = require('crypto');
const { getCompanyById, isSubscriptionAllowed } = require('./companyService');
const auditService = require('./auditService');

async function findActiveDeviceByApiKey(apiKey) {
  const result = await pool.query(
    `SELECT id, company_id, name, branch_id
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
  return crypto.randomBytes(32).toString('hex');
}

function deviceBranchFilter(allowedBranchIds, paramIndex) {
  if (allowedBranchIds == null) {
    return { clause: '', params: [], nextIndex: paramIndex };
  }
  if (allowedBranchIds.length === 0) {
    return { clause: ' AND FALSE', params: [], nextIndex: paramIndex };
  }
  return {
    clause: ` AND branch_id = ANY($${paramIndex}::bigint[])`,
    params: [allowedBranchIds],
    nextIndex: paramIndex + 1,
  };
}

async function resolveBranchIdForDevice(companyId, branchIdRaw, branchContext = {}) {
  const { role, allowedBranchIds, defaultBranchId } = branchContext;
  const requested =
    branchIdRaw != null && branchIdRaw !== '' ? Number(branchIdRaw) : null;

  if (role === 'admin' || allowedBranchIds == null) {
    if (requested) {
      const ok = await pool.query(
        `SELECT id FROM branches WHERE id = $1 AND company_id = $2`,
        [requested, companyId]
      );
      if (ok.rowCount === 0) {
        throw new AppError('Invalid branch_id for this company', 400);
      }
      return requested;
    }
    const first = await pool.query(
      `SELECT id FROM branches WHERE company_id = $1 ORDER BY id ASC LIMIT 1`,
      [companyId]
    );
    if (first.rowCount === 0) {
      throw new AppError('No branch configured for this company', 400);
    }
    return Number(first.rows[0].id);
  }

  const target = requested ?? defaultBranchId;
  if (!target) {
    throw new AppError('branch_id is required', 400);
  }
  if (!allowedBranchIds.includes(Number(target))) {
    throw new AppError('Branch not allowed for your account', 403);
  }
  return Number(target);
}

async function assertDeviceVisibleToHr(companyId, deviceId, branchContext = {}) {
  const { role, allowedBranchIds } = branchContext;
  if (role !== 'hr' || allowedBranchIds == null) {
    return;
  }
  if (allowedBranchIds.length === 0) {
    throw new AppError('Device not found for this company', 404);
  }
  const r = await pool.query(
    `SELECT branch_id FROM devices WHERE company_id = $1 AND id = $2`,
    [companyId, deviceId]
  );
  if (r.rowCount === 0) {
    throw new AppError('Device not found for this company', 404);
  }
  const bid = Number(r.rows[0].branch_id);
  if (!allowedBranchIds.includes(bid)) {
    throw new AppError('Device not found for this company', 404);
  }
}

async function createDevice(companyId, { name, branch_id: branchIdRaw }, branchContext = {}) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw new AppError('Device name is required', 400);
  }

  const branchId = await resolveBranchIdForDevice(companyId, branchIdRaw, branchContext);
  const apiKey = generateApiKey();

  const result = await pool.query(
    `INSERT INTO devices (company_id, branch_id, name, api_key)
     VALUES ($1, $2, $3, $4)
     RETURNING id, company_id, branch_id, name, api_key, is_active, last_seen_at, created_at`,
    [companyId, branchId, trimmedName, apiKey]
  );

  return result.rows[0];
}

async function listDevices(companyId, { page = 1, limit = 50 } = {}, allowedBranchIds = null) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  const params = [companyId];
  let where = 'WHERE company_id = $1';
  const bf = deviceBranchFilter(allowedBranchIds, 2);
  where += bf.clause;
  params.push(...bf.params);

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM devices ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const result = await pool.query(
    `SELECT id, company_id, branch_id, name, api_key, is_active, last_seen_at, created_at
     FROM devices
     ${where}
     ORDER BY created_at ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limitNum, offset]
  );

  return { data: result.rows, total, page: pageNum, limit: limitNum };
}

async function updateDevice(companyId, id, { name, branch_id: branchIdRaw }, branchContext = {}) {
  await assertDeviceVisibleToHr(companyId, id, branchContext);

  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw new AppError('Device name is required', 400);
  }

  let branchId = null;
  if (branchIdRaw != null && branchIdRaw !== '') {
    branchId = await resolveBranchIdForDevice(companyId, branchIdRaw, branchContext);
  }

  const result = branchId != null
    ? await pool.query(
        `UPDATE devices
         SET name = $3, branch_id = $4
         WHERE company_id = $1 AND id = $2
         RETURNING id, company_id, branch_id, name, api_key, is_active, last_seen_at, created_at`,
        [companyId, id, trimmedName, branchId]
      )
    : await pool.query(
        `UPDATE devices
         SET name = $3
         WHERE company_id = $1 AND id = $2
         RETURNING id, company_id, branch_id, name, api_key, is_active, last_seen_at, created_at`,
        [companyId, id, trimmedName]
      );

  if (result.rowCount === 0) {
    throw new AppError('Device not found for this company', 404);
  }

  return result.rows[0];
}

async function toggleDeviceActive(companyId, id, isActive, branchContext = {}) {
  await assertDeviceVisibleToHr(companyId, id, branchContext);

  const result = await pool.query(
    `UPDATE devices
     SET is_active = $3
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, branch_id, name, api_key, is_active, last_seen_at, created_at`,
    [companyId, id, Boolean(isActive)]
  );

  if (result.rowCount === 0) {
    throw new AppError('Device not found for this company', 404);
  }

  return result.rows[0];
}

async function regenerateApiKey(companyId, id, branchContext = {}) {
  await assertDeviceVisibleToHr(companyId, id, branchContext);

  const apiKey = generateApiKey();

  const result = await pool.query(
    `UPDATE devices
     SET api_key = $3
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, branch_id, name, api_key, is_active, last_seen_at, created_at`,
    [companyId, id, apiKey]
  );

  if (result.rowCount === 0) {
    throw new AppError('Device not found for this company', 404);
  }

  return result.rows[0];
}

/**
 * Infer punch_type from order: first punch of day = IN, second = OUT, etc.
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
    const eid = employeeMap[log.employeeCode].id;
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
 */
async function processDeviceLogs(apiKey, logs) {
  if (!logs || logs.length === 0) {
    throw new AppError('logs must be a non-empty array', 400);
  }

  const device = await findActiveDeviceByApiKey(apiKey);
  const companyId = device.company_id;
  const deviceBranchId = Number(device.branch_id);

  const company = await getCompanyById(companyId);
  if (!company || !isSubscriptionAllowed(company)) {
    throw new AppError('Subscription has expired. Please renew to sync device logs.', 403);
  }

  const uniqueCodes = [...new Set(logs.map((l) => l.employeeCode))];
  const employeeResult = await pool.query(
    `SELECT id, employee_code, branch_id
     FROM employees
     WHERE company_id = $1 AND employee_code = ANY($2::text[])`,
    [companyId, uniqueCodes]
  );

  const employeeMap = Object.create(null);
  for (const row of employeeResult.rows) {
    employeeMap[row.employee_code] = { id: row.id, branch_id: Number(row.branch_id) };
  }

  const unknownCodes = uniqueCodes.filter((code) => !employeeMap[code]);
  const wrongBranchCodes = uniqueCodes.filter((code) => {
    const e = employeeMap[code];
    return e && e.branch_id !== deviceBranchId;
  });

  const validLogs = logs.filter((log) => {
    const e = employeeMap[log.employeeCode];
    return e && e.branch_id === deviceBranchId;
  });

  // Entire batch may be device junk (e.g. user id 0) or unknown IDs — do not 400; let connector finish other chunks.
  if (validLogs.length === 0) {
    if (unknownCodes.length > 0 || wrongBranchCodes.length > 0) {
      const skipped = [...new Set([...unknownCodes, ...wrongBranchCodes])];
      await pool.query(`UPDATE devices SET last_seen_at = NOW() WHERE id = $1`, [device.id]);
      return {
        inserted: 0,
        skipped_unknown_codes: skipped,
      };
    }
    throw new AppError('No valid punches to import', 400);
  }

  const employeeIds = [...new Set(validLogs.map((l) => employeeMap[l.employeeCode].id))];
  const times = validLogs.map((l) =>
    (l.punchTime instanceof Date ? l.punchTime : new Date(l.punchTime)).getTime()
  );
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
      const base = idx * 6;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
      );
      values.push(
        companyId,
        employeeMap[log.employeeCode].id,
        log.punchTime instanceof Date ? log.punchTime.toISOString() : new Date(log.punchTime).toISOString(),
        (log.punchType || 'in').toLowerCase(),
        log.deviceId || String(device.id),
        deviceBranchId
      );
    });

    const insertResult = await client.query(
      `INSERT INTO attendance_logs (company_id, employee_id, punch_time, punch_type, device_id, branch_id)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (employee_id, punch_time) DO NOTHING
       RETURNING id`,
      values
    );

    const insertedCount = insertResult.rowCount || 0;

    await client.query(`UPDATE devices SET last_seen_at = NOW() WHERE id = $1`, [device.id]);

    await client.query('COMMIT');

    auditService
      .log(companyId, null, 'device.push', 'device', device.id, { logs_count: insertedCount })
      .catch(() => {});

    const result = { inserted: insertedCount };
    const skipped = [...unknownCodes, ...wrongBranchCodes].filter(
      (c, i, a) => a.indexOf(c) === i
    );
    if (skipped.length > 0) result.skipped_unknown_codes = skipped;
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
