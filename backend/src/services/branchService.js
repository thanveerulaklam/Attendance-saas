const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

/**
 * List branches for a company. HR: only rows in allowedBranchIds; admin: all.
 * @param {number[]|null} allowedBranchIds
 */
async function listBranches(companyId, allowedBranchIds = null) {
  if (allowedBranchIds != null && allowedBranchIds.length === 0) {
    return [];
  }

  if (allowedBranchIds == null) {
    const result = await pool.query(
      `SELECT id, company_id, name, address, created_at
       FROM branches
       WHERE company_id = $1
       ORDER BY name ASC, id ASC`,
      [companyId]
    );
    return result.rows;
  }

  const result = await pool.query(
    `SELECT id, company_id, name, address, created_at
     FROM branches
     WHERE company_id = $1 AND id = ANY($2::bigint[])
     ORDER BY name ASC, id ASC`,
    [companyId, allowedBranchIds]
  );
  return result.rows;
}

/**
 * Create a branch (company admin only at API layer).
 */
async function createBranch(companyId, { name, address }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new AppError('Branch name is required', 400);
  }

  const addr = address != null && String(address).trim() !== '' ? String(address).trim() : null;

  const capResult = await pool.query(
    `SELECT branch_limit_override FROM companies WHERE id = $1`,
    [companyId]
  );
  if (capResult.rowCount === 0) {
    throw new AppError('Company not found', 404);
  }
  const capRaw = capResult.rows[0].branch_limit_override;
  // branch_limit_override = max ADDITIONAL branches beyond the initial Main branch.
  // NULL => no explicit cap; otherwise 0 means "no extra branches".
  const branchExtraCap = capRaw == null ? null : Number(capRaw);
  if (branchExtraCap != null) {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM branches WHERE company_id = $1`,
      [companyId]
    );
    const currentCount = Number(countResult.rows[0]?.total || 0);
    const maxTotalBranches = 1 + branchExtraCap;
    if (currentCount >= maxTotalBranches) {
      throw new AppError(
        'You have reached your branch limit for this account. Please contact support to add more branches.',
        403
      );
    }
  }

  const result = await pool.query(
    `INSERT INTO branches (company_id, name, address)
     VALUES ($1, $2, $3)
     RETURNING id, company_id, name, address, created_at`,
    [companyId, trimmed, addr]
  );

  return result.rows[0];
}

module.exports = {
  listBranches,
  createBranch,
};
