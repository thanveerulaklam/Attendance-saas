const { pool } = require('../config/database');

function syncIssueMessage(employeeCode, reason) {
  const code = String(employeeCode || '').trim();
  switch (reason) {
    case 'unknown_code':
      return `Employee code ${code} is on this device but not in PunchPay. Add an employee with code "${code}".`;
    case 'wrong_branch':
      return `Employee code ${code} is in PunchPay but belongs to a different branch than this device.`;
    case 'parse_failed':
      return 'Some punches from this device could not be read. Contact support if this continues.';
    default:
      return code && code !== '?'
        ? `Punch sync issue for employee code ${code}.`
        : 'Some punches from this device could not be synced.';
  }
}

/**
 * Recent punch sync issues per device (last 7 days), grouped for the Devices UI.
 */
async function getSyncIssuesByDeviceIds(companyId, deviceIds) {
  if (!companyId || !deviceIds || deviceIds.length === 0) {
    return new Map();
  }

  const result = await pool.query(
    `SELECT device_id,
            employee_code,
            reason,
            COUNT(*)::int AS attempt_count,
            MAX(created_at) AS last_seen_at
     FROM adms_punch_rejections
     WHERE company_id = $1
       AND device_id = ANY($2::bigint[])
       AND created_at >= NOW() - INTERVAL '7 days'
     GROUP BY device_id, employee_code, reason
     ORDER BY device_id, MAX(created_at) DESC`,
    [companyId, deviceIds]
  );

  const byDevice = new Map();
  for (const row of result.rows) {
    const deviceId = Number(row.device_id);
    if (!byDevice.has(deviceId)) byDevice.set(deviceId, []);
    byDevice.get(deviceId).push({
      employee_code: row.employee_code,
      reason: row.reason,
      message: syncIssueMessage(row.employee_code, row.reason),
      attempt_count: row.attempt_count,
      last_seen_at: row.last_seen_at,
    });
  }
  return byDevice;
}

/**
 * Persist punches we could not import so ops can recover them (never silent loss).
 */
async function recordAdmsRejections(companyId, deviceId, admsSn, rejections) {
  if (!rejections || rejections.length === 0) return;

  const values = [];
  const placeholders = [];
  rejections.forEach((r, idx) => {
    const base = idx * 7;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
    );
    values.push(
      companyId,
      deviceId,
      admsSn || null,
      String(r.employeeCode || '').trim(),
      r.punchTime instanceof Date ? r.punchTime.toISOString() : r.punchTime || null,
      r.reason,
      r.rawLine || null
    );
  });

  await pool.query(
    `INSERT INTO adms_punch_rejections
       (company_id, device_id, adms_sn, employee_code, punch_time, reason, raw_line)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

module.exports = { recordAdmsRejections, getSyncIssuesByDeviceIds, syncIssueMessage };
