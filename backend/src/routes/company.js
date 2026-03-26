const express = require('express');
const {
  getCurrentCompany,
  updateCurrentCompany,
  updateSubscriptionHandler,
  listBranchesHandler,
  createBranchHandler,
} = require('../controllers/companyController');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
  attachBranchScopes,
} = require('../middleware/auth');

const router = express.Router();

const withCompanyAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];
const withBranchScope = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];
const adminOnly = [authenticate, requireRole(['admin']), enforceCompanyFromToken];

// GET /api/company
router.get('/', withCompanyAuth, getCurrentCompany);

// PUT /api/company
router.put('/', withCompanyAuth, updateCurrentCompany);

// Branches (list: admin+hr with HR scope; create: admin only)
router.get('/branches', withBranchScope, listBranchesHandler);
router.post('/branches', adminOnly, createBranchHandler);

// POST /api/company/subscription (admin only)
router.post('/subscription', adminOnly, updateSubscriptionHandler);

module.exports = router;

