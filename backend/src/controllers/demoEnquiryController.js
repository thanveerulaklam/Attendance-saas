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
    const { page, limit, status } = req.query || {};
    const data = await demoEnquiryService.listDemoEnquiries(null, { page, limit, status });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const enquiryId = req.params?.id != null ? Number(req.params.id) : null;
    const { status } = req.body || {};
    const data = await demoEnquiryService.updateDemoEnquiryStatus(enquiryId, status);
    return res.json({ success: true, data, message: 'Enquiry status updated.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, list, updateStatus };

