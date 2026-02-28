const express = require('express');
const { listPendingCompanies, approveCompany, declineCompany } = require('../controllers/adminController');
const { requireApprovalSecret } = require('../middleware/approvalSecret');

const router = express.Router();

router.use(requireApprovalSecret);

router.get('/pending-companies', listPendingCompanies);
router.post('/approve-company', approveCompany);
router.post('/decline-company', declineCompany);

module.exports = router;
