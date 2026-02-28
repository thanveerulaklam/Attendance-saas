const { listShifts, createShift } = require('../services/shiftService');

/**
 * GET /api/shifts
 */
async function getShifts(req, res, next) {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const { page, limit } = req.query || {};
    const result = await listShifts(companyId, { page, limit });

    return res.json({
      success: true,
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/shifts
 */
async function createShiftHandler(req, res, next) {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const created = await createShift(companyId, req.body || {});

    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getShifts,
  createShiftHandler,
};

