const {
  getAttendanceReportCsv,
  getPayrollReportCsv,
  getOvertimeReportCsv,
  getDailyReportCsv,
  getEsiReportCsv,
  getPfReportCsv,
  getSalaryPaymentsReportCsv,
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

    const csv = await getAttendanceReportCsv(companyId, year, month, req.allowedBranchIds);
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

    const csv = await getPayrollReportCsv(companyId, year, month, req.allowedBranchIds);
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

    const csv = await getOvertimeReportCsv(companyId, year, month, req.allowedBranchIds);
    const filename = `overtime-${year}-${String(month).padStart(2, '0')}.csv`;
    setCsvHeaders(res, filename);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/daily.csv?date=YYYY-MM-DD&department=
 */
async function dailyCsv(req, res, next) {
  try {
    const companyId = req.companyId;
    const { date, department } = req.query || {};

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

    const dept = department ? String(department).trim() : null;
    const csv = await getDailyReportCsv(companyId, date.trim(), dept, req.allowedBranchIds);
    const filename = `daily-attendance-${date.trim()}.csv`;
    setCsvHeaders(res, filename);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/esi.csv?year=&month=
 */
async function esiCsv(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const csv = await getEsiReportCsv(companyId, year, month, req.allowedBranchIds);
    const filename = `esi-statement-${year}-${String(month).padStart(2, '0')}.csv`;
    setCsvHeaders(res, filename);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/pf.csv?year=&month=
 */
async function pfCsv(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const csv = await getPfReportCsv(companyId, year, month, req.allowedBranchIds);
    const filename = `pf-statement-${year}-${String(month).padStart(2, '0')}.csv`;
    setCsvHeaders(res, filename);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/salary-payments.csv?year=&month=
 */
async function salaryPaymentsCsv(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const csv = await getSalaryPaymentsReportCsv(companyId, year, month, req.allowedBranchIds);
    const filename = `salary-payments-${year}-${String(month).padStart(2, '0')}.csv`;
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
  dailyCsv,
  esiCsv,
  pfCsv,
  salaryPaymentsCsv,
};
