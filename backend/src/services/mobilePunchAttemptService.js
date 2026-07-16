const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseDateParam(value, label) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return d;
}

/**
 * List mobile punch attempts for admin/HR audit.
 */
async function listMobilePunchAttempts(companyId, options = {}) {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(options.limit) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, Number(options.offset) || 0);
  const status = options.status ? String(options.status).trim().toLowerCase() : null;
  const branchId = options.branchId != null ? Number(options.branchId) : null;
  const employeeId = options.employeeId != null ? Number(options.employeeId) : null;
  const allowedBranchIds = options.allowedBranchIds;

  if (status && !['accepted', 'rejected'].includes(status)) {
    throw new AppError('status must be accepted or rejected', 400);
  }
  if (branchId != null && !branchId) {
    throw new AppError('Invalid branch id', 400);
  }
  if (employeeId != null && !employeeId) {
    throw new AppError('Invalid employee id', 400);
  }

  if (allowedBranchIds != null && allowedBranchIds.length === 0) {
    return { items: [], total: 0, limit, offset };
  }

  const dateFrom = parseDateParam(options.dateFrom, 'date_from');
  const dateTo = parseDateParam(options.dateTo, 'date_to');

  const params = [companyId];
  const where = ['mpa.company_id = $1'];

  if (allowedBranchIds != null) {
    params.push(allowedBranchIds);
    where.push(`mpa.branch_id = ANY($${params.length}::bigint[])`);
  }

  if (branchId) {
    if (allowedBranchIds != null && !allowedBranchIds.includes(branchId)) {
      throw new AppError('Branch not found', 404);
    }
    params.push(branchId);
    where.push(`mpa.branch_id = $${params.length}`);
  }

  if (employeeId) {
    params.push(employeeId);
    where.push(`mpa.employee_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    where.push(`mpa.status = $${params.length}`);
  }

  if (dateFrom) {
    params.push(dateFrom.toISOString());
    where.push(`mpa.created_at >= $${params.length}`);
  }

  if (dateTo) {
    params.push(dateTo.toISOString());
    where.push(`mpa.created_at <= $${params.length}`);
  }

  const whereSql = where.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM mobile_punch_attempts mpa
     WHERE ${whereSql}`,
    params
  );

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const result = await pool.query(
    `SELECT
       mpa.id,
       mpa.employee_id,
       mpa.branch_id,
       mpa.status,
       mpa.reject_reason,
       mpa.latitude,
       mpa.longitude,
       mpa.location_accuracy_m,
       mpa.qr_nonce,
       mpa.client_ip,
       mpa.created_at,
       e.name AS employee_name,
       e.employee_code,
       b.name AS branch_name
     FROM mobile_punch_attempts mpa
     LEFT JOIN employees e ON e.id = mpa.employee_id AND e.company_id = mpa.company_id
     LEFT JOIN branches b ON b.id = mpa.branch_id AND b.company_id = mpa.company_id
     WHERE ${whereSql}
     ORDER BY mpa.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return {
    items: result.rows,
    total: countResult.rows[0]?.total ?? 0,
    limit,
    offset,
  };
}

module.exports = {
  listMobilePunchAttempts,
};
