const express = require('express');
const {
  attendanceCsv,
  payrollCsv,
  overtimeCsv,
  dailyCsv,
  esiCsv,
  pfCsv,
  wpsCsv,
  salaryPaymentsCsv,
  payrollOverview,
} = require('../controllers/reportsController');
const { authenticate, requireRole, enforceCompanyFromToken, attachBranchScopes } = require('../middleware/auth');

const router = express.Router();

const withAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];

router.get('/payroll-overview', withAuth, payrollOverview);
router.get('/attendance.csv', withAuth, attendanceCsv);
router.get('/payroll.csv', withAuth, payrollCsv);
router.get('/overtime.csv', withAuth, overtimeCsv);
router.get('/esi.csv', withAuth, esiCsv);
router.get('/pf.csv', withAuth, pfCsv);
router.get('/wps.csv', withAuth, wpsCsv);
router.get('/salary-payments.csv', withAuth, salaryPaymentsCsv);
router.get('/daily.csv', withAuth, dailyCsv);

module.exports = router;
