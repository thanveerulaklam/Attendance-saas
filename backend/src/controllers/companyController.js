const { pool } = require('../config/database');
const {
  getCompanyById,
  updateCompany,
  updateSubscription,
  computeNextAmcDueDate,
  branchesAllowedTotal,
} = require('../services/companyService');
const { getEffectiveEmployeeLimit } = require('../services/employeeService');
const branchService = require('../services/branchService');
const { getFeaturesForCountry } = require('../config/region');

/**
 * GET /api/company
 * Returns the authenticated user's company.
 */
async function getCurrentCompany(req, res, next) {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const company = await getCompanyById(companyId);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    const [effective_employee_limit, branchCountRes, branches] = await Promise.all([
      getEffectiveEmployeeLimit(companyId),
      pool.query(`SELECT COUNT(*)::int AS n FROM branches WHERE company_id = $1`, [companyId]),
      branchService.listBranches(companyId, req.allowedBranchIds),
    ]);

    const branch_count = Number(branchCountRes.rows[0]?.n || 0);
    const next_amc_due_date = computeNextAmcDueDate(company);
    const branches_allowed_total = branchesAllowedTotal(company);

    const companyRest = { ...company };
    delete companyRest.billing_notes;

    return res.json({
      success: true,
      data: {
        ...companyRest,
        region_features: getFeaturesForCountry(company.country_code),
        next_amc_due_date,
        access_valid_until: company.subscription_end_date,
        effective_employee_limit,
        branches_allowed_total,
        branch_count,
        branches: Array.isArray(branches) ? branches : [],
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/company
 * Update basic company profile fields (name, phone, address).
 */
async function updateCurrentCompany(req, res, next) {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const body = req.body || {};
    const patch = {};
    const keys = [
      'name',
      'phone',
      'address',
      'paid_leave_forfeit_if_absence_gt',
      'whatsapp_auto_enabled',
      'whatsapp_primary_number',
      'whatsapp_secondary_number',
      'whatsapp_send_time',
      'enable_shift_rotation',
      'flexible_hours_mode',
      'mol_establishment_id',
      'bank_routing_code',
    ];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        patch[key] = body[key];
      }
    }

    const updated = await updateCompany(companyId, patch);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    return res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/company/subscription
 * Admin only. Body: { subscription_start_date?, subscription_end_date?, is_active? }
 */
async function updateSubscriptionHandler(req, res, next) {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const updated = await updateSubscription(companyId, {
      subscription_start_date: req.body?.subscription_start_date,
      subscription_end_date: req.body?.subscription_end_date,
      is_active: req.body?.is_active,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    return res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/company/branches
 * Lists branches (all for admin; HR only sees assigned branches).
 */
async function listBranchesHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const data = await branchService.listBranches(companyId, req.allowedBranchIds);
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/company/branches
 * Admin only. Body: { name, address? }
 */
async function createBranchHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const created = await branchService.createBranch(companyId, {
      name: req.body?.name,
      address: req.body?.address,
    });

    return res.status(201).json({
      success: true,
      data: created,
      message: 'Branch created',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/company/branches/:id
 * Admin only. Body: { name, address? }
 */
async function updateBranchHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const updated = await branchService.updateBranch(companyId, req.params.id, {
      name: req.body?.name,
      address: req.body?.address,
    });

    return res.json({
      success: true,
      data: updated,
      message: 'Branch updated',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/company/branches/:id
 * Admin only.
 */
async function deleteBranchHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const deleted = await branchService.deleteBranch(companyId, req.params.id);
    return res.json({
      success: true,
      data: deleted,
      message: 'Branch deleted',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCurrentCompany,
  updateCurrentCompany,
  updateSubscriptionHandler,
  listBranchesHandler,
  createBranchHandler,
  updateBranchHandler,
  deleteBranchHandler,
};

