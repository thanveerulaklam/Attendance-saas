const { generateMonthlyPayroll, listPayrollRecords } = require('../services/payrollService');
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
 * Body: { employee_id, year, month }
 */
async function generate(req, res, next) {
  try {
    const companyId = req.companyId;
    const { employee_id: employeeIdRaw, year: yearRaw, month: monthRaw } = req.body || {};

    const employeeId = Number(employeeIdRaw);
    const year = Number(yearRaw);
    const month = Number(monthRaw);

    if (!companyId || !employeeId || !year || !month) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token), employee_id, year and month are required',
      });
    }

    const result = await generateMonthlyPayroll(companyId, employeeId, year, month);

    auditService.log(companyId, req.user?.user_id, 'payroll.generate', 'payroll', result.payroll?.id, { employee_id: employeeId, year, month }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, generate };

