const express = require('express');
const {
  list,
  employeeStatement,
  payrollSummary,
  weeklySummary,
  outstanding,
  monthlySummary,
  create,
  update,
  remove,
} = require('../controllers/salaryPaymentController');
const { authenticate, requireRole, enforceCompanyFromToken, attachBranchScopes } = require('../middleware/auth');

const router = express.Router();
const withAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];

router.get('/', withAuth, list);
router.get('/outstanding', withAuth, outstanding);
router.get('/summary/monthly', withAuth, monthlySummary);
router.get('/employee/:employeeId', withAuth, employeeStatement);
router.get('/payroll/:payrollId', withAuth, payrollSummary);
router.get('/weekly/:weeklyPayrollId', withAuth, weeklySummary);
router.post('/', withAuth, create);
router.patch('/:id', withAuth, update);
router.delete('/:id', withAuth, remove);

module.exports = router;
