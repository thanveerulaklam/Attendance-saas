const express = require('express');
const {
  attendanceCsv,
  payrollCsv,
  overtimeCsv,
  dailyCsv,
  esiCsv,
  pfCsv,
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
router.get('/esi.csv', withAuth, esiCsv);
router.get('/pf.csv', withAuth, pfCsv);
router.get('/daily.csv', withAuth, dailyCsv);

module.exports = router;
