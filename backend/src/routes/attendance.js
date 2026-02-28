const express = require('express');
const { getDaily, getMonthly } = require('../controllers/attendanceController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

const withAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

router.get('/daily', withAuth, getDaily);
router.get('/monthly', withAuth, getMonthly);

module.exports = router;
