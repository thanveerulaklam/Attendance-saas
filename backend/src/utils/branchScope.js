const { pool } = require('../config/database');

/**
 * Resolve effective branch scope for a request.
 * - requestedBranchId omitted: use allowedBranchIds as-is (null = all company branches for admin)
 * - requestedBranchId set: single-branch array after access + company checks
 */
async function resolveBranchScope({ companyId, allowedBranchIds, requestedBranchId }) {
  if (!requestedBranchId) return allowedBranchIds;

  const bid = Number(requestedBranchId);
  if (!Number.isInteger(bid) || bid < 1) {
    throw Object.assign(new Error('Invalid branch_id'), { status: 400 });
  }

  if (Array.isArray(allowedBranchIds) && !allowedBranchIds.includes(bid)) {
    throw Object.assign(new Error('Branch not allowed for your account'), { status: 403 });
  }

  const r = await pool.query(`SELECT id FROM branches WHERE company_id = $1 AND id = $2`, [
    companyId,
    bid,
  ]);
  if (r.rowCount === 0) {
    throw Object.assign(new Error('Branch not found'), { status: 404 });
  }

  return [bid];
}

module.exports = { resolveBranchScope };
