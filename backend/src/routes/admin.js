const express = require('express');
const rateLimit = require('express-rate-limit');
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

const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.ADMIN_RATE_LIMIT_MAX || '10', 10),
  message: 'Too many admin attempts',
});

router.use(adminRateLimit);

router.use((req, res, next) => {
  // Basic audit trail for all admin actions
  // Includes method, path, IP, and timestamp
  // Avoid logging secrets or bodies
  // eslint-disable-next-line no-console
  console.log(`ADMIN ACTION: ${req.method} ${req.path} from IP ${req.ip} at ${new Date()}`);
  next();
});

router.use(requireApprovalSecret);

router.get('/pending-companies', listPendingCompanies);
router.get('/overview', getAdminOverview);
router.post('/company-billing', updateCompanyBilling);
router.post('/approve-company', approveCompany);
router.post('/decline-company', declineCompany);
router.post('/lock-company', lockCompany);
router.post('/unlock-company', unlockCompany);

module.exports = router;
