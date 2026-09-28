const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { haversineDistanceMeters } = require('../utils/geo');

const MIN_RADIUS_M = 50;
const MAX_RADIUS_M = 5000;
const DEFAULT_RADIUS_M = 200;

function parseCoord(value, label, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new AppError(`${label} is invalid`, 400);
  }
  return n;
}

function parseRadius(value) {
  if (value == null || value === '') return DEFAULT_RADIUS_M;
  const n = Number(value);
  if (!Number.isFinite(n) || n < MIN_RADIUS_M || n > MAX_RADIUS_M) {
    throw new AppError(`radius_m must be between ${MIN_RADIUS_M} and ${MAX_RADIUS_M}`, 400);
  }
  return Math.round(n);
}

function parseSiteName(value) {
  const name = String(value || '').trim();
  if (name.length < 2 || name.length > 120) {
    throw new AppError('Site name must be 2–120 characters', 400);
  }
  return name;
}

async function listFieldSites(companyId) {
  const result = await pool.query(
    `SELECT id, company_id, name, latitude, longitude, radius_m, created_at, updated_at
     FROM field_sites
     WHERE company_id = $1
     ORDER BY name ASC`,
    [companyId]
  );
  return result.rows;
}

async function getFieldSite(companyId, siteId) {
  const result = await pool.query(
    `SELECT id, company_id, name, latitude, longitude, radius_m, created_at, updated_at
     FROM field_sites
     WHERE company_id = $1 AND id = $2`,
    [companyId, siteId]
  );
  if (result.rowCount === 0) {
    throw new AppError('Field site not found', 404);
  }
  return result.rows[0];
}

async function createFieldSite(companyId, body) {
  const name = parseSiteName(body?.name);
  const latitude = parseCoord(body?.latitude, 'latitude', -90, 90);
  const longitude = parseCoord(body?.longitude, 'longitude', -180, 180);
  const radiusM = parseRadius(body?.radius_m);
  const result = await pool.query(
    `INSERT INTO field_sites (company_id, name, latitude, longitude, radius_m)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, company_id, name, latitude, longitude, radius_m, created_at, updated_at`,
    [companyId, name, latitude, longitude, radiusM]
  );
  return result.rows[0];
}

async function updateFieldSite(companyId, siteId, body) {
  const existing = await getFieldSite(companyId, siteId);
  const name = Object.prototype.hasOwnProperty.call(body, 'name')
    ? parseSiteName(body.name)
    : existing.name;
  const latitude = Object.prototype.hasOwnProperty.call(body, 'latitude')
    ? parseCoord(body.latitude, 'latitude', -90, 90)
    : Number(existing.latitude);
  const longitude = Object.prototype.hasOwnProperty.call(body, 'longitude')
    ? parseCoord(body.longitude, 'longitude', -180, 180)
    : Number(existing.longitude);
  const radiusM = Object.prototype.hasOwnProperty.call(body, 'radius_m')
    ? parseRadius(body.radius_m)
    : Number(existing.radius_m);

  const result = await pool.query(
    `UPDATE field_sites
     SET name = $3, latitude = $4, longitude = $5, radius_m = $6, updated_at = NOW()
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, name, latitude, longitude, radius_m, created_at, updated_at`,
    [companyId, siteId, name, latitude, longitude, radiusM]
  );
  if (result.rowCount === 0) {
    throw new AppError('Field site not found', 404);
  }
  return result.rows[0];
}

async function deleteFieldSite(companyId, siteId) {
  const result = await pool.query(
    `DELETE FROM field_sites
     WHERE company_id = $1 AND id = $2
     RETURNING id`,
    [companyId, siteId]
  );
  if (result.rowCount === 0) {
    throw new AppError('Field site not found', 404);
  }
  return { removed: true };
}

async function listAssignedFieldSites(companyId, employeeId) {
  const result = await pool.query(
    `SELECT s.id, s.company_id, s.name, s.latitude, s.longitude, s.radius_m
     FROM employee_field_sites efs
     INNER JOIN field_sites s ON s.id = efs.field_site_id AND s.company_id = efs.company_id
     WHERE efs.company_id = $1 AND efs.employee_id = $2
     ORDER BY s.name ASC`,
    [companyId, employeeId]
  );
  return result.rows;
}

async function listAssignedFieldSiteIds(companyId, employeeId) {
  const rows = await listAssignedFieldSites(companyId, employeeId);
  return rows.map((row) => Number(row.id));
}

async function setEmployeeFieldSites(companyId, employeeId, siteIds) {
  const ids = Array.isArray(siteIds)
    ? [...new Set(siteIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];

  if (ids.length > 0) {
    const found = await pool.query(
      `SELECT id FROM field_sites WHERE company_id = $1 AND id = ANY($2::bigint[])`,
      [companyId, ids]
    );
    if (found.rowCount !== ids.length) {
      throw new AppError('One or more field sites were not found', 400);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM employee_field_sites WHERE company_id = $1 AND employee_id = $2`,
      [companyId, employeeId]
    );
    for (const siteId of ids) {
      await client.query(
        `INSERT INTO employee_field_sites (employee_id, field_site_id, company_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (employee_id, field_site_id) DO NOTHING`,
        [employeeId, siteId, companyId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return listAssignedFieldSites(companyId, employeeId);
}

function findMatchingFieldSite(lat, lng, sites) {
  let best = null;
  for (const site of sites) {
    const distanceM = haversineDistanceMeters(
      lat,
      lng,
      Number(site.latitude),
      Number(site.longitude)
    );
    const radiusM = Number(site.radius_m) || DEFAULT_RADIUS_M;
    if (distanceM <= radiusM && (!best || distanceM < best.distanceM)) {
      best = { site, distanceM, radiusM };
    }
  }
  return best;
}

module.exports = {
  MIN_RADIUS_M,
  MAX_RADIUS_M,
  DEFAULT_RADIUS_M,
  listFieldSites,
  getFieldSite,
  createFieldSite,
  updateFieldSite,
  deleteFieldSite,
  listAssignedFieldSites,
  listAssignedFieldSiteIds,
  setEmployeeFieldSites,
  findMatchingFieldSite,
};
