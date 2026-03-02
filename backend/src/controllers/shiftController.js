const { listShifts, createShift, updateShift, deleteShift } = require('../services/shiftService');

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

/**
 * PUT /api/shifts/:id
 */
async function updateShiftHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    const shiftId = Number(req.params.id);

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }
    if (!Number.isInteger(shiftId) || shiftId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Valid shift id is required',
      });
    }

    const updated = await updateShift(companyId, shiftId, req.body || {});
    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/shifts/:id
 */
async function deleteShiftHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    const shiftId = Number(req.params.id);

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }
    if (!Number.isInteger(shiftId) || shiftId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Valid shift id is required',
      });
    }

    await deleteShift(companyId, shiftId);
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getShifts,
  createShiftHandler,
  updateShiftHandler,
  deleteShiftHandler,
};

