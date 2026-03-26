const { listAdvances, upsertAdvance } = require('../services/advanceService');
const auditService = require('../services/auditService');

/**
 * GET /api/advances
 * Query: year?, month?, employee_id?
 */
async function list(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month, employee_id: employeeId } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const data = await listAdvances(companyId, {
      year,
      month,
      employee_id: employeeId,
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
 * POST /api/advances
 * Body: { employee_id, year, month, amount, note? }
 */
async function upsert(req, res, next) {
  try {
    const companyId = req.companyId;
    const body = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const record = await upsertAdvance(companyId, body, req.allowedBranchIds);

    auditService
      .log(companyId, req.user?.user_id, 'advance.upsert', 'employee_advance', record.id, {
        employee_id: record.employee_id,
        year: record.year,
        month: record.month,
        amount: record.amount,
      })
      .catch(() => {});

    return res.status(201).json({
      success: true,
      data: record,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, upsert };

