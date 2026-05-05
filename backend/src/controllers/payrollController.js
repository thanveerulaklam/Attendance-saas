const {
  generateMonthlyPayroll,
  generateMonthlyPayrollForAllActive,
  listPayrollRecords,
  getPayrollBreakdown,
  generateWeeklyPayroll,
  generateWeeklyPayrollForAllActive,
  listWeeklyPayrollRecords,
  getWeeklyPayrollBreakdown,
} = require('../services/payrollService');
const auditService = require('../services/auditService');

/**
 * GET /api/payroll
 * Query: year?, month?, page?, limit?, employee_id?
 */
async function list(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month, page, limit, employee_id: employeeId, branch_id: branchId } = req.query || {};

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
      branch_id: branchId,
      allowedBranchIds: req.allowedBranchIds,
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
      encash_unused_paid_leave: encashUnusedPaidLeaveRaw,
    } = req.body || {};

    const employeeId = Number(employeeIdRaw);
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const includeOvertime = includeOvertimeRaw !== false;
    const treatHolidayAdjacentAbsenceAsWorking = treatHolidayRaw === true;
    const hasNoLeaveIncentiveInput =
      noLeaveIncentiveRaw !== undefined &&
      noLeaveIncentiveRaw !== null &&
      String(noLeaveIncentiveRaw).trim() !== '';
    const noLeaveIncentive = hasNoLeaveIncentiveInput
      ? Math.max(0, Number(noLeaveIncentiveRaw) || 0)
      : undefined;
    const encashUnusedPaidLeave = encashUnusedPaidLeaveRaw === true;

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
      encashUnusedPaidLeave,
      allowedBranchIds: req.allowedBranchIds,
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
 * Body: { year, month, include_overtime?, treat_holiday_adjacent_absence_as_working?, apply_advance_repayments? }
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
      apply_advance_repayments: applyAdvanceRepaymentsRaw,
      no_leave_incentive: noLeaveIncentiveRaw,
      encash_unused_paid_leave: encashUnusedPaidLeaveRaw,
    } = req.body || {};

    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const includeOvertime = includeOvertimeRaw !== false;
    const treatHolidayAdjacentAbsenceAsWorking = treatHolidayRaw === true;
    const applyAdvanceRepayments = applyAdvanceRepaymentsRaw !== false;
    const hasNoLeaveIncentiveInput =
      noLeaveIncentiveRaw !== undefined &&
      noLeaveIncentiveRaw !== null &&
      String(noLeaveIncentiveRaw).trim() !== '';
    const noLeaveIncentive = hasNoLeaveIncentiveInput
      ? Math.max(0, Number(noLeaveIncentiveRaw) || 0)
      : undefined;
    const encashUnusedPaidLeave = encashUnusedPaidLeaveRaw === true;

    if (!companyId || !year || !month || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token), year and month (1–12) are required',
      });
    }

    const result = await generateMonthlyPayrollForAllActive(companyId, year, month, {
      includeOvertime,
      treatHolidayAdjacentAbsenceAsWorking,
      apply_advance_repayments: applyAdvanceRepayments,
      noLeaveIncentive,
      encashUnusedPaidLeave,
      allowedBranchIds: req.allowedBranchIds,
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

    const data = await getPayrollBreakdown(companyId, employeeId, year, month, {
      allowedBranchIds: req.allowedBranchIds,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/payroll/weekly
 * Query: week_start_date?, page?, limit?, employee_id?
 */
async function listWeekly(req, res, next) {
  try {
    const companyId = req.companyId;
    const { week_start_date: weekStartDate, page, limit, employee_id: employeeId, branch_id: branchId } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const result = await listWeeklyPayrollRecords(companyId, {
      week_start_date: weekStartDate,
      page,
      limit,
      employee_id: employeeId,
      branch_id: branchId,
      allowedBranchIds: req.allowedBranchIds,
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
 * POST /api/payroll/generate-weekly
 * Auth: admin or hr (JWT)
 * Body: { employee_id, week_start_date, include_overtime?, treat_holiday_adjacent_absence_as_working?, apply_salary_advances?, apply_advance_repayments? }
 */
async function generateWeekly(req, res, next) {
  try {
    const companyId = req.companyId;
    const {
      employee_id: employeeIdRaw,
      week_start_date: weekStartDateRaw,
      include_overtime: includeOvertimeRaw,
      treat_holiday_adjacent_absence_as_working: treatHolidayRaw,
      apply_salary_advances: applySalaryAdvancesRaw,
      apply_advance_repayments: applyAdvanceRepaymentsRaw,
    } = req.body || {};

    const employeeId = Number(employeeIdRaw);
    const weekStartDate = String(weekStartDateRaw || '').slice(0, 10);
    const includeOvertime = includeOvertimeRaw !== false;
    const treatHolidayAdjacentAbsenceAsWorking = treatHolidayRaw === true;

    const applySalaryAdvances = applySalaryAdvancesRaw !== false;
    const applyAdvanceRepayments = applyAdvanceRepaymentsRaw !== false;

    if (!companyId || !employeeId || !weekStartDate) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token), employee_id, and week_start_date are required',
      });
    }

    const result = await generateWeeklyPayroll(companyId, employeeId, weekStartDate, {
      includeOvertime,
      treatHolidayAdjacentAbsenceAsWorking,
      allowedBranchIds: req.allowedBranchIds,
      apply_salary_advances: applySalaryAdvances,
      apply_advance_repayments: applyAdvanceRepayments,
    });

    auditService
      .log(companyId, req.user?.user_id, 'payroll.generate_weekly', 'payroll', result.payroll?.id, {
        employee_id: employeeId,
        week_start_date: weekStartDate,
      })
      .catch(() => {});

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payroll/generate-all-weekly
 * Body: { week_start_date, include_overtime?, treat_holiday_adjacent_absence_as_working?, apply_salary_advances?, apply_advance_repayments? }
 */
async function generateAllWeekly(req, res, next) {
  try {
    const companyId = req.companyId;
    const {
      week_start_date: weekStartDateRaw,
      include_overtime: includeOvertimeRaw,
      treat_holiday_adjacent_absence_as_working: treatHolidayRaw,
      apply_salary_advances: applySalaryAdvancesRaw,
      apply_advance_repayments: applyAdvanceRepaymentsRaw,
    } = req.body || {};

    const weekStartDate = String(weekStartDateRaw || '').slice(0, 10);
    const includeOvertime = includeOvertimeRaw !== false;
    const treatHolidayAdjacentAbsenceAsWorking = treatHolidayRaw === true;
    const applySalaryAdvances = applySalaryAdvancesRaw !== false;
    const applyAdvanceRepayments = applyAdvanceRepaymentsRaw !== false;

    if (!companyId || !weekStartDate) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) and week_start_date are required',
      });
    }

    const result = await generateWeeklyPayrollForAllActive(companyId, weekStartDate, {
      includeOvertime,
      treatHolidayAdjacentAbsenceAsWorking,
      allowedBranchIds: req.allowedBranchIds,
      apply_salary_advances: applySalaryAdvances,
      apply_advance_repayments: applyAdvanceRepayments,
    });

    auditService
      .log(companyId, req.user?.user_id, 'payroll.generate_all_weekly', 'payroll', null, {
        week_start_date: weekStartDate,
        generated: result.generated,
        failed: result.failed,
      })
      .catch(() => {});

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/payroll/weekly/breakdown
 * Query: employee_id, week_start_date
 */
async function breakdownWeekly(req, res, next) {
  try {
    const companyId = req.companyId;
    const { employee_id: employeeIdRaw, week_start_date: weekStartDateRaw } = req.query || {};

    const employeeId = Number(employeeIdRaw);
    const weekStartDate = String(weekStartDateRaw || '').slice(0, 10);

    if (!companyId || !employeeId || !weekStartDate) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token), employee_id, and week_start_date are required',
      });
    }

    const data = await getWeeklyPayrollBreakdown(companyId, employeeId, weekStartDate, {
      allowedBranchIds: req.allowedBranchIds,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    // Helpful for debugging weekly payslip issues (e.g. missing DB columns / serialization mismatches).
    if (res.headersSent) return;
    return res.status(500).json({
      success: false,
      message: err?.message || 'Internal server error',
    });
  }
}

module.exports = { list, generate, generateAll, breakdown, listWeekly, generateWeekly, generateAllWeekly, breakdownWeekly };


