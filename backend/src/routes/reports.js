const express = require('express');
const {
  attendanceCsv,
  payrollCsv,
  overtimeCsv,
  dailyCsv,
} = require('../controllers/reportsController');
const { authenticate, requireRole, enforceCompanyFromToken, attachBranchScopes } = require('../middleware/auth');

const router = express.Router();

const withAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];

router.get('/attendance.csv', withAuth, attendanceCsv);
router.get('/payroll.csv', withAuth, payrollCsv);
router.get('/overtime.csv', withAuth, overtimeCsv);
router.get('/daily.csv', withAuth, dailyCsv);

module.exports = router;
