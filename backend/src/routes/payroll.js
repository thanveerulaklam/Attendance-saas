const express = require('express');
const { list, generate } = require('../controllers/payrollController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');

const router = express.Router();

const withAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

router.get('/', withAuth, list);

// Generate or regenerate payroll (blocked if subscription expired)
router.post('/generate', withAuth, requireActiveSubscription, generate);

module.exports = router;

