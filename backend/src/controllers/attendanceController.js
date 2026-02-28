const { getDailyAttendance, getMonthlyAttendance } = require('../services/attendanceService');

/**
 * GET /api/attendance/daily?date=YYYY-MM-DD&employee_id=
 */
async function getDaily(req, res, next) {
  try {
    const companyId = req.companyId;
    const { date, employee_id: employeeId } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    if (!date || typeof date !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Query "date" (YYYY-MM-DD) is required',
      });
    }

    const eid = employeeId ? Number(employeeId) : null;
    const data = await getDailyAttendance(companyId, date.trim(), eid);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/attendance/monthly?year=&month=&employee_id=
 */
async function getMonthly(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month, employee_id: employeeId } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const y = Number(year);
    const m = Number(month);
    if (!y || !m) {
      return res.status(400).json({
        success: false,
        message: 'Query "year" and "month" are required',
      });
    }

    const eid = employeeId ? Number(employeeId) : null;
    const data = await getMonthlyAttendance(companyId, y, m, eid);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDaily,
  getMonthly,
};
