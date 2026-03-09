const express = require('express');
const {
  listPendingCompanies,
  getAdminOverview,
  updateCompanyBilling,
  approveCompany,
  declineCompany,
  lockCompany,
  unlockCompany,
} = require('../controllers/adminController');
const { requireApprovalSecret } = require('../middleware/approvalSecret');

const router = express.Router();

router.use(requireApprovalSecret);

router.get('/pending-companies', listPendingCompanies);
router.get('/overview', getAdminOverview);
router.post('/company-billing', updateCompanyBilling);
router.post('/approve-company', approveCompany);
router.post('/decline-company', declineCompany);
router.post('/lock-company', lockCompany);
router.post('/unlock-company', unlockCompany);

module.exports = router;
