const express = require('express');
const {
  list,
  generate,
  generateAll,
  breakdown,
  listWeekly,
  generateWeekly,
  generateAllWeekly,
  breakdownWeekly,
  updateAdvanceDeduction,
  updateWeeklyAdvanceDeduction,
  updateManualAdvance,
  updateWeeklyManualAdvance,
  setPayrollAttendanceOverride,
  setWeeklyPayrollAttendanceOverride,
} = require('../controllers/payrollController');
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
router.patch(
  '/:id/advance-deduction',
  withAuth,
  requireHrBranchForMutation,
  requireActiveSubscription,
  updateAdvanceDeduction
);
router.patch(
  '/:id/manual-advance',
  withAuth,
  requireHrBranchForMutation,
  requireActiveSubscription,
  updateManualAdvance
);
router.post(
  '/:id/attendance-override',
  withAuth,
  requireHrBranchForMutation,
  requireActiveSubscription,
  setPayrollAttendanceOverride
);

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

// Weekly payroll (Sun–Sat)
router.get('/weekly', withAuth, listWeekly);
router.get('/weekly/breakdown', withAuth, breakdownWeekly);
router.patch(
  '/weekly/:id/advance-deduction',
  withAuth,
  requireHrBranchForMutation,
  requireActiveSubscription,
  updateWeeklyAdvanceDeduction
);
router.patch(
  '/weekly/:id/manual-advance',
  withAuth,
  requireHrBranchForMutation,
  requireActiveSubscription,
  updateWeeklyManualAdvance
);
router.post(
  '/weekly/:id/attendance-override',
  withAuth,
  requireHrBranchForMutation,
  requireActiveSubscription,
  setWeeklyPayrollAttendanceOverride
);

router.post(
  '/generate-weekly',
  withAuth,
  requireHrBranchForMutation,
  requireActiveSubscription,
  generateWeekly
);

router.post(
  '/generate-all-weekly',
  withAuth,
  requireHrBranchForMutation,
  requireActiveSubscription,
  generateAllWeekly
);

module.exports = router;

