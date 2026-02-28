const { getOnboardingStatus } = require('../services/onboardingService');

/**
 * GET /api/onboarding/status
 * Auth: admin or hr (JWT)
 */
async function getStatus(req, res, next) {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const status = await getOnboardingStatus(companyId);

    return res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStatus,
};

