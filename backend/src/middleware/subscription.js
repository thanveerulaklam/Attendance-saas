const { getCompanyById, isSubscriptionAllowed, getSubscriptionStatus } = require('../services/companyService');

/**
 * Block request if company subscription is expired (beyond grace period).
 * Use after authenticate + enforceCompanyFromToken so req.companyId is set.
 * Returns 403 with message if subscription is not allowed.
 */
async function requireActiveSubscription(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const company = await getCompanyById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    if (isSubscriptionAllowed(company)) {
      return next();
    }

    const status = getSubscriptionStatus(company);
    const message = status.expired && !status.inGrace
      ? 'Subscription has expired. Please renew to continue using this feature.'
      : 'Subscription is inactive. Please contact support.';

    return res.status(403).json({
      success: false,
      message,
      code: 'SUBSCRIPTION_EXPIRED',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireActiveSubscription,
};
