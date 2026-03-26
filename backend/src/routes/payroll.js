const express = require('express');
const { list, generate, generateAll, breakdown } = require('../controllers/payrollController');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
  attachBranchScopes,
  requireHrBranchForMutation,
} = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');

const router = express.Router();

const withAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];

router.get('/', withAuth, list);
router.get('/breakdown', withAuth, breakdown);

// Generate or regenerate payroll (blocked if subscription expired)
router.post('/generate', withAuth, requireHrBranchForMutation, requireActiveSubscription, generate);
// Generate payroll for all active employees for a given month
router.post(
  '/generate-all',
  withAuth,
  requireHrBranchForMutation,
  requireActiveSubscription,
  generateAll
);

module.exports = router;

