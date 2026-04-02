const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  listPendingCompanies,
  getAdminOverview,
  listDemoEnquiries,
  updateCompanyBilling,
  createCompanyProvisioned,
  approveCompany,
  declineCompany,
  lockCompany,
  unlockCompany,
  getCompanyDetails,
  setUserBranchAssignments,
  setCompanyEmployeeLimit,
  setCompanyBranchLimit,
  getCollectionsQueue,
  renewCompanySubscription,
  getRecentSuperadminAudit,
  getCompanyAudit,
  resetCompanyAdminPassword,
} = require('../controllers/adminController');
const { requireApprovalSecret } = require('../middleware/approvalSecret');

const router = express.Router();

// Default is high enough for normal Super Admin use (page load fires several requests).
// Override with ADMIN_RATE_LIMIT_MAX if needed.
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.ADMIN_RATE_LIMIT_MAX || '400', 10),
  message: { success: false, message: 'Too many admin attempts. Try again in a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
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
router.get('/collections-queue', getCollectionsQueue);
router.get('/company-details', getCompanyDetails);
router.get('/recent-superadmin-audit', getRecentSuperadminAudit);
router.get('/company-audit', getCompanyAudit);
router.post('/set-user-branch-assignments', setUserBranchAssignments);
router.post('/set-company-employee-limit', setCompanyEmployeeLimit);
router.post('/set-company-branch-limit', setCompanyBranchLimit);
router.post('/renew-company-subscription', renewCompanySubscription);
router.get('/demo-enquiries', listDemoEnquiries);
router.post('/company-billing', updateCompanyBilling);
router.post('/create-company', createCompanyProvisioned);
router.post('/approve-company', approveCompany);
router.post('/decline-company', declineCompany);
router.post('/lock-company', lockCompany);
router.post('/unlock-company', unlockCompany);
router.post('/reset-company-admin-password', resetCompanyAdminPassword);

module.exports = router;
