const { pool } = require('../config/database');

/**
 * Append an audit log entry. Does not throw; failures are logged to console.
 * @param {number} companyId - Required
 * @param {number|null} userId - User who performed the action (null for system/device)
 * @param {string} actionType - e.g. 'employee.create', 'payroll.generate', 'auth.login'
 * @param {string} entityType - e.g. 'employee', 'payroll', 'device', 'user', 'company'
 * @param {string|number|null} entityId - ID of the affected entity
 * @param {object} [metadata] - Optional extra data (stored as JSONB)
 */
async function log(companyId, userId, actionType, entityType, entityId, metadata = null) {
  if (!companyId || !actionType || !entityType) {
    return;
  }
  const client = await pool.connect().catch((err) => {
    console.error('Audit log: pool connect failed', err);
    return null;
  });
  if (!client) return;
  try {
    await client.query(
      `INSERT INTO audit_logs (company_id, user_id, action_type, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        companyId,
        userId ?? null,
        String(actionType).slice(0, 100),
        String(entityType).slice(0, 50),
        entityId != null ? String(entityId) : null,
        metadata != null ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    console.error('Audit log insert failed', err);
  } finally {
    client.release();
  }
}

/**
 * List audit logs for a company with pagination and optional filters.
 */
async function listAuditLogs(companyId, { page = 1, limit = 20, action_type: actionType, entity_type: entityType } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = ['company_id = $1'];
  const params = [companyId];
  let paramIndex = 2;

  if (actionType && String(actionType).trim() !== '') {
    conditions.push(`action_type = $${paramIndex}`);
    params.push(String(actionType).trim());
    paramIndex += 1;
  }
  if (entityType && String(entityType).trim() !== '') {
    conditions.push(`entity_type = $${paramIndex}`);
    params.push(String(entityType).trim());
    paramIndex += 1;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM audit_logs WHERE ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const listResult = await pool.query(
    `SELECT id, company_id, user_id, action_type, entity_type, entity_id, metadata, created_at
     FROM audit_logs
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limitNum, offset]
  );

  return {
    data: listResult.rows,
    page: pageNum,
    limit: limitNum,
    total,
  };
}

module.exports = {
  log,
  listAuditLogs,
};
