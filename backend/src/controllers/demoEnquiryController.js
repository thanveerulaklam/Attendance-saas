const demoEnquiryService = require('../services/demoEnquiryService');

async function create(req, res, next) {
  try {
    const body = req.body || {};
    const data = await demoEnquiryService.createDemoEnquiry(null, body);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const { page, limit } = req.query || {};
    const data = await demoEnquiryService.listDemoEnquiries(null, { page, limit });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, list };

