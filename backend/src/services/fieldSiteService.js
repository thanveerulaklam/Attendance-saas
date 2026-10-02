const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { haversineDistanceMeters } = require('../utils/geo');
const { suggestNextEmployeeCode } = require('../utils/employeeCode');
const { todayIstYmd } = require('../utils/istDate');
const employeeService = require('./employeeService');
const employeeAppService = require('./employeeAppService');

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

async function nextFieldEmployeeCode(companyId) {
  const result = await pool.query(
    `SELECT employee_code FROM employees WHERE company_id = $1`,
    [companyId]
  );
  const next = suggestNextEmployeeCode(result.rows.map((row) => row.employee_code));
  return next || `F${Date.now().toString().slice(-6)}`;
}

async function listFieldEmployees(companyId, allowedBranchIds = null) {
  const params = [companyId];
  let branchClause = '';
  if (allowedBranchIds != null) {
    if (allowedBranchIds.length === 0) return [];
    params.push(allowedBranchIds);
    branchClause = ` AND e.branch_id = ANY($2::bigint[])`;
  }

  const result = await pool.query(
    `SELECT
       e.id,
       e.name,
       e.employee_code,
       e.status,
       e.attendance_channel,
       e.department,
       COALESCE(e.field_beat_enabled, FALSE) AS field_beat_enabled,
       u.email AS app_email,
       COALESCE(ARRAY_REMOVE(ARRAY_AGG(efs.field_site_id ORDER BY s.name ASC), NULL), '{}') AS field_site_ids,
       COALESCE(ARRAY_REMOVE(ARRAY_AGG(s.name ORDER BY s.name ASC), NULL), '{}') AS field_site_names
     FROM employees e
     LEFT JOIN users u
       ON u.company_id = e.company_id AND u.employee_id = e.id AND u.role = 'employee'
     LEFT JOIN employee_field_sites efs
       ON efs.company_id = e.company_id AND efs.employee_id = e.id
     LEFT JOIN field_sites s
       ON s.id = efs.field_site_id AND s.company_id = e.company_id
     WHERE e.company_id = $1 AND e.status = 'active'${branchClause}
     GROUP BY e.id, u.email
     ORDER BY LOWER(TRIM(e.name)) ASC, e.id ASC`,
    params
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    employee_code: row.employee_code,
    status: row.status,
    attendance_channel: row.attendance_channel || 'device',
    department: row.department,
    field_beat_enabled: Boolean(row.field_beat_enabled),
    app_email: row.app_email || null,
    field_site_ids: (row.field_site_ids || [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0),
    field_site_names: (row.field_site_names || []).filter(Boolean),
  }));
}

async function createFieldEmployee(companyId, body = {}, branchContext = {}) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  let employeeCode = String(body.employee_code || '').trim();
  const siteIds = body.site_ids || body.field_site_ids || [];
  const basicSalary = body.basic_salary;
  const joinDate = String(body.join_date || '').trim() || todayIstYmd();
  const attendanceChannel = body.attendance_channel === 'both' ? 'both' : 'mobile';
  const fieldBeatEnabled = Boolean(body.field_beat_enabled);

  if (name.length < 2) {
    throw new AppError('Name must be at least 2 characters', 400);
  }
  if (!email) {
    throw new AppError('Email is required for PunchPay Field login', 400);
  }
  if (!password || password.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400);
  }
  if (basicSalary == null || basicSalary === '' || Number(basicSalary) <= 0) {
    throw new AppError('Basic salary is required', 400);
  }

  if (!employeeCode) {
    employeeCode = await nextFieldEmployeeCode(companyId);
  }

  const employee = await employeeService.createEmployee(
    companyId,
    {
      name,
      employee_code: employeeCode,
      basic_salary: Number(basicSalary),
      join_date: joinDate,
      status: 'active',
      attendance_channel: attendanceChannel,
      ...(body.branch_id != null && body.branch_id !== '' ? { branch_id: Number(body.branch_id) } : {}),
    },
    branchContext
  );

  const sites = await setEmployeeFieldSites(companyId, employee.id, siteIds);
  if (fieldBeatEnabled) {
    await pool.query(
      `UPDATE employees SET field_beat_enabled = TRUE WHERE company_id = $1 AND id = $2`,
      [companyId, employee.id]
    );
  }
  const login = await employeeAppService.provisionEmployeeAppAccess(companyId, employee.id, {
    email,
    password,
    name,
  });

  return {
    id: Number(employee.id),
    name: employee.name,
    employee_code: employee.employee_code,
    status: employee.status,
    attendance_channel: employee.attendance_channel || attendanceChannel,
    department: employee.department,
    app_email: login.user.email,
    field_beat_enabled: fieldBeatEnabled,
    field_site_ids: sites.map((site) => Number(site.id)),
    field_site_names: sites.map((site) => site.name),
  };
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
  listFieldEmployees,
  createFieldEmployee,
  findMatchingFieldSite,
};
