const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const employeeService = require('../services/employeeService');
const {
  listFieldSites,
  createFieldSite,
  updateFieldSite,
  deleteFieldSite,
  listAssignedFieldSites,
  setEmployeeFieldSites,
} = require('../services/fieldSiteService');

const branchContext = (req) => ({
  role: req.user?.role,
  allowedBranchIds: req.allowedBranchIds,
  defaultBranchId: req.defaultBranchId,
});

async function updateFieldSettings(req, res, next) {
  try {
    const companyId = req.companyId;
    if (typeof req.body?.field_attendance_enabled !== 'boolean') {
      throw new AppError('field_attendance_enabled (boolean) is required', 400);
    }

    const result = await pool.query(
      `UPDATE companies
       SET field_attendance_enabled = $2
       WHERE id = $1
       RETURNING id, name, field_attendance_enabled`,
      [companyId, req.body.field_attendance_enabled]
    );

    if (result.rowCount === 0) {
      throw new AppError('Company not found', 404);
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return next(err);
  }
}

async function listSites(req, res, next) {
  try {
    const sites = await listFieldSites(req.companyId);
    return res.json({ success: true, data: sites });
  } catch (err) {
    return next(err);
  }
}

async function createSite(req, res, next) {
  try {
    const site = await createFieldSite(req.companyId, req.body || {});
    return res.status(201).json({ success: true, data: site });
  } catch (err) {
    return next(err);
  }
}

async function updateSite(req, res, next) {
  try {
    const siteId = Number(req.params.id);
    if (!siteId) throw new AppError('Invalid site id', 400);
    const site = await updateFieldSite(req.companyId, siteId, req.body || {});
    return res.json({ success: true, data: site });
  } catch (err) {
    return next(err);
  }
}

async function removeSite(req, res, next) {
  try {
    const siteId = Number(req.params.id);
    if (!siteId) throw new AppError('Invalid site id', 400);
    await deleteFieldSite(req.companyId, siteId);
    return res.json({ success: true, message: 'Field site deleted' });
  } catch (err) {
    return next(err);
  }
}

async function getEmployeeSites(req, res, next) {
  try {
    const employeeId = Number(req.params.id);
    if (!employeeId) throw new AppError('Invalid employee id', 400);
    await employeeService.getEmployeeById(req.companyId, employeeId, branchContext(req));
    const sites = await listAssignedFieldSites(req.companyId, employeeId);
    return res.json({
      success: true,
      data: {
        sites,
        site_ids: sites.map((s) => Number(s.id)),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function putEmployeeSites(req, res, next) {
  try {
    const employeeId = Number(req.params.id);
    if (!employeeId) throw new AppError('Invalid employee id', 400);
    await employeeService.getEmployeeById(req.companyId, employeeId, branchContext(req));
    const sites = await setEmployeeFieldSites(
      req.companyId,
      employeeId,
      req.body?.site_ids || req.body?.field_site_ids || []
    );
    return res.json({
      success: true,
      data: {
        sites,
        site_ids: sites.map((s) => Number(s.id)),
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  updateFieldSettings,
  listSites,
  createSite,
  updateSite,
  removeSite,
  getEmployeeSites,
  putEmployeeSites,
};
