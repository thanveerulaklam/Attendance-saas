const { getDashboardSummary } = require('../services/dashboardService');

async function summary(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }
    const data = await getDashboardSummary(companyId);
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { summary };
