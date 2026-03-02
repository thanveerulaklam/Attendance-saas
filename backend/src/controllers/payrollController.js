const { generateMonthlyPayroll, generateMonthlyPayrollForAllActive, listPayrollRecords, getPayrollBreakdown } = require('../services/payrollService');
const auditService = require('../services/auditService');

/**
 * GET /api/payroll
 * Query: year?, month?, page?, limit?, employee_id?
 */
async function list(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month, page, limit, employee_id: employeeId } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const result = await listPayrollRecords(companyId, {
      year,
      month,
      page,
      limit,
      employee_id: employeeId,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payroll/generate
 * Auth: admin or hr (JWT)
 * Body: { employee_id, year, month, include_overtime?, treat_holiday_adjacent_absence_as_working? }
 */
async function generate(req, res, next) {
  try {
    const companyId = req.companyId;
    const {
      employee_id: employeeIdRaw,
      year: yearRaw,
      month: monthRaw,
      include_overtime: includeOvertimeRaw,
      treat_holiday_adjacent_absence_as_working: treatHolidayRaw,
      no_leave_incentive: noLeaveIncentiveRaw,
    } = req.body || {};

    const employeeId = Number(employeeIdRaw);
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const includeOvertime = includeOvertimeRaw !== false;
    const treatHolidayAdjacentAbsenceAsWorking = treatHolidayRaw === true;
    const noLeaveIncentive = Math.max(0, Number(noLeaveIncentiveRaw) || 0);

    if (!companyId || !employeeId || !year || !month) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token), employee_id, year and month are required',
      });
    }

    const result = await generateMonthlyPayroll(companyId, employeeId, year, month, {
      includeOvertime,
      treatHolidayAdjacentAbsenceAsWorking,
      noLeaveIncentive,
    });

    auditService.log(companyId, req.user?.user_id, 'payroll.generate', 'payroll', result.payroll?.id, { employee_id: employeeId, year, month }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payroll/generate-all
 * Body: { year, month, include_overtime?, treat_holiday_adjacent_absence_as_working? }
 * Generates payroll for all active employees for the given month.
 */
async function generateAll(req, res, next) {
  try {
    const companyId = req.companyId;
    const {
      year: yearRaw,
      month: monthRaw,
      include_overtime: includeOvertimeRaw,
      treat_holiday_adjacent_absence_as_working: treatHolidayRaw,
      no_leave_incentive: noLeaveIncentiveRaw,
    } = req.body || {};

    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const includeOvertime = includeOvertimeRaw !== false;
    const treatHolidayAdjacentAbsenceAsWorking = treatHolidayRaw === true;
    const noLeaveIncentive = Math.max(0, Number(noLeaveIncentiveRaw) || 0);

    if (!companyId || !year || !month || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token), year and month (1–12) are required',
      });
    }

    const result = await generateMonthlyPayrollForAllActive(companyId, year, month, {
      includeOvertime,
      treatHolidayAdjacentAbsenceAsWorking,
      noLeaveIncentive,
    });

    auditService.log(companyId, req.user?.user_id, 'payroll.generate_all', 'payroll', null, {
      year,
      month,
      generated: result.generated,
      failed: result.failed,
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/payroll/breakdown
 * Query: employee_id, year, month
 * Returns full payroll detail for one employee (attendance, deductions, advance, net) for the detail modal.
 */
async function breakdown(req, res, next) {
  try {
    const companyId = req.companyId;
    const { employee_id: employeeIdRaw, year: yearRaw, month: monthRaw } = req.query || {};

    const employeeId = Number(employeeIdRaw);
    const year = Number(yearRaw);
    const month = Number(monthRaw);

    if (!companyId || !employeeId || !year || !month || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token), employee_id, year and month (1–12) are required',
      });
    }

    const data = await getPayrollBreakdown(companyId, employeeId, year, month);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, generate, generateAll, breakdown };

