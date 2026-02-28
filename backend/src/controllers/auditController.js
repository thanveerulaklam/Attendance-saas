const { listAuditLogs } = require('../services/auditService');

/**
 * GET /api/audit
 * Query: page?, limit?, action_type?, entity_type?
 * Auth: admin only (or admin/hr per plan - implementation plan says "admin only" for viewer)
 */
async function list(req, res, next) {
  try {
    const companyId = req.companyId;
    const { page, limit, action_type: actionType, entity_type: entityType } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const result = await listAuditLogs(companyId, {
      page,
      limit,
      action_type: actionType,
      entity_type: entityType,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
