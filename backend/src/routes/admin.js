const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  listPendingCompanies,
  getAdminOverview,
  getCountryProfiles,
  listDemoEnquiries,
  getDemoEnquiryStats,
  getDemoEnquirySuggestions,
  createAdminDemoEnquiry,
  updateDemoEnquiryStatus,
  updateDemoEnquiryNotes,
  convertDemoEnquiry,
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
  getFinanceOverview,
  renewCompanySubscription,
  getRecentSuperadminAudit,
  getCompanyAudit,
  resetCompanyAdminPassword,
  deleteCompany,
} = require('../controllers/adminController');
const { requireApprovalSecret, requireAdminIpAllowlist } = require('../middleware/approvalSecret');

const router = express.Router();

// Count only failed admin responses (401/403) — slows brute-force on ADMIN_APPROVAL_SECRET.
const adminFailedAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.ADMIN_FAILED_AUTH_MAX || '10', 10),
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many failed admin authentication attempts. Try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Default is high enough for normal Super Admin use (page load fires several requests).
// Override with ADMIN_RATE_LIMIT_MAX if needed.
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.ADMIN_RATE_LIMIT_MAX || '400', 10),
  message: { success: false, message: 'Too many admin attempts. Try again in a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(adminFailedAuthLimiter);
router.use(adminRateLimit);
router.use(requireAdminIpAllowlist);

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
router.get('/country-profiles', getCountryProfiles);
router.get('/collections-queue', getCollectionsQueue);
router.get('/finance-overview', getFinanceOverview);
router.get('/company-details', getCompanyDetails);
router.get('/recent-superadmin-audit', getRecentSuperadminAudit);
router.get('/company-audit', getCompanyAudit);
router.post('/set-user-branch-assignments', setUserBranchAssignments);
router.post('/set-company-employee-limit', setCompanyEmployeeLimit);
router.post('/set-company-branch-limit', setCompanyBranchLimit);
router.post('/renew-company-subscription', renewCompanySubscription);
router.get('/demo-enquiries', listDemoEnquiries);
router.get('/demo-enquiry-stats', getDemoEnquiryStats);
router.get('/demo-enquiry-suggestions', getDemoEnquirySuggestions);
router.post('/demo-enquiries', createAdminDemoEnquiry);
router.post('/demo-enquiry-status', updateDemoEnquiryStatus);
router.post('/demo-enquiry-notes', updateDemoEnquiryNotes);
router.post('/convert-enquiry', convertDemoEnquiry);
router.post('/company-billing', updateCompanyBilling);
router.post('/create-company', createCompanyProvisioned);
router.post('/approve-company', approveCompany);
router.post('/decline-company', declineCompany);
router.post('/lock-company', lockCompany);
router.post('/unlock-company', unlockCompany);
router.post('/reset-company-admin-password', resetCompanyAdminPassword);
router.post('/delete-company', deleteCompany);

module.exports = router;
