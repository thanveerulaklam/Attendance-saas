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
