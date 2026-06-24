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

  const selectFields = `id, company_id, name, address, latitude, longitude, geofence_radius_m, created_at`;

  if (allowedBranchIds == null) {
    const result = await pool.query(
      `SELECT ${selectFields}
       FROM branches
       WHERE company_id = $1
       ORDER BY name ASC, id ASC`,
      [companyId]
    );
    return result.rows;
  }

  const result = await pool.query(
    `SELECT ${selectFields}
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
function parseOptionalCoord(value, label) {
  if (value === '' || value == null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return n;
}

function parseGeofenceRadius(value) {
  if (value === '' || value == null || value === undefined) return 200;
  const n = Math.round(Number(value));
  if (!Number.isInteger(n) || n < 50 || n > 5000) {
    throw new AppError('geofence_radius_m must be between 50 and 5000', 400);
  }
  return n;
}

async function createBranch(companyId, { name, address, latitude, longitude, geofence_radius_m }) {
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

  const lat = parseOptionalCoord(latitude, 'latitude');
  const lon = parseOptionalCoord(longitude, 'longitude');
  if ((lat == null) !== (lon == null)) {
    throw new AppError('Both latitude and longitude are required for geofence', 400);
  }
  if (lat != null && (lat < -90 || lat > 90)) {
    throw new AppError('latitude must be between -90 and 90', 400);
  }
  if (lon != null && (lon < -180 || lon > 180)) {
    throw new AppError('longitude must be between -180 and 180', 400);
  }
  const radiusM = parseGeofenceRadius(geofence_radius_m);

  const result = await pool.query(
    `INSERT INTO branches (company_id, name, address, latitude, longitude, geofence_radius_m)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, company_id, name, address, latitude, longitude, geofence_radius_m, created_at`,
    [companyId, trimmed, addr, lat, lon, radiusM]
  );

  return result.rows[0];
}

async function updateBranch(companyId, branchId, { name, address, latitude, longitude, geofence_radius_m }) {
  const id = Number(branchId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('Invalid branch id', 400);
  }

  const trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new AppError('Branch name is required', 400);
  }
  const addr = address != null && String(address).trim() !== '' ? String(address).trim() : null;

  const lat = parseOptionalCoord(latitude, 'latitude');
  const lon = parseOptionalCoord(longitude, 'longitude');
  if ((lat == null) !== (lon == null)) {
    throw new AppError('Both latitude and longitude are required for geofence', 400);
  }
  if (lat != null && (lat < -90 || lat > 90)) {
    throw new AppError('latitude must be between -90 and 90', 400);
  }
  if (lon != null && (lon < -180 || lon > 180)) {
    throw new AppError('longitude must be between -180 and 180', 400);
  }
  const radiusM = parseGeofenceRadius(geofence_radius_m);

  const result = await pool.query(
    `UPDATE branches
     SET name = $3, address = $4, latitude = $5, longitude = $6, geofence_radius_m = $7
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, name, address, latitude, longitude, geofence_radius_m, created_at`,
    [companyId, id, trimmed, addr, lat, lon, radiusM]
  );
  if (result.rowCount === 0) {
    throw new AppError('Branch not found', 404);
  }
  return result.rows[0];
}

async function deleteBranch(companyId, branchId) {
  const id = Number(branchId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('Invalid branch id', 400);
  }

  const branchRes = await pool.query(
    `SELECT id, name FROM branches WHERE company_id = $1 AND id = $2`,
    [companyId, id]
  );
  if (branchRes.rowCount === 0) {
    throw new AppError('Branch not found', 404);
  }

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM branches WHERE company_id = $1`,
    [companyId]
  );
  if (Number(countRes.rows[0]?.total || 0) <= 1) {
    throw new AppError('At least one branch is required. You cannot delete the last branch.', 400);
  }

  try {
    const result = await pool.query(
      `DELETE FROM branches
       WHERE company_id = $1 AND id = $2
       RETURNING id, company_id, name, address, created_at`,
      [companyId, id]
    );
    if (result.rowCount === 0) {
      throw new AppError('Branch not found', 404);
    }
    return result.rows[0];
  } catch (err) {
    if (err?.code === '23503') {
      throw new AppError(
        'Cannot delete this branch because employees, devices, attendance logs, or user assignments are linked to it.',
        400
      );
    }
    throw err;
  }
}

module.exports = {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
};
