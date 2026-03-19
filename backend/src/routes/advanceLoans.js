const express = require('express');
const {
  listLoans,
  createLoan,
  getEmployeeLoans,
  getMonthly,
  waive,
  getOne,
  updateRepayment,
  skip,
} = require('../controllers/advanceLoanController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();
const withAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

router.get('/', withAuth, listLoans);
router.post('/', withAuth, createLoan);
router.get('/employee/:employeeId', withAuth, getEmployeeLoans);
router.get('/monthly', withAuth, getMonthly);
router.put('/repayments/:repaymentId', withAuth, updateRepayment);
router.post('/repayments/:repaymentId/skip', withAuth, skip);
router.put('/:loanId/waive', withAuth, waive);
router.get('/:loanId', withAuth, getOne);

module.exports = router;
