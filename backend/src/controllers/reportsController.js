const {
  getAttendanceReportCsv,
  getPayrollReportCsv,
  getOvertimeReportCsv,
} = require('../services/reportsService');

function setCsvHeaders(res, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

/**
 * GET /api/reports/attendance.csv?year=&month=
 */
async function attendanceCsv(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const csv = await getAttendanceReportCsv(companyId, year, month);
    const filename = `attendance-${year}-${String(month).padStart(2, '0')}.csv`;
    setCsvHeaders(res, filename);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/payroll.csv?year=&month=
 */
async function payrollCsv(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const csv = await getPayrollReportCsv(companyId, year, month);
    const filename = `payroll-${year}-${String(month).padStart(2, '0')}.csv`;
    setCsvHeaders(res, filename);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/overtime.csv?year=&month=
 */
async function overtimeCsv(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const csv = await getOvertimeReportCsv(companyId, year, month);
    const filename = `overtime-${year}-${String(month).padStart(2, '0')}.csv`;
    setCsvHeaders(res, filename);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  attendanceCsv,
  payrollCsv,
  overtimeCsv,
};
