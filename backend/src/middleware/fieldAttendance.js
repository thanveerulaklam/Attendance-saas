const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { loadCompanyForMobile } = require('../services/mobileAttendanceService');

async function requireFieldAttendanceEnabled(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const company = await loadCompanyForMobile(companyId);
    if (!company.field_attendance_enabled) {
      return res.status(403).json({
        success: false,
        code: 'FIELD_DISABLED',
        message: 'Field attendance is not enabled for your company.',
      });
    }

    req.fieldCompany = company;
    return next();
  } catch (err) {
    return next(err);
  }
}

async function requireFieldAttendanceEnabledForAdmin(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const result = await pool.query(
      `SELECT field_attendance_enabled FROM companies WHERE id = $1`,
      [companyId]
    );
    if (result.rowCount === 0) {
      throw new AppError('Company not found', 404);
    }
    if (!result.rows[0].field_attendance_enabled) {
      return res.status(403).json({
        success: false,
        code: 'FIELD_DISABLED',
        message: 'Enable field attendance in company settings first.',
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireFieldAttendanceEnabled,
  requireFieldAttendanceEnabledForAdmin,
};
