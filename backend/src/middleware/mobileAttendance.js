const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { loadCompanyForMobile } = require('../services/mobileAttendanceService');

/**
 * Block request if company mobile_attendance_enabled is false.
 * Use after authenticate + enforceCompanyFromToken.
 */
async function requireMobileAttendanceEnabled(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const company = await loadCompanyForMobile(companyId);
    if (!company.mobile_attendance_enabled) {
      return res.status(403).json({
        success: false,
        code: 'MOBILE_DISABLED',
        message: 'Mobile attendance is not enabled for your company.',
      });
    }

    req.mobileCompany = company;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin/HR: ensure mobile attendance is enabled before QR display endpoints.
 */
async function requireMobileAttendanceEnabledForAdmin(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const result = await pool.query(
      `SELECT mobile_attendance_enabled FROM companies WHERE id = $1`,
      [companyId]
    );
    if (result.rowCount === 0) {
      throw new AppError('Company not found', 404);
    }
    if (!result.rows[0].mobile_attendance_enabled) {
      return res.status(403).json({
        success: false,
        code: 'MOBILE_DISABLED',
        message: 'Enable mobile attendance in company settings first.',
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireMobileAttendanceEnabled,
  requireMobileAttendanceEnabledForAdmin,
};
