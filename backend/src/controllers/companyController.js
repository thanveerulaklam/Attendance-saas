const { getCompanyById, updateCompany, updateSubscription } = require('../services/companyService');
const branchService = require('../services/branchService');

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

    return res.json({
      success: true,
      data: company,
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

    const updated = await updateCompany(companyId, {
      name: req.body.name,
      phone: req.body.phone,
      address: req.body.address,
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

module.exports = {
  getCurrentCompany,
  updateCurrentCompany,
  updateSubscriptionHandler,
  listBranchesHandler,
  createBranchHandler,
};

