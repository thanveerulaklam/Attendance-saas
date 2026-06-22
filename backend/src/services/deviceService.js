const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { istYmdFromDate } = require('../utils/istDate');
const crypto = require('crypto');
const { getCompanyById, isSubscriptionAllowed } = require('./companyService');
const auditService = require('./auditService');
const { recordAdmsRejections } = require('./admsRejectionService');

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

async function findActiveDeviceByCloudToken(cloudToken) {
  const result = await pool.query(
    `SELECT id, company_id, name, branch_id
     FROM devices
     WHERE cloud_token = $1 AND is_active = TRUE`,
    [cloudToken]
  );

  if (result.rowCount === 0) {
    throw new AppError('Invalid device cloud token', 401);
  }

  return result.rows[0];
}

async function findActiveDeviceByAdmsSn(admsSn) {
  const result = await pool.query(
    `SELECT id, company_id, name, branch_id
     FROM devices
     WHERE adms_sn = $1 AND is_active = TRUE`,
    [admsSn]
  );

  if (result.rowCount === 0) {
    throw new AppError('Unknown or inactive ADMS serial number', 401);
  }

  return result.rows[0];
}

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

function generateCloudToken() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = 'PP-';
  for (let i = 0; i < 8; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (i === 3) token += '-';
  }
  return token;
}

async function issueUniqueCloudToken() {
  for (let i = 0; i < 8; i += 1) {
    const token = generateCloudToken();
    const existing = await pool.query(
      `SELECT 1 FROM devices WHERE cloud_token = $1 LIMIT 1`,
      [token]
    );
    if (existing.rowCount === 0) return token;
  }
  throw new AppError('Unable to generate unique cloud token. Please retry.', 500);
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
  const cloudToken = await issueUniqueCloudToken();

  const result = await pool.query(
    `INSERT INTO devices (company_id, branch_id, name, api_key, cloud_token)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, company_id, branch_id, name, api_key, cloud_token, adms_sn, is_active, last_seen_at, created_at`,
    [companyId, branchId, trimmedName, apiKey, cloudToken]
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
    `SELECT id, company_id, branch_id, name, api_key, cloud_token, adms_sn, is_active, last_seen_at, created_at
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
         RETURNING id, company_id, branch_id, name, api_key, cloud_token, adms_sn, is_active, last_seen_at, created_at`,
        [companyId, id, trimmedName, branchId]
      )
    : await pool.query(
        `UPDATE devices
         SET name = $3
         WHERE company_id = $1 AND id = $2
         RETURNING id, company_id, branch_id, name, api_key, cloud_token, adms_sn, is_active, last_seen_at, created_at`,
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
     RETURNING id, company_id, branch_id, name, api_key, cloud_token, adms_sn, is_active, last_seen_at, created_at`,
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
     RETURNING id, company_id, branch_id, name, api_key, cloud_token, adms_sn, is_active, last_seen_at, created_at`,
    [companyId, id, apiKey]
  );

  if (result.rowCount === 0) {
    throw new AppError('Device not found for this company', 404);
  }

  return result.rows[0];
}

async function regenerateCloudToken(companyId, id, branchContext = {}) {
  await assertDeviceVisibleToHr(companyId, id, branchContext);
  const cloudToken = await issueUniqueCloudToken();
  const result = await pool.query(
    `UPDATE devices
     SET cloud_token = $3
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, branch_id, name, api_key, cloud_token, adms_sn, is_active, last_seen_at, created_at`,
    [companyId, id, cloudToken]
  );
  if (result.rowCount === 0) {
    throw new AppError('Device not found for this company', 404);
  }
  return result.rows[0];
}

async function updateAdmsSerial(companyId, id, admsSnRaw, branchContext = {}) {
  await assertDeviceVisibleToHr(companyId, id, branchContext);
  const admsSn = String(admsSnRaw || '').trim();
  const normalized = admsSn.length > 0 ? admsSn.toUpperCase() : null;

  if (normalized && normalized.length > 64) {
    throw new AppError('ADMS serial number is too long', 400);
  }

  const result = await pool.query(
    `UPDATE devices
     SET adms_sn = $3
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, branch_id, name, api_key, cloud_token, adms_sn, is_active, last_seen_at, created_at`,
    [companyId, id, normalized]
  );

  if (result.rowCount === 0) {
    throw new AppError('Device not found for this company', 404);
  }
  return result.rows[0];
}

async function deleteDevice(companyId, id, branchContext = {}) {
  await assertDeviceVisibleToHr(companyId, id, branchContext);

  const result = await pool.query(
    `DELETE FROM devices
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, branch_id, name`,
    [companyId, id]
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
async function processDeviceLogs(deviceAuthToken, logs, authMode = 'api_key') {
  if (!logs || logs.length === 0) {
    throw new AppError('logs must be a non-empty array', 400);
  }

  let device;
  if (authMode === 'cloud_token') {
    device = await findActiveDeviceByCloudToken(deviceAuthToken);
  } else if (authMode === 'adms_sn') {
    device = await findActiveDeviceByAdmsSn(deviceAuthToken);
  } else {
    device = await findActiveDeviceByApiKey(deviceAuthToken);
  }
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

  const rejections = [];
  for (const log of logs) {
    const e = employeeMap[log.employeeCode];
    if (!e) {
      rejections.push({
        employeeCode: log.employeeCode,
        punchTime: log.punchTime,
        reason: 'unknown_code',
        rawLine: log.rawLine || null,
      });
    } else if (e.branch_id !== deviceBranchId) {
      rejections.push({
        employeeCode: log.employeeCode,
        punchTime: log.punchTime,
        reason: 'wrong_branch',
        rawLine: log.rawLine || null,
      });
    }
  }
  if (rejections.length > 0) {
    const admsSn = authMode === 'adms_sn' ? String(deviceAuthToken).trim().toUpperCase() : null;
    try {
      await recordAdmsRejections(companyId, device.id, admsSn, rejections);
    } catch (err) {
      console.error('Failed to record ADMS punch rejections:', err?.message || err);
    }
  }

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
        valid_count: 0,
        duplicate_count: 0,
        skipped_unknown_codes: unknownCodes,
        skipped_wrong_branch_codes: wrongBranchCodes,
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

    await client.query(`UPDATE devices SET last_seen_at = NOW() WHERE id = $1`, [device.id]);

    await client.query('COMMIT');

    const insertedCount = insertResult.rowCount || 0;
    const validCount = validLogs.length;
    const duplicateCount = Math.max(0, validCount - insertedCount);

    const result = {
      inserted: insertedCount,
      valid_count: validCount,
      duplicate_count: duplicateCount,
    };
    if (unknownCodes.length > 0) result.skipped_unknown_codes = unknownCodes;
    if (wrongBranchCodes.length > 0) result.skipped_wrong_branch_codes = wrongBranchCodes;

    auditService
      .log(companyId, null, 'device.push', 'device', device.id, { logs_count: insertedCount })
      .catch(() => {});

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
  findActiveDeviceByCloudToken,
  findActiveDeviceByAdmsSn,
  createDevice,
  listDevices,
  updateDevice,
  toggleDeviceActive,
  regenerateApiKey,
  regenerateCloudToken,
  updateAdmsSerial,
  deleteDevice,
  processDeviceLogs,
};
