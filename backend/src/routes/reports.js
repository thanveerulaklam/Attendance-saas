const express = require('express');
const {
  attendanceCsv,
  payrollCsv,
  overtimeCsv,
} = require('../controllers/reportsController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

const withAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

router.get('/attendance.csv', withAuth, attendanceCsv);
router.get('/payroll.csv', withAuth, payrollCsv);
router.get('/overtime.csv', withAuth, overtimeCsv);

module.exports = router;
